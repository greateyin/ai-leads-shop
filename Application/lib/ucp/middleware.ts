/**
 * UCP Authentication Middleware
 * 驗證來自 UCP 平台的請求
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

export interface UcpAuthContext {
    tenantId: string;
    shopId: string;
    platformId: string;
    merchantId: string;
}

export interface UcpAuthResult {
    success: boolean;
    context?: UcpAuthContext;
    error?: string;
}

/**
 * 驗證 UCP 請求
 *
 * 支援兩種 merchantId 解析策略：
 * - **舊路由**：從 query param `?merchantId=xxx` 取得
 * - **v1 路由**：由呼叫端傳入 `explicitMerchantId`，或由 API Key 反查商家
 *
 * 驗證機制：
 * 1. API Key (Header: X-UCP-Api-Key)
 * 2. HMAC 簽章 (Header: X-UCP-Signature) — 未來擴展
 * 3. Platform Token (Header: Authorization: Bearer <token>) — 未來擴展
 *
 * @param request - NextRequest
 * @param explicitMerchantId - v1 路由可直接傳入 merchantId（來自 body 或 path param）
 */
export async function verifyUcpRequest(
    request: NextRequest,
    explicitMerchantId?: string
): Promise<UcpAuthResult> {
    // 取得 API Key 與 Platform 識別
    const apiKey = request.headers.get("X-UCP-Api-Key");
    const platformId = request.headers.get("X-UCP-Platform-Id") || "google";

    if (!apiKey) {
        return { success: false, error: "Missing X-UCP-Api-Key header" };
    }

    // 計算 API key hash（後續比對用）
    const hashedKey = crypto
        .createHash("sha256")
        .update(apiKey)
        .digest("hex");

    // merchantId 解析：explicit > query param > API-key reverse lookup
    const url = new URL(request.url);
    const merchantId =
        explicitMerchantId ||
        url.searchParams.get("merchantId") ||
        null;

    // 如果有 merchantId，走精確查詢
    if (merchantId) {
        return verifyWithMerchantId(merchantId, hashedKey, platformId);
    }

    // v1 路由沒帶 merchantId → 用 API key hash 反查商家
    return verifyByApiKeyHash(hashedKey, platformId);
}

/**
 * 透過 merchantId + apiKeyHash 驗證（舊路由 & v1 POST 帶 merchantId 時使用）
 */
async function verifyWithMerchantId(
    merchantId: string,
    hashedKey: string,
    platformId: string
): Promise<UcpAuthResult> {
    const shop = await db.shop.findFirst({
        where: { id: merchantId },
        select: { id: true, tenantId: true, config: true },
    });

    if (!shop) {
        return { success: false, error: "Merchant not found" };
    }

    const config = shop.config as Record<string, unknown> | null;
    const ucpConfig = config?.ucp as Record<string, unknown> | undefined;

    if (!ucpConfig?.enabled) {
        return { success: false, error: "UCP not enabled for this merchant" };
    }

    if (!ucpConfig.apiKeyHash) {
        return { success: false, error: "UCP API key not configured for this merchant" };
    }

    if (hashedKey !== ucpConfig.apiKeyHash) {
        return { success: false, error: "Invalid API key" };
    }

    const allowedPlatforms = ucpConfig.allowedPlatforms as string[] | undefined;
    if (allowedPlatforms && !allowedPlatforms.includes(platformId)) {
        return { success: false, error: "Platform not allowed" };
    }

    return {
        success: true,
        context: {
            tenantId: shop.tenantId,
            shopId: shop.id,
            platformId,
            merchantId,
        },
    };
}

/**
 * 透過 API key hash 反查商家（v1 GET/PUT 等無 merchantId 的路由使用）
 *
 * 搜尋所有啟用 UCP 且 apiKeyHash 相符的商店。
 * 因為 API key 是唯一綁定一個 shop 的，所以結果必須恰好一筆。
 */
async function verifyByApiKeyHash(
    hashedKey: string,
    platformId: string
): Promise<UcpAuthResult> {
    // 查詢所有商店，在 application 層比對 JSON 內的 apiKeyHash
    // 效能注意：若商店數量極大，可考慮將 apiKeyHash 提升為獨立欄位加 index
    const shops = await db.shop.findMany({
        where: {
            config: {
                path: ["ucp", "enabled"],
                equals: true,
            },
        },
        select: { id: true, tenantId: true, config: true },
    });

    // 收集所有 apiKeyHash 相符的商店
    const matched = shops.filter((shop) => {
        const config = shop.config as Record<string, unknown> | null;
        const ucpConfig = config?.ucp as Record<string, unknown> | undefined;
        return ucpConfig?.apiKeyHash === hashedKey;
    });

    // Fail-closed：若 hash 碰撞（多筆命中）直接拒絕，防止跨租戶誤綁
    if (matched.length > 1) {
        console.error(
            `[UCP Auth] CRITICAL: duplicate apiKeyHash detected across ${matched.length} shops: ${matched.map((s) => s.id).join(", ")}`
        );
        return { success: false, error: "API key conflict — contact support" };
    }

    if (matched.length === 0) {
        return { success: false, error: "Invalid API key or merchant not found" };
    }

    const shop = matched[0];
    const config = shop.config as Record<string, unknown> | null;
    const ucpConfig = config?.ucp as Record<string, unknown> | undefined;
    const allowedPlatforms = ucpConfig?.allowedPlatforms as string[] | undefined;
    if (allowedPlatforms && !allowedPlatforms.includes(platformId)) {
        return { success: false, error: "Platform not allowed" };
    }

    return {
        success: true,
        context: {
            tenantId: shop.tenantId,
            shopId: shop.id,
            platformId,
            merchantId: shop.id,
        },
    };
}

/**
 * 簡化的 UCP 驗證（用於公開端點如商品查詢）
 * 只驗證 merchantId 存在且 UCP 已啟用
 */
export async function verifyUcpPublicRequest(
    merchantId: string
): Promise<UcpAuthResult> {
    const shop = await db.shop.findFirst({
        where: {
            id: merchantId,
        },
        select: {
            id: true,
            tenantId: true,
            config: true,
        },
    });

    if (!shop) {
        return {
            success: false,
            error: "Merchant not found",
        };
    }

    const config = shop.config as Record<string, unknown> | null;
    const ucpConfig = config?.ucp as Record<string, unknown> | undefined;

    if (!ucpConfig?.enabled) {
        return {
            success: false,
            error: "UCP not enabled for this merchant",
        };
    }

    return {
        success: true,
        context: {
            tenantId: shop.tenantId,
            shopId: shop.id,
            platformId: "public",
            merchantId,
        },
    };
}

/**
 * 格式化 UCP 錯誤回應
 */
export function formatUcpError(
    code: string,
    message: string,
    details?: Record<string, unknown>
) {
    return {
        error: {
            code,
            message,
            ...(details && { details }),
        },
    };
}
