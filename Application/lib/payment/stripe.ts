/**
 * Stripe 金流 SDK 封裝
 * @see https://stripe.com/docs/api
 */

import Stripe from "stripe";
import { db } from "@/lib/db";

/**
 * Stripe 配置介面
 */
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

/**
 * 訂單資訊介面
 */
interface OrderInfo {
  orderId: string;
  amount: number;
  currency?: string;
  description?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

/**
 * 取得 Stripe Client
 */
function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    typescript: true,
  });
}

/**
 * 根據 tenantId 取得該租戶的 Stripe 設定
 * @param tenantId - 租戶 ID
 * @returns Stripe 配置，若無則回傳 null
 */
export async function getStripeConfigForTenant(tenantId: string): Promise<StripeConfig | null> {
  const provider = await db.paymentProvider.findFirst({
    where: {
      tenantId,
      type: "STRIPE",
    },
    select: { config: true },
  });

  if (!provider?.config) {
    return null;
  }

  const config = provider.config as Record<string, string>;
  const secretKey = config.secretKey || config.STRIPE_SECRET_KEY;
  const webhookSecret = config.webhookSecret || config.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    return null;
  }

  return {
    secretKey,
    webhookSecret: webhookSecret || "",
  };
}

/**
 * 根據 orderId 取得對應租戶的 Stripe 設定
 */
export async function getStripeConfigForOrder(orderId: string): Promise<StripeConfig | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { tenantId: true },
  });

  if (!order) {
    return null;
  }

  return getStripeConfigForTenant(order.tenantId);
}

/**
 * 建立 Stripe Checkout Session
 * @param config - Stripe 配置
 * @param order - 訂單資訊
 * @returns Session URL
 */
export async function createCheckoutSession(
  config: StripeConfig,
  order: OrderInfo
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripeClient(config.secretKey);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: order.currency || "twd",
          product_data: {
            name: order.description || "AIsell 訂單",
          },
          unit_amount: Math.round(order.amount * 100), // Stripe 使用最小貨幣單位
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: order.successUrl,
    cancel_url: order.cancelUrl,
    customer_email: order.customerEmail,
    metadata: {
      orderId: order.orderId,
    },
  });

  if (!session.url) {
    throw new Error("Failed to create Stripe checkout session");
  }

  return { sessionId: session.id, url: session.url };
}

/**
 * 建立 Payment Intent
 * @param config - Stripe 配置
 * @param order - 訂單資訊
 * @returns Client Secret
 */
export async function createPaymentIntent(
  config: StripeConfig,
  order: OrderInfo
): Promise<{ paymentIntentId: string; clientSecret: string }> {
  const stripe = getStripeClient(config.secretKey);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(order.amount * 100),
    currency: order.currency || "twd",
    metadata: {
      orderId: order.orderId,
    },
    automatic_payment_methods: {
      enabled: true,
    },
  });

  if (!paymentIntent.client_secret) {
    throw new Error("Failed to create Stripe payment intent");
  }

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
  };
}

/**
 * 驗證 Stripe Webhook
 * @param config - Stripe 配置
 * @param payload - 請求 body
 * @param signature - Stripe-Signature header
 * @returns 驗證結果
 */
export function verifyWebhook(
  config: StripeConfig,
  payload: string,
  signature: string
): { valid: boolean; event?: Stripe.Event } {
  const stripe = getStripeClient(config.secretKey);

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      config.webhookSecret
    );
    return { valid: true, event };
  } catch (err) {
    console.error("[Stripe] Webhook verification failed:", err);
    return { valid: false };
  }
}

/**
 * 處理退款
 * @param config - Stripe 配置
 * @param paymentIntentId - Payment Intent ID
 * @param amount - 退款金額 (選填，不填則全額退款)
 */
export async function refund(
  config: StripeConfig,
  paymentIntentId: string,
  amount?: number
): Promise<{ refundId: string; status: string }> {
  const stripe = getStripeClient(config.secretKey);

  const refundResult = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount && { amount: Math.round(amount * 100) }),
  });

  return { refundId: refundResult.id, status: refundResult.status || "pending" };
}

/**
 * 取得 Payment Intent 狀態
 * @param config - Stripe 配置
 * @param paymentIntentId - Payment Intent ID
 */
export async function getPaymentIntent(
  config: StripeConfig,
  paymentIntentId: string
): Promise<{ status: string; amount: number; metadata: Record<string, string> }> {
  const stripe = getStripeClient(config.secretKey);

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount / 100,
    metadata: (paymentIntent.metadata || {}) as Record<string, string>,
  };
}

/**
 * 取得 Checkout Session
 * @param config - Stripe 配置
 * @param sessionId - Checkout Session ID
 */
export async function getCheckoutSession(
  config: StripeConfig,
  sessionId: string
): Promise<{ status: string; paymentIntentId?: string; metadata: Record<string, string> }> {
  const stripe = getStripeClient(config.secretKey);

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return {
    status: session.status || "unknown",
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    metadata: (session.metadata || {}) as Record<string, string>,
  };
}
