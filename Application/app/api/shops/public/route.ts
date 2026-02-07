import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";

/** 商店公開欄位 select */
const SHOP_PUBLIC_SELECT = {
    id: true,
    name: true,
    slug: true,
    currency: true,
    timezone: true,
    locale: true,
    logoUrl: true,
    description: true,
} as const;

/**
 * GET /api/shops/public
 * 取得公開商店資訊（無需登入）
 *
 * 用於結帳流程中取得商店的基本資訊，如 ID、名稱、幣別等
 * Query params:
 * - slug: 商店 slug（可選，需同時屬於當前租戶）
 *
 * 若未提供 slug，使用共用 tenant resolver 從 host 解析
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get("slug");

        // 使用共用 resolver 解析租戶
        const tenant = await resolveTenantFromRequest(request);

        let shop;

        if (slug && tenant) {
            // 透過 slug 查詢，但限定在當前租戶內（防止跨租戶）
            shop = await db.shop.findFirst({
                where: { slug, tenantId: tenant.tenantId },
                select: SHOP_PUBLIC_SELECT,
            });
        } else if (slug) {
            // 無法解析租戶時，僅以 slug 查詢（localhost 開發場景）
            shop = await db.shop.findUnique({
                where: { slug },
                select: SHOP_PUBLIC_SELECT,
            });
        } else if (tenant) {
            // 無 slug 時，使用 resolver 結果的商店
            shop = await db.shop.findFirst({
                where: { id: tenant.shopId },
                select: SHOP_PUBLIC_SELECT,
            });
        }

        if (!shop) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "NOT_FOUND", message: "找不到商店" },
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: shop,
        });
    } catch (error) {
        console.error("取得公開商店資訊錯誤:", error);
        return NextResponse.json(
            {
                success: false,
                error: { code: "INTERNAL_ERROR", message: "取得商店資訊失敗" },
            },
            { status: 500 }
        );
    }
}
