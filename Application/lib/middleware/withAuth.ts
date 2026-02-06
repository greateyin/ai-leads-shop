/**
 * @deprecated 此檔案已棄用，請改用 `@/lib/api/with-auth.ts` 或 `@/lib/api/auth-helpers.ts`。
 * 此版本使用小寫角色名稱（owner/admin/staff），與現行系統的大寫角色（OWNER/ADMIN/STAFF/VIEWER）不一致。
 * 且未包含 status=ACTIVE 過濾、membership DB 驗證等安全機制。
 *
 * withAuth - Unified authentication middleware for API Route Handlers
 *
 * As specified in program_spec.md:
 * "權限中介 | withAuth(handler, roles) | handler: Next.js Route Handler | 若 session 不存在或角色不符則返回 403"
 *
 * Usage:
 * ```ts
 * export const GET = withAuth(async (req, { session }) => {
 *   // session is guaranteed to exist
 *   return NextResponse.json({ user: session.user });
 * });
 *
 * // With role restriction
 * export const DELETE = withAuth(
 *   async (req, { session }) => {
 *     // Only admins/owners can access
 *     return NextResponse.json({ success: true });
 *   },
 *   ["admin", "owner"]
 * );
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Session } from "next-auth";

// Extend Session type for our use case
export interface AuthContext {
    session: Session & {
        user: {
            id: string;
            email: string;
            name?: string | null;
            role: string;
            tenantId: string;
        };
    };
}

export type AuthenticatedHandler<T = unknown> = (
    req: NextRequest,
    ctx: AuthContext
) => Promise<NextResponse<T>>;

export type AuthenticatedHandlerWithParams<T = unknown, P = Record<string, string>> = (
    req: NextRequest,
    ctx: AuthContext & { params: P }
) => Promise<NextResponse<T>>;

/**
 * Higher-order function to wrap API handlers with authentication
 *
 * @param handler - The API handler function
 * @param allowedRoles - Optional array of roles that can access this endpoint
 * @returns Wrapped handler with authentication
 */
export function withAuth<T = unknown>(
    handler: AuthenticatedHandler<T>,
    allowedRoles?: string[]
): (req: NextRequest) => Promise<NextResponse<T | { error: string }>> {
    return async (req: NextRequest) => {
        try {
            const session = await auth();

            // Check if session exists
            if (!session?.user?.id) {
                return NextResponse.json(
                    { error: "Unauthorized - Please login to access this resource" },
                    { status: 401 }
                ) as NextResponse<{ error: string }>;
            }

            // Check role if specified
            if (allowedRoles && allowedRoles.length > 0) {
                const userRole = session.user.role || "customer";
                if (!allowedRoles.includes(userRole)) {
                    return NextResponse.json(
                        { error: `Forbidden - Required role: ${allowedRoles.join(" or ")}` },
                        { status: 403 }
                    ) as NextResponse<{ error: string }>;
                }
            }

            // Call the handler with the authenticated context
            return handler(req, { session: session as AuthContext["session"] });
        } catch (error) {
            console.error("withAuth error:", error);
            return NextResponse.json(
                { error: "Authentication error" },
                { status: 500 }
            ) as NextResponse<{ error: string }>;
        }
    };
}

/**
 * Version of withAuth for handlers with route parameters
 *
 * Usage:
 * ```ts
 * export const GET = withAuthParams<ResponseType, { id: string }>(
 *   async (req, { session, params }) => {
 *     const { id } = params;
 *     return NextResponse.json({ id });
 *   }
 * );
 * ```
 */
export function withAuthParams<T = unknown, P = Record<string, string>>(
    handler: AuthenticatedHandlerWithParams<T, P>,
    allowedRoles?: string[]
): (
    req: NextRequest,
    context: { params: Promise<P> }
) => Promise<NextResponse<T | { error: string }>> {
    return async (req: NextRequest, context: { params: Promise<P> }) => {
        try {
            const session = await auth();

            // Check if session exists
            if (!session?.user?.id) {
                return NextResponse.json(
                    { error: "Unauthorized - Please login to access this resource" },
                    { status: 401 }
                ) as NextResponse<{ error: string }>;
            }

            // Check role if specified
            if (allowedRoles && allowedRoles.length > 0) {
                const userRole = session.user.role || "customer";
                if (!allowedRoles.includes(userRole)) {
                    return NextResponse.json(
                        { error: `Forbidden - Required role: ${allowedRoles.join(" or ")}` },
                        { status: 403 }
                    ) as NextResponse<{ error: string }>;
                }
            }

            // Await params for Next.js 15+ compatibility
            const params = await context.params;

            // Call the handler with the authenticated context
            return handler(req, {
                session: session as AuthContext["session"],
                params,
            });
        } catch (error) {
            console.error("withAuthParams error:", error);
            return NextResponse.json(
                { error: "Authentication error" },
                { status: 500 }
            ) as NextResponse<{ error: string }>;
        }
    };
}

/**
 * Role constants for consistency
 */
export const Roles = {
    OWNER: "owner",
    ADMIN: "admin",
    STAFF: "staff",
    CUSTOMER: "customer",
} as const;

/**
 * Common role combinations
 */
export const RoleGroups = {
    /** Owner and Admin only */
    ADMINS: [Roles.OWNER, Roles.ADMIN],
    /** Owner, Admin, and Staff */
    STAFF_AND_ABOVE: [Roles.OWNER, Roles.ADMIN, Roles.STAFF],
    /** All authenticated users */
    ALL: [Roles.OWNER, Roles.ADMIN, Roles.STAFF, Roles.CUSTOMER],
} as const;
