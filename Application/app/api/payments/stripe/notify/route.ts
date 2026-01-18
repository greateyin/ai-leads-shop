import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { verifyWebhook, getStripeConfigForTenant } from "@/lib/payment/stripe";

/**
 * POST /api/payments/stripe/notify
 * Stripe Webhook 回調端點
 * 
 * 注意：Stripe Connect 模式下，每個 tenant 有自己的 Stripe 帳號
 * 這裡支援兩種模式：
 * 1. Platform 模式（環境變數）- 單一平台帳號
 * 2. Connect 模式（database）- 每個 tenant 自己的帳號
 */
export async function POST(request: NextRequest) {
    try {
        const payload = await request.text();
        const signature = request.headers.get("stripe-signature");

        if (!signature) {
            console.error("[Stripe] Missing stripe-signature header");
            return NextResponse.json({ error: "Missing signature" }, { status: 400 });
        }

        // 嘗試解析 payload 取得 metadata 中的 tenantId 或 orderId
        let tenantId: string | undefined;
        let orderId: string | undefined;

        try {
            const rawEvent = JSON.parse(payload);
            const metadata = rawEvent?.data?.object?.metadata || {};
            tenantId = metadata.tenantId;
            orderId = metadata.orderId;
        } catch {
            // 無法預解析，繼續使用 Platform 模式
        }

        // 嘗試從 tenant 專屬設定取得 Stripe credentials
        let stripeConfig: { secretKey: string; webhookSecret: string } | null = null;

        if (tenantId) {
            stripeConfig = await getStripeConfigForTenant(tenantId);
        } else if (orderId) {
            // 從 orderId 找 tenantId
            const order = await db.order.findUnique({
                where: { id: orderId },
                select: { tenantId: true },
            });
            if (order) {
                stripeConfig = await getStripeConfigForTenant(order.tenantId);
            }
        }

        // 若無 tenant 專屬設定，fallback 到環境變數（Platform 模式）
        if (!stripeConfig) {
            const envSecretKey = process.env.STRIPE_SECRET_KEY;
            const envWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

            if (!envSecretKey || !envWebhookSecret) {
                console.error("[Stripe] No tenant config and no env vars configured");
                return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
            }

            stripeConfig = {
                secretKey: envSecretKey,
                webhookSecret: envWebhookSecret,
            };
        }

        // 驗證 webhook
        const { valid, event } = verifyWebhook(stripeConfig, payload, signature);

        if (!valid || !event) {
            console.error("[Stripe] Webhook verification failed");
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        console.log(`[Stripe] Received event: ${event.type}`);

        // 處理不同的事件類型
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const orderId = session.metadata?.orderId;
                const paymentIntentId = typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id;

                if (orderId) {
                    // 查找付款記錄
                    const payment = await db.payment.findFirst({
                        where: { orderId },
                        select: { id: true, tenantId: true, orderId: true },
                    });

                    if (payment) {
                        // 更新付款狀態
                        await db.payment.update({
                            where: { id: payment.id },
                            data: {
                                status: "PAID",
                                transactionNo: paymentIntentId,
                                paidAt: new Date(),
                            },
                        });

                        // 更新訂單狀態
                        await db.order.update({
                            where: { id: orderId },
                            data: {
                                paymentStatus: "PAID",
                                status: "PAID",
                            },
                        });

                        // 扣減庫存
                        const { deductStock } = await import("@/lib/stock");
                        const orderItems = await db.orderItem.findMany({
                            where: { orderId, tenantId: payment.tenantId },
                            select: { productId: true, variantId: true, quantity: true },
                        });
                        await deductStock(orderItems);

                        // 發送付款成功通知
                        try {
                            const order = await db.order.findFirst({
                                where: { id: orderId },
                                select: { orderNo: true, totalAmount: true, user: { select: { email: true } } },
                            });
                            if (order?.user?.email) {
                                const { sendPaymentSuccessEmail } = await import("@/lib/email");
                                await sendPaymentSuccessEmail(
                                    order.user.email,
                                    order.orderNo,
                                    Number(order.totalAmount)
                                );
                            }
                        } catch (emailError) {
                            console.error("[Stripe] 發送付款成功通知失敗:", emailError);
                        }

                        // 記錄通知
                        await db.paymentNotification.create({
                            data: {
                                id: generateId(),
                                tenantId: payment.tenantId,
                                paymentId: payment.id,
                                provider: "STRIPE",
                                payload: event as object,
                            },
                        });

                        console.log(`[Stripe] 訂單 ${orderId} 付款成功`);
                    }
                }
                break;
            }

            case "payment_intent.succeeded": {
                const paymentIntent = event.data.object;
                const orderId = paymentIntent.metadata?.orderId;

                if (orderId) {
                    console.log(`[Stripe] Payment Intent ${paymentIntent.id} succeeded for order ${orderId}`);
                }
                break;
            }

            case "payment_intent.payment_failed": {
                const paymentIntent = event.data.object;
                const orderId = paymentIntent.metadata?.orderId;

                if (orderId) {
                    // 先取得 payment 並驗證 tenantId
                    const payment = await db.payment.findFirst({
                        where: { orderId },
                        select: { id: true, tenantId: true },
                    });

                    if (payment) {
                        // 使用 tenantId 限制更新範圍，防止跨租戶誤更新
                        await db.payment.updateMany({
                            where: {
                                id: payment.id,
                                tenantId: payment.tenantId,
                            },
                            data: { status: "FAILED" },
                        });
                    }

                    console.log(`[Stripe] Payment failed for order ${orderId}`);
                }
                break;
            }

            case "charge.refunded": {
                const charge = event.data.object;
                console.log(`[Stripe] Charge ${charge.id} refunded`);
                break;
            }

            default:
                console.log(`[Stripe] Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[Stripe] Webhook error:", error);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
}
