/**
 * 租戶認證輔助函式
 *
 * 為尚未遷移至 withAuth 的 API 路由提供 auth() + membership check 的防護。
 * 用法：直接取代 `const session = await auth()` → `const result = await authWithTenant()`
 *
 * @example
 * ```typescript
 * const { session, tenantId } = await authWithTenant();
 * if (!session) {
 *   return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
 * }
 * // session.user.tenantId 已驗證為有效 membership
 * ```
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 驗證結果介面
 */
export interface TenantAuthResult {
    /** 已驗證的 session（null 表示未登入或無有效租戶） */
    session: {
        user: {
            id: string;
            email?: string | null;
            name?: string | null;
            role: string;
            tenantId: string;
        };
    } | null;
    /** 驗證後的 tenantId（空字串表示無租戶） */
    tenantId: string;
    /** 錯誤原因（debug 用） */
    error?: string;
}

/**
 * authWithTenant - 帶租戶 membership 驗證的認證函式
 *
 * 執行步驟：
 * 1. 呼叫 auth() 取得 session
 * 2. 檢查 session.user.id 是否存在
 * 3. 檢查 session.user.tenantId 是否存在
 * 4. [安全] 查詢 DB 確認 userTenant 關聯仍然存在
 * 5. 使用 DB 中的實際角色（而非 session 快取的角色）
 *
 * @param options - 配置選項
 * @param options.requireTenant - 是否需要租戶（預設 true）
 * @returns TenantAuthResult
 */
export async function authWithTenant(
    options: { requireTenant?: boolean } = {}
): Promise<TenantAuthResult> {
    const { requireTenant = true } = options;

    const session = await auth();

    // 1. 未登入
    if (!session?.user?.id) {
        return { session: null, tenantId: "", error: "NOT_AUTHENTICATED" };
    }

    const tenantId = (session.user.tenantId as string) || "";

    // 2. 不需要租戶的場景（如公開 API）
    if (!requireTenant) {
        return {
            session: {
                user: {
                    id: session.user.id,
                    email: session.user.email,
                    name: session.user.name,
                    role: (session.user.role as string) || "CUSTOMER",
                    tenantId,
                },
            },
            tenantId,
        };
    }

    // 3. 需要租戶但 session 中沒有
    if (!tenantId) {
        return { session: null, tenantId: "", error: "NO_TENANT" };
    }

    // 4. [安全] DB 層級驗證：確認使用者仍屬於該租戶
    try {
        const membership = await db.userTenant.findFirst({
            where: {
                userId: session.user.id,
                tenantId,
            },
            select: { role: true },
        });

        if (!membership) {
            return { session: null, tenantId: "", error: "MEMBERSHIP_REVOKED" };
        }

        // 5. 使用 DB 中的實際角色
        return {
            session: {
                user: {
                    id: session.user.id,
                    email: session.user.email,
                    name: session.user.name,
                    role: membership.role,
                    tenantId,
                },
            },
            tenantId,
        };
    } catch {
        // DB 錯誤時拒絕存取
        return { session: null, tenantId: "", error: "DB_ERROR" };
    }
}
