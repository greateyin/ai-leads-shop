import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/shops/public
 * 取得公開商店資訊（無需登入）
 * 
 * 用於結帳流程中取得商店的基本資訊，如 ID、名稱、幣別等
 * Query params:
 * - slug: 商店 slug（可選）
 * - domain: 商店自訂網域（可選）
 * 
 * 若未提供參數，嘗試從請求 host 推斷或返回預設商店
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get("slug");
        const domain = searchParams.get("domain");

        // 嘗試透過 host header 推斷商店
        const host = request.headers.get("host") || "";

        let shop;

        if (slug) {
            // 透過 slug 查詢
            shop = await db.shop.findUnique({
                where: { slug },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    currency: true,
                    timezone: true,
                    locale: true,
                    logoUrl: true,
                    description: true,
                },
            });
        } else if (domain) {
            // 透過自訂網域查詢
            shop = await db.shop.findFirst({
                where: { domain },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    currency: true,
                    timezone: true,
                    locale: true,
                    logoUrl: true,
                    description: true,
                },
            });
        } else {
            // 嘗試從 host 推斷 subdomain
            // 格式: {subdomain}.example.com 或 localhost:3000
            const subdomain = host.split(".")[0];

            // 先嘗試透過 subdomain 查詢 tenant
            const tenant = await db.tenant.findFirst({
                where: { subdomain },
                include: {
                    shops: {
                        take: 1,
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            currency: true,
                            timezone: true,
                            locale: true,
                            logoUrl: true,
                            description: true,
                        },
                    },
                },
            });

            shop = tenant?.shops[0] || null;

            // 若找不到，返回第一個可用的商店（開發環境用）
            if (!shop && (host.includes("localhost") || host.includes("127.0.0.1"))) {
                shop = await db.shop.findFirst({
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        currency: true,
                        timezone: true,
                        locale: true,
                        logoUrl: true,
                        description: true,
                    },
                });
            }
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
