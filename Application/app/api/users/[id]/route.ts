import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 更新用戶 Schema
 */
const updateUserSchema = z.object({
    role: z.enum(["ADMIN", "STAFF"]).optional(),
});

/**
 * GET /api/users/[id]
 * 取得用戶資訊
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId || !session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const { id } = await params;
        const tenantId = session.user.tenantId;

        // 取得目標用戶在此租戶的成員資料
        const userTenant = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: id,
                    tenantId,
                },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!userTenant) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "用戶不存在或非團隊成員" } },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                id: userTenant.user.id,
                name: userTenant.user.name,
                email: userTenant.user.email,
                role: userTenant.role,
                joinedAt: userTenant.createdAt,
            },
        });
    } catch (error) {
        console.error("取得用戶資訊錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "取得用戶資訊失敗" } },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/users/[id]
 * 更新用戶角色或狀態
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId || !session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const { id } = await params;
        const tenantId = session.user.tenantId;
        const body = await request.json();
        const validation = updateUserSchema.safeParse(body);

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

        // 驗證操作者權限
        const operatorTenant = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: session.user.id,
                    tenantId,
                },
            },
        });

        if (!operatorTenant || !["OWNER", "ADMIN"].includes(operatorTenant.role)) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無權限更新成員" } },
                { status: 403 }
            );
        }

        // 取得目標用戶
        const targetTenant = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: id,
                    tenantId,
                },
            },
        });

        if (!targetTenant) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "用戶不存在或非團隊成員" } },
                { status: 404 }
            );
        }

        // 不能修改 OWNER
        if (targetTenant.role === "OWNER") {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無法修改擁有者" } },
                { status: 403 }
            );
        }

        // 不能修改自己
        if (id === session.user.id) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無法修改自己的權限" } },
                { status: 403 }
            );
        }

        const { role } = validation.data;
        const oldRole = targetTenant.role;

        // 更新成員資料
        const updated = await db.userTenant.update({
            where: {
                userId_tenantId: {
                    userId: id,
                    tenantId,
                },
            },
            data: {
                ...(role && { role }),
            },
            include: {
                user: {
                    select: { name: true, email: true },
                },
            },
        });

        // 記錄審計日誌
        await db.auditLog.create({
            data: {
                id: generateId(),
                tenantId,
                userId: session.user.id,
                action: "UPDATE_USER_ROLE",
                entityType: "UserTenant",
                entityId: id,
                oldValue: { role: oldRole },
                newValue: { role: updated.role },
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                id,
                name: updated.user.name,
                email: updated.user.email,
                role: updated.role,
            },
            message: "成員資料已更新",
        });
    } catch (error) {
        console.error("更新用戶錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "更新用戶失敗" } },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/users/[id]
 * 從租戶移除成員
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId || !session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const { id } = await params;
        const tenantId = session.user.tenantId;

        // 驗證操作者權限
        const operatorTenant = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: session.user.id,
                    tenantId,
                },
            },
        });

        if (!operatorTenant || !["OWNER", "ADMIN"].includes(operatorTenant.role)) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無權限移除成員" } },
                { status: 403 }
            );
        }

        // 取得目標用戶
        const targetTenant = await db.userTenant.findUnique({
            where: {
                userId_tenantId: {
                    userId: id,
                    tenantId,
                },
            },
            include: {
                user: { select: { name: true, email: true } },
            },
        });

        if (!targetTenant) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "用戶不存在或非團隊成員" } },
                { status: 404 }
            );
        }

        // 不能移除 OWNER
        if (targetTenant.role === "OWNER") {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無法移除擁有者" } },
                { status: 403 }
            );
        }

        // 不能移除自己
        if (id === session.user.id) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無法移除自己" } },
                { status: 403 }
            );
        }

        // 刪除成員關係
        await db.userTenant.delete({
            where: {
                userId_tenantId: {
                    userId: id,
                    tenantId,
                },
            },
        });

        // 記錄審計日誌
        await db.auditLog.create({
            data: {
                id: generateId(),
                tenantId,
                userId: session.user.id,
                action: "REMOVE_USER",
                entityType: "UserTenant",
                entityId: id,
                oldValue: { email: targetTenant.user.email, role: targetTenant.role },
            },
        });

        return NextResponse.json({
            success: true,
            data: { id },
            message: "成員已移除",
        });
    } catch (error) {
        console.error("移除用戶錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "移除用戶失敗" } },
            { status: 500 }
        );
    }
}
