import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { getPayPalConfigForTenant, capturePayPalOrder, verifyPayPalWebhook } from "@/lib/payment/paypal";

/**
 * POST /api/payments/paypal/notify
 * PayPal Webhook 回調端點
 */
export async function POST(request: NextRequest) {
    try {
        const payload = await request.text();
        const event = JSON.parse(payload);

        console.log(`[PayPal] Received event: ${event.event_type}`);

        // [安全] 取得 PayPal 驗證所需的 headers
        const paypalHeaders: Record<string, string> = {};
        for (const key of ["paypal-transmission-id", "paypal-transmission-time", "paypal-cert-url", "paypal-auth-algo", "paypal-transmission-sig"]) {
            const val = request.headers.get(key);
            if (val) paypalHeaders[key] = val;
        }

        // 處理不同的事件類型
        switch (event.event_type) {
            case "CHECKOUT.ORDER.APPROVED": {
                // 買家已核准付款，需要擷取付款
                const paypalOrderId = event.resource?.id;
                const customId = event.resource?.purchase_units?.[0]?.reference_id;

                if (!paypalOrderId || !customId) {
                    console.error("[PayPal] Missing order ID or reference ID");
                    return NextResponse.json({ error: "Invalid event data" }, { status: 400 });
                }

                // 查找我們的訂單
                const payment = await db.payment.findFirst({
                    where: { orderId: customId },
                    select: { id: true, tenantId: true, orderId: true },
                });

                if (!payment) {
                    console.error(`[PayPal] Payment not found for order ${customId}`);
                    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
                }

                // 取得租戶的 PayPal 設定
                const config = await getPayPalConfigForTenant(payment.tenantId);
                if (!config) {
                    console.error(`[PayPal] PayPal not configured for tenant ${payment.tenantId}`);
                    return NextResponse.json({ error: "PayPal not configured" }, { status: 500 });
                }

                // [安全] 驗證 PayPal webhook 簽章
                if (config.webhookId) {
                    const isValid = await verifyPayPalWebhook(config, config.webhookId, paypalHeaders, payload);
                    if (!isValid) {
                        console.error(`[PayPal] Webhook 簽章驗證失敗 (tenant: ${payment.tenantId})`);
                        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
                    }
                    console.log(`[PayPal] Webhook 簽章驗證成功 (tenant: ${payment.tenantId})`);
                } else {
                    console.warn(`[PayPal] 租戶 ${payment.tenantId} 未設定 webhookId，無法驗證簽章`);
                    return NextResponse.json({ error: "Webhook verification not configured" }, { status: 400 });
                }

                // 擷取付款
                try {
                    const { captureId, status } = await capturePayPalOrder(config, paypalOrderId);
                    console.log(`[PayPal] Captured order ${paypalOrderId}, captureId: ${captureId}, status: ${status}`);

                    if (status === "COMPLETED") {
                        // 更新付款狀態（加 tenantId 限制）
                        await db.payment.updateMany({
                            where: { id: payment.id, tenantId: payment.tenantId },
                            data: {
                                status: "PAID",
                                transactionNo: captureId,
                                paidAt: new Date(),
                            },
                        });

                        // 更新訂單狀態（加 tenantId 限制）
                        await db.order.updateMany({
                            where: { id: payment.orderId, tenantId: payment.tenantId },
                            data: {
                                paymentStatus: "PAID",
                                status: "PAID",
                            },
                        });

                        // 扣減庫存
                        const { deductStock } = await import("@/lib/stock");
                        const orderItems = await db.orderItem.findMany({
                            where: { orderId: payment.orderId, tenantId: payment.tenantId },
                            select: { productId: true, variantId: true, quantity: true },
                        });
                        await deductStock(orderItems);

                        // 發送付款成功通知
                        try {
                            const order = await db.order.findFirst({
                                where: { id: payment.orderId, tenantId: payment.tenantId },
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
                            console.error("[PayPal] 發送付款成功通知失敗:", emailError);
                        }

                        // 記錄通知
                        await db.paymentNotification.create({
                            data: {
                                id: generateId(),
                                tenantId: payment.tenantId,
                                paymentId: payment.id,
                                provider: "PAYPAL",
                                payload: event as object,
                            },
                        });

                        console.log(`[PayPal] 訂單 ${payment.orderId} 付款成功`);
                    }
                } catch (captureError) {
                    console.error("[PayPal] Capture failed:", captureError);
                }
                break;
            }

            case "PAYMENT.CAPTURE.COMPLETED": {
                // 付款擷取完成
                const captureId = event.resource?.id;
                const customId = event.resource?.custom_id;

                console.log(`[PayPal] Capture completed: ${captureId} for ${customId}`);
                break;
            }

            case "PAYMENT.CAPTURE.REFUNDED": {
                // 退款完成
                const refundId = event.resource?.id;
                console.log(`[PayPal] Refund completed: ${refundId}`);
                break;
            }

            default:
                console.log(`[PayPal] Unhandled event type: ${event.event_type}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[PayPal] Webhook error:", error);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
}
