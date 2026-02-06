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
 * 使用 PayPal Notification Verify API 驗證 webhook 來源
 * @see https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post
 */
export async function verifyPayPalWebhook(
    config: PayPalConfig,
    webhookId: string,
    headers: Record<string, string>,
    body: string
): Promise<boolean> {
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const certUrl = headers["paypal-cert-url"];
    const authAlgo = headers["paypal-auth-algo"];
    const transmissionSig = headers["paypal-transmission-sig"];

    // 缺少任何必要 header 即驗證失敗
    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
        console.error("[PayPal] Webhook 缺少必要驗證 headers");
        return false;
    }

    // 呼叫 PayPal Notification Verify API
    const apiBase = config.mode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    try {
        // 取得 access token
        const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
            },
            body: "grant_type=client_credentials",
        });

        if (!tokenResponse.ok) {
            console.error("[PayPal] 取得 access token 失敗");
            return false;
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 呼叫驗證 API
        const verifyResponse = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                auth_algo: authAlgo,
                cert_url: certUrl,
                transmission_id: transmissionId,
                transmission_sig: transmissionSig,
                transmission_time: transmissionTime,
                webhook_id: webhookId,
                webhook_event: JSON.parse(body),
            }),
        });

        if (!verifyResponse.ok) {
            console.error(`[PayPal] Webhook 驗證 API 回傳 ${verifyResponse.status}`);
            return false;
        }

        const verifyData = await verifyResponse.json();
        const isValid = verifyData.verification_status === "SUCCESS";

        if (!isValid) {
            console.error(`[PayPal] Webhook 驗證失敗: ${verifyData.verification_status}`);
        }

        return isValid;
    } catch (error) {
        console.error("[PayPal] Webhook 驗證過程發生錯誤:", error);
        return false;
    }
}
