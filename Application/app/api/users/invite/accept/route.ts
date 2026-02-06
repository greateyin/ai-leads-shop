import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { generateId } from "@/lib/id";

/**
 * 接受邀請 Schema
 */
const acceptInviteSchema = z.object({
    token: z.string().min(1, "Token 為必填"),
});

/**
 * POST /api/users/invite/accept
 * 接受邀請加入租戶
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validation = acceptInviteSchema.safeParse(body);

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

        const { token } = validation.data;

        // 查找邀請
        const invite = await db.tenantInvite.findUnique({
            where: { token },
            include: {
                tenant: { select: { id: true, name: true } },
            },
        });

        if (!invite) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "邀請不存在" } },
                { status: 404 }
            );
        }

        if (invite.status !== "PENDING") {
            return NextResponse.json(
                { success: false, error: { code: "INVALID_STATUS", message: "邀請已被處理" } },
                { status: 400 }
            );
        }

        if (new Date() > invite.expiresAt) {
            // 更新邀請狀態為過期
            await db.tenantInvite.update({
                where: { id: invite.id },
                data: { status: "EXPIRED" },
            });

            return NextResponse.json(
                { success: false, error: { code: "EXPIRED", message: "邀請已過期" } },
                { status: 400 }
            );
        }

        // 檢查用戶是否已登入
        const { session } = await authWithTenant({ requireTenant: false });

        if (!session?.user?.id) {
            // 未登入，返回需要登入的資訊
            return NextResponse.json({
                success: false,
                error: {
                    code: "REQUIRES_AUTH",
                    message: "請先登入或註冊後再接受邀請",
                    data: {
                        email: invite.email,
                        tenantName: invite.tenant.name,
                        role: invite.role,
                    },
                },
            }, { status: 401 });
        }

        // 檢查登入用戶的 email 是否匹配
        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, email: true },
        });

        if (user?.email !== invite.email) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "EMAIL_MISMATCH",
                        message: `此邀請是發送給 ${invite.email}，請使用該帳號登入`,
                    },
                },
                { status: 403 }
            );
        }

        // 檢查是否已是成員
        const existingMembership = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: session.user.id,
                    tenantId: invite.tenantId,
                },
            },
        });

        if (existingMembership) {
            // 更新邀請狀態
            await db.tenantInvite.update({
                where: { id: invite.id },
                data: { status: "ACCEPTED" },
            });

            return NextResponse.json({
                success: true,
                data: {
                    tenantId: invite.tenantId,
                    tenantName: invite.tenant.name,
                    role: existingMembership.role,
                },
                message: "您已是團隊成員",
            });
        }

        // 創建成員關係
        await db.userTenant.create({
            data: {
                id: generateId(),
                userId: session.user.id,
                tenantId: invite.tenantId,
                role: invite.role,
            },
        });

        // 更新邀請狀態
        await db.tenantInvite.update({
            where: { id: invite.id },
            data: { status: "ACCEPTED" },
        });

        // 記錄審計日誌
        await db.auditLog.create({
            data: {
                id: generateId(),
                tenantId: invite.tenantId,
                userId: session.user.id,
                action: "ACCEPT_INVITE",
                entityType: "UserTenant",
                entityId: session.user.id,
                newValue: { role: invite.role },
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                tenantId: invite.tenantId,
                tenantName: invite.tenant.name,
                role: invite.role,
            },
            message: "已成功加入團隊",
        });
    } catch (error) {
        console.error("接受邀請錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "接受邀請失敗" } },
            { status: 500 }
        );
    }
}
