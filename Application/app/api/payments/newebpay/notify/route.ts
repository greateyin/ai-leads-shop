import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyNotification } from "@/lib/payment/newebpay";
import { generateId } from "@/lib/id";

/**
 * POST /api/payments/newebpay/notify
 * 藍新金流回調通知
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const TradeInfo = formData.get("TradeInfo")?.toString() || "";
    const TradeSha = formData.get("TradeSha")?.toString() || "";

    // 驗證通知
    const result = verifyNotification(
      {
        merchantId: process.env.NEWEBPAY_MERCHANT_ID!,
        hashKey: process.env.NEWEBPAY_HASH_KEY!,
        hashIV: process.env.NEWEBPAY_HASH_IV!,
      },
      { TradeInfo, TradeSha }
    );

    if (!result.valid || !result.data) {
      console.error("NewebPay 通知驗證失敗");
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const paymentId = result.data.orderId.split("_")[0] || "";

    // 取得 payment 的 tenantId
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { tenantId: true, orderId: true },
    });

    // 如果找不到 payment，記錄錯誤並跳過通知
    if (!payment) {
      console.error(`NewebPay 通知：找不到對應的付款記錄 (paymentId: ${paymentId})`);
      return NextResponse.json({ success: false }, { status: 400 });
    }

    // 記錄通知
    await db.paymentNotification.create({
      data: {
        id: generateId(),
        tenantId: payment.tenantId,
        paymentId,
        provider: "NEWEBPAY",
        payload: { TradeInfo, TradeSha, ...result.data },
        verified: true,
      },
    });

    // 更新付款狀態
    if (result.data.status === "paid") {
      await db.payment.update({
        where: { id: paymentId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          rawResponse: result.data,
        },
      });

      // 更新訂單狀態 (使用已取得的 payment.orderId 和 tenantId)
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

      // 發送付款成功通知給顧客
      try {
        const order = await db.order.findFirst({
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
        console.error("[NewebPay] 發送付款成功通知失敗:", emailError);
      }

      console.log(`[NewebPay] 訂單 ${payment.orderId} 付款成功，已扣減庫存並發送通知`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("處理 NewebPay 通知錯誤:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
