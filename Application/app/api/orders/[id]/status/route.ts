import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";
import { authWithTenant } from "@/lib/api/auth-helpers";

/**
 * GET /api/orders/[id]/status?email=xxx
 * 查詢訂單付款狀態（輕量端點，供付款結果頁輪詢）
 *
 * 安全策略：
 * - Tenant 邊界：訂單必須屬於當前 tenant
 * - 登入用戶：session.userId 必須匹配 order.userId
 * - 訪客用戶：query param email 必須匹配 order.metadata.guestEmail
 * - 只回傳最少必要資訊（不含敏感資料）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    // ── 0. Tenant 邊界 ──
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "TENANT_NOT_FOUND", message: "無法解析租戶" } },
        { status: 400 }
      );
    }

    // 1. 查詢訂單（限定當前 tenant）
    const order = await db.order.findFirst({
      where: { id: orderId, tenantId: tenant.tenantId },
      select: {
        id: true,
        orderNo: true,
        status: true,
        paymentStatus: true,
        userId: true,
        metadata: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到訂單" } },
        { status: 404 }
      );
    }

    // ── 2. 身份驗證 ──
    const metadata = (order.metadata ?? {}) as Record<string, unknown>;
    const guestEmail = typeof metadata.guestEmail === "string" ? metadata.guestEmail : null;

    if (order.userId) {
      // 登入用戶訂單 → session 驗證
      const { session } = await authWithTenant({ requireTenant: false });
      if (!session || session.user.id !== order.userId) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "無權查詢此訂單" } },
          { status: 403 }
        );
      }
    } else if (guestEmail) {
      // 訪客訂單 → email query param 驗證
      const emailParam = request.nextUrl.searchParams.get("email");
      if (!emailParam || guestEmail.toLowerCase() !== emailParam.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "電子郵件驗證失敗" } },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "無法驗證訂單擁有者" } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    console.error("[OrderStatus] 查詢錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查詢失敗" } },
      { status: 500 }
    );
  }
}
