import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { sendEmail } from "@/lib/email";
import crypto from "crypto";

/**
 * 邀請成員 Schema
 */
const inviteUserSchema = z.object({
    email: z.string().email("Email 格式錯誤"),
    role: z.enum(["ADMIN", "STAFF", "VIEWER"]),
    message: z.string().optional(),
});

/**
 * POST /api/users/invite
 * 邀請成員加入租戶
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId || !session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const body = await request.json();
        const validation = inviteUserSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "資料格式錯誤",
                        details: validation.error.flatten(),
                    },
                },
                { status: 400 }
            );
        }

        const { email, role, message } = validation.data;
        const tenantId = session.user.tenantId;

        // 驗證發送者權限 (只有 OWNER 或 ADMIN 可邀請)
        const senderTenant = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: session.user.id,
                    tenantId,
                },
            },
        });

        if (!senderTenant || !["OWNER", "ADMIN"].includes(senderTenant.role)) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無權限邀請成員" } },
                { status: 403 }
            );
        }

        // 檢查是否已經是成員
        const existingUser = await db.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            const existingMembership = await db.userTenant.findUnique({
                where: {
                    userId_tenantId: {
                        userId: existingUser.id,
                        tenantId,
                    },
                },
            });

            if (existingMembership) {
                return NextResponse.json(
                    { success: false, error: { code: "CONFLICT", message: "此用戶已是團隊成員" } },
                    { status: 409 }
                );
            }
        }

        // 檢查是否有待處理的邀請
        const existingInvite = await db.tenantInvite.findFirst({
            where: {
                tenantId,
                email,
                status: "PENDING",
                expiresAt: { gt: new Date() },
            },
        });

        if (existingInvite) {
            return NextResponse.json(
                { success: false, error: { code: "CONFLICT", message: "已有待處理的邀請" } },
                { status: 409 }
            );
        }

        // 生成邀請 token
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 天有效

        // 創建邀請記錄
        const invite = await db.tenantInvite.create({
            data: {
                id: generateId(),
                tenantId,
                email,
                role,
                token,
                invitedBy: session.user.id,
                expiresAt,
                status: "PENDING",
            },
        });

        // 取得租戶名稱
        const tenant = await db.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true },
        });

        // 發送邀請信
        const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/accept?token=${token}`;

        try {
            await sendEmail({
                to: email,
                subject: `您被邀請加入 ${tenant?.name || "團隊"}`,
                html: `
          <h2>團隊邀請</h2>
          <p>您被邀請加入 <strong>${tenant?.name || "團隊"}</strong>，角色為 <strong>${role}</strong>。</p>
          ${message ? `<p>邀請訊息：${message}</p>` : ""}
          <p>請點擊下方連結接受邀請（7 天內有效）：</p>
          <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
            接受邀請
          </a>
          <p style="margin-top: 16px; color: #666;">
            如果上方按鈕無法點擊，請複製以下連結到瀏覽器：<br/>
            ${inviteUrl}
          </p>
        `,
            });
        } catch (emailError) {
            console.error("發送邀請信失敗:", emailError);
            // 即使信件發送失敗，邀請仍然有效
        }

        // 記錄審計日誌
        await db.auditLog.create({
            data: {
                id: generateId(),
                tenantId,
                userId: session.user.id,
                action: "INVITE_USER",
                entityType: "TenantInvite",
                entityId: invite.id,
                newValue: { email, role },
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                inviteId: invite.id,
                email,
                role,
                expiresAt,
            },
            message: "邀請已發送",
        });
    } catch (error) {
        console.error("邀請成員錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "邀請成員失敗" } },
            { status: 500 }
        );
    }
}

/**
 * GET /api/users/invite
 * 取得待處理的邀請列表
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId || !session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const tenantId = session.user.tenantId;

        // 驗證權限
        const userTenant = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: session.user.id,
                    tenantId,
                },
            },
        });

        if (!userTenant || !["OWNER", "ADMIN"].includes(userTenant.role)) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無權限查看邀請" } },
                { status: 403 }
            );
        }

        const invites = await db.tenantInvite.findMany({
            where: { tenantId },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
                inviter: {
                    select: { name: true, email: true },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: invites.map((inv) => ({
                id: inv.id,
                email: inv.email,
                role: inv.role,
                status: inv.status,
                expiresAt: inv.expiresAt,
                invitedBy: inv.inviter,
                createdAt: inv.createdAt,
            })),
        });
    } catch (error) {
        console.error("取得邀請列表錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "取得邀請列表失敗" } },
            { status: 500 }
        );
    }
}
