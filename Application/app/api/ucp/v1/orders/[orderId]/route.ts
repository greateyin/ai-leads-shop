/**
 * Google Merchant Shopping APIs v1 — Order by ID
 * GET /api/ucp/v1/orders/{orderId} — 查詢訂單
 *
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §4
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyUcpRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { getOrder } from "@/lib/ucp/handlers/orders";
import { toGoogleOrderResponse } from "@/lib/ucp/adapters/google";

/** Route params 型別 */
interface RouteParams {
    params: Promise<{ orderId: string }>;
}

/**
 * GET /api/ucp/v1/orders/{orderId}
 * @param request - 帶有 X-UCP-Api-Key 的請求
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const { orderId } = await params;

        // 驗證 UCP 請求
        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        const { tenantId, merchantId } = authResult.context!;

        // 委派給共用 handler
        const order = await getOrder(orderId, merchantId, tenantId);

        if (!order) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Order not found"),
                { status: 404 }
            );
        }

        // 內部格式 → Google v1 response
        return NextResponse.json(toGoogleOrderResponse(order));
    } catch (error) {
        console.error("[UCP v1 Orders GET] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
