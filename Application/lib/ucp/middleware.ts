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
 * UCP 請求可能包含以下驗證機制：
 * 1. API Key (Header: X-UCP-Api-Key)
 * 2. HMAC 簽章 (Header: X-UCP-Signature)
 * 3. Platform Token (Header: Authorization: Bearer <token>)
 */
export async function verifyUcpRequest(
    request: NextRequest
): Promise<UcpAuthResult> {
    // 取得 API Key 或 Platform 識別
    const apiKey = request.headers.get("X-UCP-Api-Key");
    const platformId = request.headers.get("X-UCP-Platform-Id") || "google";

    // 從 URL 取得 merchantId（對應 shopId）
    const url = new URL(request.url);
    const merchantId = url.searchParams.get("merchantId");

    if (!merchantId) {
        return {
            success: false,
            error: "Missing merchantId parameter",
        };
    }

    // 查詢商店設定
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

    // 檢查 UCP 是否啟用
    const config = shop.config as Record<string, unknown> | null;
    const ucpConfig = config?.ucp as Record<string, unknown> | undefined;

    if (!ucpConfig?.enabled) {
        return {
            success: false,
            error: "UCP not enabled for this merchant",
        };
    }

    // [安全] 強制驗證 API Key — 商家必須設定 apiKeyHash 才能使用 UCP
    if (!ucpConfig.apiKeyHash) {
        return {
            success: false,
            error: "UCP API key not configured for this merchant",
        };
    }

    if (!apiKey) {
        return {
            success: false,
            error: "Missing X-UCP-Api-Key header",
        };
    }

    const hashedKey = crypto
        .createHash("sha256")
        .update(apiKey)
        .digest("hex");

    if (hashedKey !== ucpConfig.apiKeyHash) {
        return {
            success: false,
            error: "Invalid API key",
        };
    }

    // 驗證平台是否允許
    const allowedPlatforms = ucpConfig.allowedPlatforms as string[] | undefined;
    if (allowedPlatforms && !allowedPlatforms.includes(platformId)) {
        return {
            success: false,
            error: "Platform not allowed",
        };
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
