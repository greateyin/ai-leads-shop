/**
 * Google Merchant Shopping APIs v1 — Checkout Session by ID
 * GET  /api/ucp/v1/checkout-sessions/{checkoutSessionId} — 查詢 Session
 * PUT  /api/ucp/v1/checkout-sessions/{checkoutSessionId} — 更新 Session
 *
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §3
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyUcpRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { getCheckoutSession, updateCheckoutSession } from "@/lib/ucp/handlers/checkout";
import { toGoogleCheckoutResponse } from "@/lib/ucp/adapters/google";

/** Route params 型別 */
interface RouteParams {
    params: Promise<{ checkoutSessionId: string }>;
}

const addressSchema = z.object({
    name: z.string().optional(),
    addressLines: z.array(z.string()).min(1),
    locality: z.string(),
    administrativeArea: z.string().optional(),
    postalCode: z.string(),
    regionCode: z.string().default("TW"),
    phoneNumber: z.string().optional(),
});

const updateSchema = z.object({
    shippingAddress: addressSchema.optional(),
    billingAddress: addressSchema.optional(),
    selectedDeliveryOptionRef: z.string().optional(),
    selectedPaymentMethodId: z.string().optional(),
});

// ===========================================
// GET: 查詢 Checkout Session
// ===========================================

/**
 * GET /api/ucp/v1/checkout-sessions/{checkoutSessionId}
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const { checkoutSessionId } = await params;

        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        const { tenantId, merchantId } = authResult.context!;
        const session = await getCheckoutSession(checkoutSessionId, merchantId, tenantId);

        if (!session) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Checkout session not found"),
                { status: 404 }
            );
        }

        return NextResponse.json(toGoogleCheckoutResponse(session));
    } catch (error) {
        console.error("[UCP v1 Checkout GET] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}

// ===========================================
// PUT: 更新 Checkout Session
// ===========================================

/**
 * PUT /api/ucp/v1/checkout-sessions/{checkoutSessionId}
 * 用於更新運送地址、付款方式等（觸發運費重算 — Phase 2）
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const { checkoutSessionId } = await params;
        const body = await request.json();
        const validation = updateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Invalid request format", {
                    details: validation.error.flatten(),
                }),
                { status: 400 }
            );
        }

        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        const { tenantId } = authResult.context!;
        const result = await updateCheckoutSession(checkoutSessionId, tenantId, validation.data);

        if (!result.success) {
            return NextResponse.json(
                formatUcpError(result.code, result.message),
                { status: result.status }
            );
        }

        return NextResponse.json(toGoogleCheckoutResponse(result.session));
    } catch (error) {
        console.error("[UCP v1 Checkout PUT] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
