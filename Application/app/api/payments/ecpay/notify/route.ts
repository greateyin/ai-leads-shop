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

    // 取得 payment 的 tenantId
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { tenantId: true, orderId: true },
    });

    // 如果找不到 payment，記錄錯誤並跳過通知
    if (!payment) {
      console.error(`ECPay 通知：找不到對應的付款記錄 (paymentId: ${paymentId})`);
      return new NextResponse("0|Error", { status: 400 });
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

    return new NextResponse("1|OK");
  } catch (error) {
    console.error("處理 ECPay 通知錯誤:", error);
    return new NextResponse("0|Error", { status: 500 });
  }
}
