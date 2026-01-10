/**
 * Stripe 金流 SDK 封裝
 * @see https://stripe.com/docs/api
 */

// TODO: 安裝後取消註解
// import Stripe from "stripe";

/**
 * Stripe 配置介面
 */
interface StripeConfig {
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
  // TODO: 整合 Stripe SDK
  // const stripe = new Stripe(config.secretKey);
  // const session = await stripe.checkout.sessions.create({
  //   payment_method_types: ["card"],
  //   line_items: [
  //     {
  //       price_data: {
  //         currency: order.currency || "twd",
  //         product_data: {
  //           name: order.description || "Manus AI Shop 訂單",
  //         },
  //         unit_amount: order.amount * 100, // Stripe 使用最小貨幣單位
  //       },
  //       quantity: 1,
  //     },
  //   ],
  //   mode: "payment",
  //   success_url: order.successUrl,
  //   cancel_url: order.cancelUrl,
  //   metadata: {
  //     orderId: order.orderId,
  //   },
  // });

  // return { sessionId: session.id, url: session.url! };

  // 模擬回應
  return {
    sessionId: `cs_test_${Date.now()}`,
    url: order.successUrl,
  };
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
  // TODO: 整合 Stripe SDK
  // const stripe = new Stripe(config.secretKey);
  // const paymentIntent = await stripe.paymentIntents.create({
  //   amount: order.amount * 100,
  //   currency: order.currency || "twd",
  //   metadata: {
  //     orderId: order.orderId,
  //   },
  // });

  // return {
  //   paymentIntentId: paymentIntent.id,
  //   clientSecret: paymentIntent.client_secret!,
  // };

  // 模擬回應
  return {
    paymentIntentId: `pi_test_${Date.now()}`,
    clientSecret: `pi_test_${Date.now()}_secret`,
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
): { valid: boolean; event?: unknown } {
  // TODO: 整合 Stripe SDK
  // const stripe = new Stripe(config.secretKey);
  // try {
  //   const event = stripe.webhooks.constructEvent(
  //     payload,
  //     signature,
  //     config.webhookSecret
  //   );
  //   return { valid: true, event };
  // } catch (err) {
  //   return { valid: false };
  // }

  // 模擬驗證
  return { valid: signature.length > 0, event: JSON.parse(payload) };
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
  // TODO: 整合 Stripe SDK
  // const stripe = new Stripe(config.secretKey);
  // const refund = await stripe.refunds.create({
  //   payment_intent: paymentIntentId,
  //   ...(amount && { amount: amount * 100 }),
  // });

  // return { refundId: refund.id, status: refund.status };

  // 模擬回應
  return {
    refundId: `re_test_${Date.now()}`,
    status: "succeeded",
  };
}
