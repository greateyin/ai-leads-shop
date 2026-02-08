/**
 * Google Merchant Shopping APIs v1 — Complete Checkout
 * POST /api/ucp/v1/checkout-sessions/{checkoutSessionId}/complete
 *
 * 完成結帳流程，建立正式訂單。
 *
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §3.3
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyUcpRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { createOrderFromSession } from "@/lib/ucp/handlers/orders";
import { fromGoogleCompleteCheckout, toGoogleOrderResponse } from "@/lib/ucp/adapters/google";

/** Route params 型別 */
interface RouteParams {
    params: Promise<{ checkoutSessionId: string }>;
}

const completeSchema = z.object({
    paymentInfo: z.object({
        paymentProcessorToken: z.string().optional(),
        paymentMethodType: z.string().optional(),
    }),
});

/**
 * POST /api/ucp/v1/checkout-sessions/{checkoutSessionId}/complete
 * @param request - Google v1 格式的 complete checkout 請求
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    // 提升到外層以便 catch 區塊存取
    const { checkoutSessionId } = await params;
    let tenantId = "";
    let merchantId = "";

    try {
        const body = await request.json();
        const validation = completeSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Invalid request format", {
                    details: validation.error.flatten(),
                }),
                { status: 400 }
            );
        }

        // 驗證 UCP 請求
        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        tenantId = authResult.context!.tenantId;
        merchantId = authResult.context!.merchantId;

        // Google v1 schema → 內部格式
        const internalInput = fromGoogleCompleteCheckout(
            validation.data,
            checkoutSessionId,
            merchantId
        );

        // 委派給共用 handler
        const result = await createOrderFromSession(internalInput, tenantId);

        if (!result.success) {
            return NextResponse.json(
                formatUcpError(result.code, result.message),
                { status: result.status }
            );
        }

        // 內部格式 → Google v1 response
        const googleResponse = toGoogleOrderResponse(result.order);
        return NextResponse.json(googleResponse, { status: 201 });
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : "";

        // TOCTOU：session 在前置檢查後、原子 claim 前過期 → 410 Gone
        if (errMsg === "__SESSION_EXPIRED__") {
            console.warn(
                `[UCP v1 Complete] SESSION_EXPIRED (TOCTOU): session=${checkoutSessionId}`
            );
            return NextResponse.json(
                formatUcpError("SESSION_EXPIRED", "Checkout session has expired"),
                { status: 410 }
            );
        }

        // 併發 claim 失敗 → 回傳 409（caller 重試時走 idempotency 路徑取回既有訂單）
        if (errMsg === "__CONCURRENT_CLAIM__") {
            console.warn(
                `[UCP v1 Complete] CONCURRENT_CLAIM: session=${checkoutSessionId}`
            );
            return NextResponse.json(
                formatUcpError("CONFLICT", "Order already created for this session"),
                { status: 409 }
            );
        }

        console.error("[UCP v1 Complete] Error:", error);

        // 商品不存在或庫存不足 → 422
        if (errMsg.includes("not found within tenant") || errMsg.includes("Insufficient stock") || errMsg.includes("Stock decrement failed")) {
            return NextResponse.json(
                formatUcpError("INVALID_CART", errMsg),
                { status: 422 }
            );
        }

        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
