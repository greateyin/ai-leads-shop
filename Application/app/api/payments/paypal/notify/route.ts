import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { getPayPalConfigForTenant, capturePayPalOrder } from "@/lib/payment/paypal";

/**
 * POST /api/payments/paypal/notify
 * PayPal Webhook 回調端點
 */
export async function POST(request: NextRequest) {
    try {
        const payload = await request.text();
        const event = JSON.parse(payload);

        console.log(`[PayPal] Received event: ${event.event_type}`);

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

                // 擷取付款
                try {
                    const { captureId, status } = await capturePayPalOrder(config, paypalOrderId);
                    console.log(`[PayPal] Captured order ${paypalOrderId}, captureId: ${captureId}, status: ${status}`);

                    if (status === "COMPLETED") {
                        // 更新付款狀態
                        await db.payment.update({
                            where: { id: payment.id },
                            data: {
                                status: "PAID",
                                transactionNo: captureId,
                                paidAt: new Date(),
                            },
                        });

                        // 更新訂單狀態
                        await db.order.update({
                            where: { id: payment.orderId },
                            data: {
                                paymentStatus: "PAID",
                                status: "PAID",
                            },
                        });

                        // 扣減庫存
                        const { deductStock } = await import("@/lib/stock");
                        const orderItems = await db.orderItem.findMany({
                            where: { orderId: payment.orderId },
                            select: { productId: true, variantId: true, quantity: true },
                        });
                        await deductStock(orderItems);

                        // 發送付款成功通知
                        try {
                            const order = await db.order.findUnique({
                                where: { id: payment.orderId },
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
