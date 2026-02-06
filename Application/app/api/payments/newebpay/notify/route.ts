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

    // [安全] 先嘗試用全域金鑰預解密，取得 paymentId 後再用 tenant-specific 金鑰驗證
    // NewebPay 的流程是：解密 TradeInfo 得到 MerchantOrderNo，再查 payment
    // 因為要知道用誰的金鑰解密，需先查 DB，但解密前不知道 tenant
    // 策略：遍歷所有啟用 NewebPay 的 provider，嘗試驗證並找到對應的 tenant
    const newebpayProviders = await db.paymentProvider.findMany({
      where: { type: "NEWEBPAY" },
      select: { tenantId: true, config: true },
    });

    let verifiedResult: { valid: boolean; data?: { orderId: string; amount: number; status: string; message: string } } | null = null;
    let matchedTenantId: string | null = null;

    // 嘗試各租戶金鑰驗證
    for (const provider of newebpayProviders) {
      const cfg = provider.config as Record<string, string> | null;
      if (!cfg) continue;
      const mId = cfg.merchantId || cfg.NEWEBPAY_MERCHANT_ID;
      const hKey = cfg.hashKey || cfg.NEWEBPAY_HASH_KEY;
      const hIV = cfg.hashIV || cfg.NEWEBPAY_HASH_IV;
      if (!mId || !hKey || !hIV) continue;

      const tryResult = verifyNotification({ merchantId: mId, hashKey: hKey, hashIV: hIV }, { TradeInfo, TradeSha });
      if (tryResult.valid && tryResult.data) {
        verifiedResult = tryResult;
        matchedTenantId = provider.tenantId;
        break;
      }
    }

    // 若所有 tenant-specific 金鑰都失敗，fallback 到全域 env var（過渡期）
    if (!verifiedResult) {
      const globalMerchantId = process.env.NEWEBPAY_MERCHANT_ID;
      const globalHashKey = process.env.NEWEBPAY_HASH_KEY;
      const globalHashIV = process.env.NEWEBPAY_HASH_IV;
      if (globalMerchantId && globalHashKey && globalHashIV) {
        verifiedResult = verifyNotification(
          { merchantId: globalMerchantId, hashKey: globalHashKey, hashIV: globalHashIV },
          { TradeInfo, TradeSha }
        );
      }
    }

    if (!verifiedResult?.valid || !verifiedResult.data) {
      console.error("[NewebPay] 通知驗證失敗：所有金鑰均不符合");
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const paymentId = verifiedResult.data.orderId.split("_")[0] || "";

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { tenantId: true, orderId: true },
    });

    if (!payment) {
      console.error(`[NewebPay] 找不到付款記錄 (paymentId: ${paymentId})`);
      return NextResponse.json({ success: false }, { status: 400 });
    }

    // [安全] 驗證 tenant 一致性：若從 provider 匹配到 tenant，確認與 payment 的 tenant 相同
    if (matchedTenantId && matchedTenantId !== payment.tenantId) {
      console.error(`[NewebPay] 跨租戶異常：驗簽 tenant=${matchedTenantId}, payment tenant=${payment.tenantId}`);
      return NextResponse.json({ success: false }, { status: 403 });
    }

    // 記錄通知
    await db.paymentNotification.create({
      data: {
        id: generateId(),
        tenantId: payment.tenantId,
        paymentId,
        provider: "NEWEBPAY",
        payload: { TradeInfo, TradeSha, ...verifiedResult.data },
        verified: true,
      },
    });

    // 更新付款狀態（加 tenantId 限制）
    if (verifiedResult.data.status === "paid") {
      await db.payment.updateMany({
        where: { id: paymentId, tenantId: payment.tenantId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          rawResponse: verifiedResult.data,
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

      // 發送付款成功通知給顧客
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
