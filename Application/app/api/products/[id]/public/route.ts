import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";

/**
 * GET /api/products/[id]/public
 * 取得單一商品詳情 (公開端點，不需要登入)
 * 已加入 tenant 隔離：僅回傳當前租戶的商品
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Tenant 隔離：從 host 解析租戶
        const tenant = await resolveTenantFromRequest(request);

        // [安全] fail-closed：tenant 解析失敗時不查全庫，防止跨租戶讀取
        if (!tenant) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "NOT_FOUND", message: "找不到商品" },
                },
                { status: 404 }
            );
        }

        const product = await db.product.findFirst({
            where: {
                id,
                status: "PUBLISHED",
                deletedAt: null,
                tenantId: tenant.tenantId,
            },
            include: {
                shop: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                categories: {
                    include: { category: true },
                },
                variants: {
                    select: {
                        id: true,
                        name: true,
                        sku: true,
                        price: true,
                        stock: true,
                        attributes: true,
                    },
                },
                assets: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                        id: true,
                        type: true,
                        url: true,
                        altText: true,
                        sortOrder: true,
                    },
                },
            },
        });

        if (!product) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "NOT_FOUND", message: "找不到商品" },
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: product,
        });
    } catch (error) {
        console.error("Get public product error:", error);
        return NextResponse.json(
            {
                success: false,
                error: { code: "INTERNAL_ERROR", message: "取得商品失敗" },
            },
            { status: 500 }
        );
    }
}
