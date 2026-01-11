/**
 * PayPal 金流 SDK 封裝
 * @see https://developer.paypal.com/docs/api/overview/
 */

import { Client, Environment, LogLevel, OrdersController, PaymentsController, CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";
import { db } from "@/lib/db";

/**
 * PayPal 配置介面
 */
export interface PayPalConfig {
    clientId: string;
    clientSecret: string;
    mode: "sandbox" | "live";
    webhookId?: string;
}

/**
 * 訂單資訊介面
 */
interface OrderInfo {
    orderId: string;
    amount: number;
    currency?: string;
    description?: string;
    returnUrl: string;
    cancelUrl: string;
}

/**
 * 根據 tenantId 取得該租戶的 PayPal 設定
 */
export async function getPayPalConfigForTenant(tenantId: string): Promise<PayPalConfig | null> {
    const provider = await db.paymentProvider.findFirst({
        where: {
            tenantId,
            type: "PAYPAL",
        },
        select: { config: true },
    });

    if (!provider?.config) {
        return null;
    }

    const config = provider.config as Record<string, string>;
    const clientId = config.clientId || config.PAYPAL_CLIENT_ID;
    const clientSecret = config.clientSecret || config.PAYPAL_CLIENT_SECRET;
    const mode = (config.mode || config.PAYPAL_MODE || "sandbox") as "sandbox" | "live";
    const webhookId = config.webhookId || config.PAYPAL_WEBHOOK_ID;

    if (!clientId || !clientSecret) {
        return null;
    }

    return {
        clientId,
        clientSecret,
        mode,
        webhookId,
    };
}

/**
 * 根據 orderId 取得對應租戶的 PayPal 設定
 */
export async function getPayPalConfigForOrder(orderId: string): Promise<PayPalConfig | null> {
    const order = await db.order.findUnique({
        where: { id: orderId },
        select: { tenantId: true },
    });

    if (!order) {
        return null;
    }

    return getPayPalConfigForTenant(order.tenantId);
}

/**
 * 取得 PayPal Client
 */
export function getPayPalClient(config: PayPalConfig) {
    const client = new Client({
        clientCredentialsAuthCredentials: {
            oAuthClientId: config.clientId,
            oAuthClientSecret: config.clientSecret,
        },
        timeout: 0,
        environment: config.mode === "live" ? Environment.Production : Environment.Sandbox,
        logging: {
            logLevel: LogLevel.Info,
        },
    });

    return {
        client,
        ordersController: new OrdersController(client),
        paymentsController: new PaymentsController(client),
    };
}

/**
 * 建立 PayPal 訂單
 */
export async function createPayPalOrder(
    config: PayPalConfig,
    order: OrderInfo
): Promise<{ orderId: string; approveUrl: string }> {
    const { ordersController } = getPayPalClient(config);

    const response = await ordersController.createOrder({
        body: {
            intent: CheckoutPaymentIntent.Capture,
            purchaseUnits: [
                {
                    referenceId: order.orderId,
                    amount: {
                        currencyCode: order.currency || "TWD",
                        value: order.amount.toFixed(2),
                    },
                    description: order.description || "AIsell 訂單",
                },
            ],
            applicationContext: {
                returnUrl: order.returnUrl,
                cancelUrl: order.cancelUrl,
            },
        },
    });

    const paypalOrderId = response.result.id;
    const approveLink = response.result.links?.find((link: { rel?: string; href?: string }) => link.rel === "approve");

    if (!paypalOrderId || !approveLink?.href) {
        throw new Error("Failed to create PayPal order");
    }

    return {
        orderId: paypalOrderId,
        approveUrl: approveLink.href,
    };
}

/**
 * 擷取 PayPal 訂單付款
 */
export async function capturePayPalOrder(
    config: PayPalConfig,
    paypalOrderId: string
): Promise<{ captureId: string; status: string }> {
    const { ordersController } = getPayPalClient(config);

    const response = await ordersController.captureOrder({
        id: paypalOrderId,
        body: {},
    });

    const captureId = response.result.purchaseUnits?.[0]?.payments?.captures?.[0]?.id || "";
    const status = response.result.status || "UNKNOWN";

    return { captureId, status };
}

/**
 * 退款 PayPal 訂單
 * TODO: PayPal SDK @paypal/paypal-server-sdk 目前版本可能不包含 capturesRefund 方法
 * 需要使用 PayPal REST API 直接呼叫或等待 SDK 更新
 */
export async function refundPayPalCapture(
    _config: PayPalConfig,
    captureId: string,
    amount?: number,
    currency?: string
): Promise<{ refundId: string; status: string }> {
    // TODO: 實作 PayPal 退款
    // 可能需要直接呼叫 PayPal REST API: POST /v2/payments/captures/{captureId}/refund
    console.log(`[PayPal] Refund requested for capture ${captureId}, amount: ${amount} ${currency}`);

    throw new Error("PayPal refund not yet implemented - please use PayPal dashboard");
}

/**
 * 驗證 PayPal Webhook 簽名
 * 注意：PayPal webhook 驗證需要額外的 API 呼叫
 */
export async function verifyPayPalWebhook(
    config: PayPalConfig,
    webhookId: string,
    headers: Record<string, string>,
    body: string
): Promise<boolean> {
    // PayPal webhook 驗證較複雜，需要呼叫 PayPal API
    // 這裡簡化處理，實際應使用 PayPal 提供的驗證 API
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const certUrl = headers["paypal-cert-url"];
    const authAlgo = headers["paypal-auth-algo"];
    const transmissionSig = headers["paypal-transmission-sig"];

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
        return false;
    }

    // TODO: 實作完整的 webhook 簽名驗證
    // 需要下載 PayPal 證書並驗證簽名
    console.log(`[PayPal] Webhook verification - webhookId: ${webhookId}`);

    return true; // 暫時信任所有 webhook
}
