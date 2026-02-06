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

        // [安全] 驗簽策略：先用 Platform secret 驗，失敗再嘗試 tenant-specific secret
        // 絕不可用未驗證 payload 中的 tenantId 來選擇 secret（防止跨租戶攻擊）
        let verifiedEvent: ReturnType<typeof verifyWebhook>["event"] = undefined;
        let verifiedTenantId: string | null = null; // 用於後續一致性檢查

        // 策略一：Platform 模式（環境變數）
        const envSecretKey = process.env.STRIPE_SECRET_KEY;
        const envWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (envSecretKey && envWebhookSecret) {
            const platformConfig = { secretKey: envSecretKey, webhookSecret: envWebhookSecret };
            const result = verifyWebhook(platformConfig, payload, signature);
            if (result.valid && result.event) {
                verifiedEvent = result.event;
                verifiedTenantId = null; // Platform 模式，tenantId 由 event metadata 決定
            }
        }

        // 策略二：Connect 模式（每個 tenant 有自己的 Stripe 帳號）
        // 只有在 Platform 驗簽失敗時才嘗試，且需依 Stripe account header 查找
        if (!verifiedEvent) {
            const stripeAccountId = request.headers.get("stripe-account");
            if (stripeAccountId) {
                // 用 Stripe Connect Account ID 查找 tenant（非使用 payload 中的 metadata）
                const provider = await db.paymentProvider.findFirst({
                    where: {
                        type: "STRIPE",
                        config: { path: ["stripeAccountId"], equals: stripeAccountId },
                    },
                    select: { tenantId: true, config: true },
                });

                if (provider) {
                    const config = provider.config as Record<string, string>;
                    const tenantConfig = {
                        secretKey: config.secretKey || config.STRIPE_SECRET_KEY || "",
                        webhookSecret: config.webhookSecret || config.STRIPE_WEBHOOK_SECRET || "",
                    };
                    if (tenantConfig.secretKey && tenantConfig.webhookSecret) {
                        const result = verifyWebhook(tenantConfig, payload, signature);
                        if (result.valid && result.event) {
                            verifiedEvent = result.event;
                            verifiedTenantId = provider.tenantId;
                        }
                    }
                }
            }
        }

        if (!verifiedEvent) {
            console.error("[Stripe] Webhook verification failed with all available secrets");
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        const event = verifiedEvent;

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
                    // [安全] 查找付款記錄，加上 tenantId 一致性檢查
                    const paymentWhere = verifiedTenantId
                        ? { orderId, tenantId: verifiedTenantId }
                        : { orderId };

                    const payment = await db.payment.findFirst({
                        where: paymentWhere,
                        select: { id: true, tenantId: true, orderId: true },
                    });

                    if (payment) {
                        // [安全] Connect 模式下，驗證 payment 的 tenantId 與驗簽用的 tenantId 一致
                        if (verifiedTenantId && payment.tenantId !== verifiedTenantId) {
                            console.error(`[Stripe] 跨租戶異常：驗簽 tenant=${verifiedTenantId}, payment tenant=${payment.tenantId}`);
                            return NextResponse.json({ error: "Tenant mismatch" }, { status: 403 });
                        }

                        // 更新付款狀態（使用 tenantId 限制）
                        await db.payment.updateMany({
                            where: { id: payment.id, tenantId: payment.tenantId },
                            data: {
                                status: "PAID",
                                transactionNo: paymentIntentId,
                                paidAt: new Date(),
                            },
                        });

                        // 更新訂單狀態（使用 tenantId 限制）
                        await db.order.updateMany({
                            where: { id: orderId, tenantId: payment.tenantId },
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
                                where: { id: orderId, tenantId: payment.tenantId },
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
                    // [安全] 查找 payment 時加上 tenantId 一致性檢查
                    const failPaymentWhere = verifiedTenantId
                        ? { orderId, tenantId: verifiedTenantId }
                        : { orderId };

                    const payment = await db.payment.findFirst({
                        where: failPaymentWhere,
                        select: { id: true, tenantId: true },
                    });

                    if (payment) {
                        // [安全] Connect 模式下驗證租戶一致性
                        if (verifiedTenantId && payment.tenantId !== verifiedTenantId) {
                            console.error(`[Stripe] 跨租戶異常（FAILED）：驗簽 tenant=${verifiedTenantId}, payment tenant=${payment.tenantId}`);
                            break;
                        }

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
