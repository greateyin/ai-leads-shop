/**
 * UCP Availability API
 * POST /api/ucp/availability
 * 
 * 即時查詢商品庫存和價格，用於結帳前驗證
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyUcpPublicRequest, formatUcpError } from "@/lib/ucp/middleware";
import type { UcpAvailabilityResponse, UcpMoney } from "@/lib/ucp/types";

const availabilitySchema = z.object({
    merchantId: z.string().uuid(),
    offers: z.array(z.object({
        id: z.string().uuid(),
        quantity: z.number().int().min(1).optional().default(1),
    })).min(1).max(50), // 限制單次最多查詢 50 個商品
});

function toUcpMoney(amount: number | { toNumber(): number }, currency: string): UcpMoney {
    const value = typeof amount === "number" ? amount : amount.toNumber();
    return {
        value: Math.round(value * 100),
        currency: currency.toUpperCase(),
    };
}

export async function POST(request: NextRequest) {
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

        const { merchantId, offers } = validation.data;

        // 驗證商家 UCP 設定
        const authResult = await verifyUcpPublicRequest(merchantId);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("FORBIDDEN", authResult.error || "Access denied"),
                { status: 403 }
            );
        }

        // 取得商店資訊（含幣別）
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
        const productIds = offers.map((o) => o.id);
        const products = await db.product.findMany({
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

        // 建立 ID -> 商品 的映射
        const productMap = new Map(products.map((p) => [p.id, p]));

        // 組裝回應
        const response: UcpAvailabilityResponse = {
            offers: offers.map((offerRequest) => {
                const product = productMap.get(offerRequest.id);

                if (!product) {
                    return {
                        id: offerRequest.id,
                        availability: "OUT_OF_STOCK" as const,
                        price: toUcpMoney(0, shop.currency),
                        quantity: 0,
                        maxQuantity: 0,
                    };
                }

                const requestedQty = offerRequest.quantity || 1;
                const hasStock = product.stock >= requestedQty;

                return {
                    id: offerRequest.id,
                    availability: hasStock ? "IN_STOCK" as const : "OUT_OF_STOCK" as const,
                    price: toUcpMoney(product.price, shop.currency),
                    quantity: hasStock ? requestedQty : 0,
                    maxQuantity: product.stock,
                };
            }),
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("[UCP Availability] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
