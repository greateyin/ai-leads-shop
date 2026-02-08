/**
 * Google Merchant Shopping APIs v1 — Product Availability
 * POST /api/ucp/v1/products/availability — 查詢商品庫存
 *
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §1.1 R7
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyUcpPublicRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { toGoogleAvailabilityResponse } from "@/lib/ucp/adapters/google";
import type { UcpAvailabilityResponse, UcpMoney } from "@/lib/ucp/types";

// ===========================================
// Google v1 Schema
// ===========================================

const availabilitySchema = z.object({
    merchantId: z.string().uuid(),
    products: z.array(z.object({
        offerId: z.string().uuid(),
        quantity: z.number().int().min(1).optional().default(1),
    })).min(1).max(50),
    shippingAddress: z.object({
        name: z.string().optional(),
        addressLines: z.array(z.string()).min(1),
        locality: z.string(),
        administrativeArea: z.string().optional(),
        postalCode: z.string(),
        regionCode: z.string().default("TW"),
        phoneNumber: z.string().optional(),
    }).optional(),
});

/** 將價格轉換為 UCP minor units */
function toUcpMoney(amount: number | { toNumber(): number }, currency: string): UcpMoney {
    const value = typeof amount === "number" ? amount : amount.toNumber();
    return {
        value: Math.round(value * 100),
        currency: currency.toUpperCase(),
    };
}

/**
 * POST /api/ucp/v1/products/availability
 * @param request - Google v1 格式的庫存查詢請求
 */
export async function POST(request: NextRequest) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const body = await request.json();
        const validation = availabilitySchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Invalid request format", {
                    details: validation.error.flatten(),
                }),
                { status: 400 }
            );
        }

        const { merchantId, products: requestedProducts } = validation.data;

        // 驗證商家 UCP 設定
        const authResult = await verifyUcpPublicRequest(merchantId);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("FORBIDDEN", authResult.error || "Access denied"),
                { status: 403 }
            );
        }

        // 取得商店幣別
        const shop = await db.shop.findFirst({
            where: { id: merchantId },
            select: { currency: true },
        });

        if (!shop) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Merchant not found"),
                { status: 404 }
            );
        }

        // 批次查詢所有商品
        const productIds = requestedProducts.map((p) => p.offerId);
        const dbProducts = await db.product.findMany({
            where: {
                id: { in: productIds },
                shopId: merchantId,
                status: "PUBLISHED",
                deletedAt: null,
            },
            select: {
                id: true,
                price: true,
                stock: true,
            },
        });

        const productMap = new Map(dbProducts.map((p) => [p.id, p]));

        // 組裝內部格式回應
        const internalResponse: UcpAvailabilityResponse = {
            offers: requestedProducts.map((req) => {
                const product = productMap.get(req.offerId);

                if (!product) {
                    return {
                        id: req.offerId,
                        availability: "OUT_OF_STOCK" as const,
                        price: toUcpMoney(0, shop.currency),
                        quantity: 0,
                        maxQuantity: 0,
                    };
                }

                const requestedQty = req.quantity || 1;
                const hasStock = product.stock >= requestedQty;

                return {
                    id: req.offerId,
                    availability: hasStock ? "IN_STOCK" as const : "OUT_OF_STOCK" as const,
                    price: toUcpMoney(product.price, shop.currency),
                    quantity: hasStock ? requestedQty : 0,
                    maxQuantity: product.stock,
                };
            }),
        };

        // 內部格式 → Google v1 response
        return NextResponse.json(toGoogleAvailabilityResponse(internalResponse));
    } catch (error) {
        console.error("[UCP v1 Availability] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
