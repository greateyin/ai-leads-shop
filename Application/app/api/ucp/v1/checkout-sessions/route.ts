/**
 * Google Merchant Shopping APIs v1 — Checkout Sessions
 * POST /api/ucp/v1/checkout-sessions — 建立 Checkout Session
 *
 * 接收 Google v1 schema，經 adapter 轉換後委派給共用 handler。
 *
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §3
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyUcpRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { recordUcpRequest } from "@/lib/ucp/metrics";
import { createCheckoutSession, fromUcpMoney } from "@/lib/ucp/handlers/checkout";
import { getAvailableDeliveryOptions } from "@/lib/ucp/handlers/shipping";
import { fromGoogleCreateCheckout, toGoogleCheckoutResponse } from "@/lib/ucp/adapters/google";

// ===========================================
// Google v1 Schema
// ===========================================

const googleCartItemSchema = z.object({
    offer: z.object({
        offerId: z.string().uuid(),
        price: z.object({
            value: z.number().int(),
            currency: z.string(),
        }).optional(),
    }),
    quantity: z.number().int().min(1),
});

const addressSchema = z.object({
    name: z.string().optional(),
    addressLines: z.array(z.string()).min(1),
    locality: z.string(),
    administrativeArea: z.string().optional(),
    postalCode: z.string(),
    regionCode: z.string().default("TW"),
    phoneNumber: z.string().optional(),
});

const createCheckoutSchema = z.object({
    merchantId: z.string().uuid(),
    checkoutOptions: z.object({
        requestedProcessingType: z.enum(["CHECKOUT_AND_PAY", "CHECKOUT_ONLY"]).optional(),
    }).optional(),
    cart: z.object({
        items: z.array(googleCartItemSchema).min(1).max(100),
        currency: z.string().optional().default("TWD"),
    }),
    shippingAddress: addressSchema.optional(),
    billingAddress: addressSchema.optional(),
    buyerInfo: z.object({
        email: z.string().email().optional(),
        phone: z.string().optional(),
    }).optional(),
    selectedDeliveryOptionRef: z.string().optional(),
    metadata: z.record(z.string()).optional(),
});

// ===========================================
// POST: 建立 Checkout Session
// ===========================================

/**
 * POST /api/ucp/v1/checkout-sessions
 * @param request - Google v1 格式的建立 checkout session 請求
 */
export async function POST(request: NextRequest) {
    const start = Date.now();
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const body = await request.json();
        const validation = createCheckoutSchema.safeParse(body);

        if (!validation.success) {
            const res = NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Invalid request format", {
                    details: validation.error.flatten(),
                }),
                { status: 400 }
            );
            recordUcpRequest("POST /v1/checkout-sessions", 400, Date.now() - start);
            return res;
        }

        // 驗證 UCP 請求（v1 從 body 取 merchantId）
        const authResult = await verifyUcpRequest(request, validation.data.merchantId);
        if (!authResult.success) {
            const res = NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
            recordUcpRequest("POST /v1/checkout-sessions", 401, Date.now() - start);
            return res;
        }

        // Google v1 schema → 內部格式
        const internalInput = fromGoogleCreateCheckout(validation.data);

        // 委派給共用 handler
        const result = await createCheckoutSession(internalInput, authResult.context!);

        if (!result.success) {
            const res = NextResponse.json(
                formatUcpError(result.code, result.message, result.details),
                { status: result.status }
            );
            recordUcpRequest("POST /v1/checkout-sessions", result.status, Date.now() - start);
            return res;
        }

        // 取得可用配送方式
        const subtotal = fromUcpMoney(result.session.cart.subtotal);
        const deliveryOptions = await getAvailableDeliveryOptions(
            authResult.context!.shopId,
            subtotal,
            result.session.shippingAddress
        );

        // 內部格式 → Google v1 response
        const googleResponse = toGoogleCheckoutResponse(result.session, deliveryOptions);
        recordUcpRequest("POST /v1/checkout-sessions", 201, Date.now() - start);
        return NextResponse.json(googleResponse, { status: 201 });
    } catch (error) {
        console.error("[UCP v1 Checkout POST] Error:", error);
        recordUcpRequest("POST /v1/checkout-sessions", 500, Date.now() - start);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
