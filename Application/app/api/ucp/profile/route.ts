/**
 * UCP Profile API
 * GET /api/ucp/profile
 * 
 * 回傳商家的 UCP Profile，供平台進行功能協商
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { withDeprecationHeaders } from "@/lib/ucp/deprecation";
import type { UcpProfile } from "@/lib/ucp/types";

export async function GET(request: NextRequest) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const { searchParams } = new URL(request.url);
        const merchantId = searchParams.get("merchantId");

        if (!merchantId) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Missing merchantId parameter"),
                { status: 400 }
            );
        }

        // 查詢商店資訊
        const shop = await db.shop.findFirst({
            where: { id: merchantId },
            select: {
                id: true,
                name: true,
                domain: true,
                config: true,
            },
        });

        if (!shop) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Merchant not found"),
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

        // 決定支援的 Payment Handlers
        const paymentHandlers = (ucpConfig.paymentHandlers as string[]) || ["stripe"];

        // 建構 Profile
        const profile: UcpProfile = {
            version: "2026-01-11",
            profile: {
                id: shop.id,
                name: shop.name,
                homepage: baseUrl,
                services: {
                    shopping: {
                        version: "1.0",
                        rest: {
                            schema: "https://ucp.dev/services/shopping/rest.openapi.json",
                            endpoint: `${baseUrl}/api/ucp`,
                        },
                    },
                },
                capabilities: [
                    "dev.ucp.shopping.checkout",
                    "dev.ucp.shopping.orders",
                    ...paymentHandlers.map((h: string) => `dev.ucp.shopping.payment.${h}`),
                ],
            },
        };

        return withDeprecationHeaders(
            NextResponse.json(profile),
            "/.well-known/ucp/profile.json"
        );
    } catch (error) {
        console.error("[UCP Profile] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
