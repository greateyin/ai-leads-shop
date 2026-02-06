import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, createTenantPrisma } from "@/lib/db";

/**
 * Session 類型擴展
 */
export interface AuthenticatedSession {
    user: {
        id: string;
        email?: string | null;
        name?: string | null;
        role: string;
        tenantId: string;
    };
    /** 自動注入 tenantId 的 Prisma client，所有查詢/更新/建立都會帶上 tenantId */
    tenantDb: ReturnType<typeof createTenantPrisma>;
}

/**
 * 已認證的 API Handler 類型
 */
export type AuthenticatedHandler<T = unknown> = (
    request: NextRequest,
    session: AuthenticatedSession,
    context?: T
) => Promise<NextResponse>;

/**
 * 允許的角色類型
 */
export type UserRole = "OWNER" | "ADMIN" | "STAFF" | "VIEWER" | "CUSTOMER";

/**
 * withAuth 選項
 */
export interface WithAuthOptions {
    /** 允許的角色列表。若為空則只檢查登入狀態 */
    roles?: UserRole[];
    /** 是否需要屬於當前租戶 (預設 true) */
    requireTenant?: boolean;
}

/**
 * withAuth - 認證與授權中介層
 *
 * 包裝 API Route Handler，自動處理：
 * 1. Session 驗證 (未登入返回 401)
 * 2. 角色檢查 (權限不足返回 403)
 * 3. 租戶檢查 (選擇性)
 *
 * @param handler - 已認證的 handler 函式
 * @param options - 配置選項 (角色列表、租戶要求等)
 *
 * @example
 * // 只需登入
 * export const GET = withAuth(async (req, session) => {
 *   return NextResponse.json({ user: session.user });
 * });
 *
 * @example
 * // 需要特定角色
 * export const POST = withAuth(async (req, session) => {
 *   // 只有 OWNER 或 ADMIN 可執行
 *   return NextResponse.json({ success: true });
 * }, { roles: ["OWNER", "ADMIN"] });
 *
 * @example
 * // 不需要租戶 (例如公開 API)
 * export const GET = withAuth(async (req, session) => {
 *   return NextResponse.json({ data: "public" });
 * }, { requireTenant: false });
 */
export function withAuth<T = unknown>(
    handler: AuthenticatedHandler<T>,
    options: WithAuthOptions = {}
) {
    const { roles = [], requireTenant = true } = options;

    return async (
        request: NextRequest,
        context?: T
    ): Promise<NextResponse> => {
        try {
            const session = await auth();

            // 1. 檢查是否已登入
            if (!session?.user?.id) {
                return NextResponse.json(
                    {
                        success: false,
                        error: { code: "UNAUTHORIZED", message: "請先登入" },
                    },
                    { status: 401 }
                );
            }

            // 2. 檢查是否有租戶 (若需要)
            if (requireTenant && !session.user.tenantId) {
                return NextResponse.json(
                    {
                        success: false,
                        error: { code: "UNAUTHORIZED", message: "請先選擇租戶" },
                    },
                    { status: 401 }
                );
            }

            // 2.5 [安全] 驗證使用者確實仍屬於該租戶（防止被移除後繼續存取）
            if (requireTenant && session.user.tenantId) {
                const membership = await db.userTenant.findFirst({
                    where: {
                        userId: session.user.id,
                        tenantId: session.user.tenantId as string,
                        status: "ACTIVE",
                    },
                    select: { role: true },
                });

                if (!membership) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: { code: "FORBIDDEN", message: "您已不屬於此租戶" },
                        },
                        { status: 403 }
                    );
                }

                // 使用 DB 中的實際角色，而非 session 快取的角色
                session.user.role = membership.role;
            }

            // 3. 檢查角色權限 (若有指定)
            if (roles.length > 0) {
                const userRole = (session.user.role as UserRole) || "CUSTOMER";
                if (!roles.includes(userRole)) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: { code: "FORBIDDEN", message: "權限不足" },
                        },
                        { status: 403 }
                    );
                }
            }

            // 4. 建立 tenant-scoped DB client 並呼叫 handler
            const tenantId = (session.user.tenantId as string) || "";
            const authenticatedSession: AuthenticatedSession = {
                user: {
                    id: session.user.id,
                    email: session.user.email,
                    name: session.user.name,
                    role: (session.user.role as string) || "CUSTOMER",
                    tenantId,
                },
                tenantDb: tenantId ? createTenantPrisma(tenantId) : db as unknown as ReturnType<typeof createTenantPrisma>,
            };

            return await handler(request, authenticatedSession, context);
        } catch (error) {
            console.error("withAuth error:", error);
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "INTERNAL_ERROR", message: "認證錯誤" },
                },
                { status: 500 }
            );
        }
    };
}

/**
 * 便捷函式：需要 OWNER 或 ADMIN 角色
 */
export function withAdminAuth<T = unknown>(handler: AuthenticatedHandler<T>) {
    return withAuth(handler, { roles: ["OWNER", "ADMIN"] });
}

/**
 * 便捷函式：需要 OWNER、ADMIN 或 STAFF 角色
 */
export function withStaffAuth<T = unknown>(handler: AuthenticatedHandler<T>) {
    return withAuth(handler, { roles: ["OWNER", "ADMIN", "STAFF"] });
}

/**
 * 便捷函式：只需登入，不檢查角色
 */
export function withUserAuth<T = unknown>(handler: AuthenticatedHandler<T>) {
    return withAuth(handler, { roles: [] });
}
