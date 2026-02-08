/**
 * UCP Products API
 * GET /api/ucp/products - 查詢商品列表
 * GET /api/ucp/products?offerId=xxx - 查詢單一商品
 * 
 * 將內部商品格式轉換為 UCP Offer 格式
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUcpPublicRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import type { UcpOffer, UcpMoney } from "@/lib/ucp/types";

/**
 * 將價格轉換為 UCP 金額格式（minor units）
 */
function toUcpMoney(amount: number | { toNumber(): number }, currency: string): UcpMoney {
    const value = typeof amount === "number" ? amount : amount.toNumber();
    return {
        value: Math.round(value * 100), // 轉換為分
        currency: currency.toUpperCase(),
    };
}

/**
 * 將商品轉換為 UCP Offer 格式
 */
function toUcpOffer(
    product: {
        id: string;
        name: string;
        summary: string | null;
        price: { toNumber(): number };
        stock: number;
        sku: string | null;
        coverImageUrl: string | null;
        shop: { id: string; currency: string; domain: string | null };
    },
    baseUrl: string
): UcpOffer {
    return {
        id: product.id,
        merchantId: product.shop.id,
        name: product.name,
        description: product.summary || undefined,
        price: toUcpMoney(product.price, product.shop.currency),
        availability: product.stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
        imageUrl: product.coverImageUrl || undefined,
        productUrl: product.shop.domain
            ? `https://${product.shop.domain}/products/${product.id}`
            : `${baseUrl}/products/${product.id}`,
        sku: product.sku || undefined,
    };
}

export async function GET(request: NextRequest) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const { searchParams } = new URL(request.url);
        const merchantId = searchParams.get("merchantId");
        const offerId = searchParams.get("offerId");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
        const search = searchParams.get("search") || "";
        const categoryId = searchParams.get("categoryId");

        if (!merchantId) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Missing merchantId parameter"),
                { status: 400 }
            );
        }

        // 驗證商家 UCP 設定
        const authResult = await verifyUcpPublicRequest(merchantId);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("FORBIDDEN", authResult.error || "Access denied"),
                { status: 403 }
            );
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin") || "";

        // 查詢單一商品
        if (offerId) {
            const product = await db.product.findFirst({
                where: {
                    id: offerId,
                    shopId: merchantId,
                    status: "PUBLISHED",
                    deletedAt: null,
                },
                include: {
                    shop: {
                        select: { id: true, currency: true, domain: true },
                    },
                },
            });

            if (!product) {
                return NextResponse.json(
                    formatUcpError("NOT_FOUND", "Offer not found"),
                    { status: 404 }
                );
            }

            return NextResponse.json({
                offer: toUcpOffer(product, baseUrl),
            });
        }

        // 查詢商品列表
        const where = {
            shopId: merchantId,
            status: "PUBLISHED" as const,
            deletedAt: null,
            ...(search && {
                OR: [
                    { name: { contains: search, mode: "insensitive" as const } },
                    { summary: { contains: search, mode: "insensitive" as const } },
                ],
            }),
            ...(categoryId && {
                categories: { some: { categoryId } },
            }),
        };

        const [products, total] = await Promise.all([
            db.product.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    shop: {
                        select: { id: true, currency: true, domain: true },
                    },
                },
            }),
            db.product.count({ where }),
        ]);

        const offers = products.map((p) => toUcpOffer(p, baseUrl));

        return NextResponse.json({
            offers,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("[UCP Products] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
