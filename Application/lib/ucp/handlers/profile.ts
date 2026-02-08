/**
 * UCP Profile — 共用核心邏輯
 *
 * 被 /.well-known/ucp/profile.json 和
 * /.well-known/merchant-api/ucp/profile.json 共用。
 *
 * @module lib/ucp/handlers/profile
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import type { GoogleUcpProfile } from "@/lib/ucp/types";

/**
 * 處理 profile.json GET 請求
 *
 * 解析順序：
 *   1. 從 Host header 反查 shop.domain（Google discovery 模式）
 *   2. 從 query param `merchantId` 查詢（向下相容）
 *
 * @param request - NextRequest
 * @returns NextResponse with Google UCP profile
 */
export async function handleProfileGet(request: NextRequest): Promise<NextResponse> {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const { searchParams } = new URL(request.url);
        const merchantIdParam = searchParams.get("merchantId");

        // 從 Host header 取得 domain（去掉 port）
        const host = request.headers.get("host")?.split(":")[0] || "";

        const shopSelect = {
            id: true,
            name: true,
            domain: true,
            config: true,
            tenant: { select: { name: true } },
        } as const;

        // 優先用 domain 反查（Google discovery 模式）
        let shop = host
            ? await db.shop.findFirst({
                  where: { domain: host },
                  select: shopSelect,
              })
            : null;

        // Fallback: merchantId query param
        if (!shop && merchantIdParam) {
            shop = await db.shop.findFirst({
                where: { id: merchantIdParam },
                select: shopSelect,
            });
        }

        if (!shop) {
            // 若兩種方式都查不到，回傳明確錯誤
            return NextResponse.json(
                formatUcpError(
                    "NOT_FOUND",
                    "Merchant not found. Ensure the domain is configured or provide merchantId."
                ),
                { status: 404 }
            );
        }

        // 檢查 UCP 是否啟用
        const config = shop.config as Record<string, unknown> | null;
        const ucpConfig = config?.ucp as Record<string, unknown> | undefined;

        if (!ucpConfig?.enabled) {
            return NextResponse.json(
                formatUcpError("FORBIDDEN", "UCP not enabled for this merchant"),
                { status: 403 }
            );
        }

        // 取得基礎 URL
        const baseUrl = shop.domain
            ? `https://${shop.domain}`
            : process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin") || "";

        // 從 UCP config 取得支援的付款方式
        const paymentHandlers = (ucpConfig.paymentHandlers as string[]) || ["CARD"];
        // 從 UCP config 取得支援的運送國家
        const shippingCountries = (ucpConfig.shippingCountries as string[]) || ["TW"];
        // 從 UCP config 取得支援的訂單動作
        const supportedActions = (ucpConfig.supportedActions as string[]) || ["CANCEL", "REFUND"];

        // 建構 Google v1 Profile
        const profile: GoogleUcpProfile = {
            provider: shop.tenant?.name || "AIsell",
            title: shop.name,
            urlPattern: `${baseUrl}/api/ucp/v1`,
            checkoutConfig: {
                type: "NATIVE",
                supportedPaymentMethods: paymentHandlers,
                supportedShippingCountries: shippingCountries,
            },
            orderManagement: {
                callbackUrl: `${baseUrl}/api/ucp/v1/callbacks/orders`,
                supportedActions: supportedActions as GoogleUcpProfile["orderManagement"]["supportedActions"],
            },
            authentication: {
                type: "API_KEY",
                apiRequestHeaders: {
                    "X-UCP-Api-Key": "{api_key}",
                },
            },
        };

        return NextResponse.json(profile, {
            headers: {
                "Cache-Control": "public, max-age=300",
            },
        });
    } catch (error) {
        console.error("[UCP Profile] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
