/**
 * UCP Order Lifecycle Callback
 *
 * 當訂單狀態變更時，主動通知 Google 等 UCP 平台。
 * Google 要求商家在訂單狀態變更（確認、出貨、取消、退款）時
 * 透過 callbackUrl 發送 POST 通知。
 *
 * @module lib/ucp/handlers/callbacks
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §6
 */

import { db } from "@/lib/db";
import type { GoogleOrderState } from "@/lib/ucp/types";

// ===========================================
// Callback Payload 型別
// ===========================================

/** 訂單狀態變更 callback payload */
export interface OrderCallbackPayload {
    /** 事件類型 */
    eventType: "ORDER_STATUS_CHANGED";
    /** 事件時間（RFC 3339） */
    timestamp: string;
    /** 訂單 ID */
    orderId: string;
    /** 商家訂單編號 */
    merchantOrderId: string;
    /** 商家 ID */
    merchantId: string;
    /** 新狀態（Google v1 格式） */
    newState: GoogleOrderState;
    /** 舊狀態 */
    previousState?: GoogleOrderState;
    /** 附加資訊 */
    details?: {
        /** 物流追蹤號碼 */
        trackingNumber?: string;
        /** 物流業者 */
        carrier?: string;
        /** 追蹤連結 */
        trackingUrl?: string;
        /** 取消 / 退款原因 */
        reason?: string;
    };
}

// ===========================================
// 狀態映射
// ===========================================

/** 內部 OrderStatus → Google OrderState */
const STATUS_TO_GOOGLE_STATE: Record<string, GoogleOrderState> = {
    PENDING: "CREATED",
    PAID: "IN_PROGRESS",
    PROCESSING: "IN_PROGRESS",
    SHIPPED: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    REFUNDING: "CANCELLED",
};

// ===========================================
// Callback 發送
// ===========================================

/**
 * 發送訂單狀態變更 callback 給 UCP 平台
 *
 * 此函數為 fire-and-forget：失敗時記錄錯誤但不阻塞業務流程。
 * 含重試機制（最多 3 次，指數退避）。
 *
 * @param orderId - 訂單 ID
 * @param newStatus - 新的內部訂單狀態
 * @param previousStatus - 舊的內部訂單狀態
 * @param details - 附加資訊（物流追蹤等）
 */
export async function sendOrderCallback(
    orderId: string,
    newStatus: string,
    previousStatus?: string,
    details?: OrderCallbackPayload["details"]
): Promise<void> {
    try {
        // 查詢訂單與關聯的 UCP session
        const order = await db.order.findFirst({
            where: { id: orderId },
            select: {
                id: true,
                orderNo: true,
                shopId: true,
                tenantId: true,
                shop: {
                    select: { config: true },
                },
            },
        });

        if (!order) {
            console.warn(`[UCP Callback] Order ${orderId} not found, skipping callback`);
            return;
        }

        // 確認此訂單是否透過 UCP 建立（有關聯的 UcpCheckoutSession）
        const ucpSession = await db.ucpCheckoutSession.findFirst({
            where: { orderId, tenantId: order.tenantId },
            select: { platformId: true },
        });

        if (!ucpSession) {
            // 非 UCP 訂單，不需要發 callback
            return;
        }

        // 取得 callbackUrl
        const shopConfig = order.shop.config as Record<string, unknown> | null;
        const ucpConfig = shopConfig?.ucp as Record<string, unknown> | undefined;
        const callbackUrl = ucpConfig?.callbackUrl as string | undefined;

        if (!callbackUrl) {
            console.warn(
                `[UCP Callback] No callbackUrl configured for shop ${order.shopId}, skipping`
            );
            return;
        }

        // 取得 API key 用於簽署 callback（商家端驗證用）
        const callbackSecret = ucpConfig?.callbackSecret as string | undefined;

        // 組裝 payload
        const payload: OrderCallbackPayload = {
            eventType: "ORDER_STATUS_CHANGED",
            timestamp: new Date().toISOString(),
            orderId: order.id,
            merchantOrderId: order.orderNo,
            merchantId: order.shopId,
            newState: STATUS_TO_GOOGLE_STATE[newStatus] || "CREATED",
            previousState: previousStatus
                ? STATUS_TO_GOOGLE_STATE[previousStatus]
                : undefined,
            details,
        };

        // 發送 callback（含重試）
        await sendWithRetry(callbackUrl, payload, callbackSecret);
    } catch (error) {
        // Callback 失敗不應阻塞業務邏輯
        console.error(`[UCP Callback] Failed to send callback for order ${orderId}:`, error);
    }
}

// ===========================================
// 重試邏輯
// ===========================================

/** 最大重試次數 */
const MAX_RETRIES = 3;

/** 基礎退避間隔（毫秒） */
const BASE_DELAY_MS = 1000;

/**
 * 帶重試的 HTTP POST 發送
 * @param url - Callback URL
 * @param payload - 要發送的 payload
 * @param secret - 簽署用的 secret（可選）
 */
async function sendWithRetry(
    url: string,
    payload: OrderCallbackPayload,
    secret?: string
): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "AIsell-UCP-Callback/1.0",
        "X-UCP-Event": payload.eventType,
        "X-UCP-Timestamp": payload.timestamp,
    };

    // HMAC 簽章（如果有 callbackSecret）
    if (secret) {
        const crypto = await import("crypto");
        const signature = crypto
            .createHmac("sha256", secret)
            .update(body)
            .digest("hex");
        headers["X-UCP-Signature"] = signature;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers,
                body,
                signal: AbortSignal.timeout(10_000), // 10 秒超時
            });

            if (response.ok) {
                console.log(
                    `[UCP Callback] Successfully sent ${payload.eventType} ` +
                    `for order ${payload.orderId} (attempt ${attempt + 1})`
                );
                return;
            }

            // 4xx 不重試（平台端問題）
            if (response.status >= 400 && response.status < 500) {
                console.error(
                    `[UCP Callback] Client error ${response.status} from ${url}, ` +
                    `not retrying: ${await response.text()}`
                );
                return;
            }

            // 5xx 繼續重試
            console.warn(
                `[UCP Callback] Server error ${response.status} from ${url}, ` +
                `attempt ${attempt + 1}/${MAX_RETRIES + 1}`
            );
        } catch (error) {
            console.warn(
                `[UCP Callback] Network error on attempt ${attempt + 1}/${MAX_RETRIES + 1}:`,
                error instanceof Error ? error.message : error
            );
        }

        // 指數退避
        if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    console.error(
        `[UCP Callback] All ${MAX_RETRIES + 1} attempts failed for ${url}, ` +
        `order ${payload.orderId}`
    );
}
