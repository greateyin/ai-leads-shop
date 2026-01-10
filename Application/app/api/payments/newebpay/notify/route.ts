import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyNotification } from "@/lib/payment/newebpay";

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

    // 記錄通知
    await db.paymentNotification.create({
      data: {
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

      // 更新訂單狀態
      const payment = await db.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true },
      });

      if (payment) {
        await db.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: "PAID",
            status: "PAID",
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("處理 NewebPay 通知錯誤:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
