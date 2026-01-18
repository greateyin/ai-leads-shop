import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyNotification } from "@/lib/payment/ecpay";
import { generateId } from "@/lib/id";

/**
 * POST /api/payments/ecpay/notify
 * 綠界金流回調通知
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const payload: Record<string, string> = {};

    formData.forEach((value, key) => {
      payload[key] = value.toString();
    });

    // 驗證通知
    const result = verifyNotification(
      {
        merchantId: process.env.ECPAY_MERCHANT_ID!,
        hashKey: process.env.ECPAY_HASH_KEY!,
        hashIV: process.env.ECPAY_HASH_IV!,
      },
      payload
    );

    if (!result.valid) {
      console.error("ECPay 通知驗證失敗");
      return new NextResponse("0|Error", { status: 400 });
    }

    // 記錄通知
    const paymentId = result.orderId?.split("_")[0] || "";
    const transactionNo = payload.TradeNo || "";

    // 取得 payment 的 tenantId
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { tenantId: true, orderId: true, status: true },
    });

    // 如果找不到 payment，記錄錯誤並跳過通知
    if (!payment) {
      console.error(`ECPay 通知：找不到對應的付款記錄 (paymentId: ${paymentId})`);
      return new NextResponse("0|Error", { status: 400 });
    }

    // 冪等性檢查：檢查是否已處理過相同 transactionNo
    if (transactionNo) {
      const existingNotification = await db.paymentNotification.findFirst({
        where: {
          paymentId,
          provider: "ECPAY",
          payload: {
            path: ["TradeNo"],
            equals: transactionNo,
          },
        },
      });

      if (existingNotification) {
        console.log(`[ECPay] 重複通知已忽略: ${transactionNo}`);
        return new NextResponse("1|OK"); // 返回成功避免重試
      }
    }

    // 冪等性檢查：如果付款已經是 PAID 狀態，直接返回成功
    if (payment.status === "PAID") {
      console.log(`[ECPay] 付款已處理，忽略重複通知: ${paymentId}`);
      return new NextResponse("1|OK");
    }

    await db.paymentNotification.create({
      data: {
        id: generateId(),
        tenantId: payment.tenantId,
        paymentId,
        provider: "ECPAY",
        payload,
        verified: true,
      },
    });

    // 更新付款狀態
    if (result.status === "paid") {
      await db.payment.update({
        where: { id: paymentId },
        data: {
          status: "PAID",
          transactionNo: payload.TradeNo,
          paidAt: new Date(),
          rawResponse: payload,
        },
      });

      // 更新訂單狀態 (使用已取得的 payment.orderId)
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
        where: { orderId: payment.orderId, tenantId: payment.tenantId },
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
        console.error("[ECPay] 發送付款成功通知失敗:", emailError);
      }

      console.log(`[ECPay] 訂單 ${payment.orderId} 付款成功，已扣減庫存並發送通知`);
    }

    return new NextResponse("1|OK");
  } catch (error) {
    console.error("處理 ECPay 通知錯誤:", error);
    return new NextResponse("0|Error", { status: 500 });
  }
}
