import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 建立付款 Schema
 */
const createPaymentSchema = z.object({
  orderId: z.string(),
  provider: z.enum(["ECPAY", "NEWEBPAY", "STRIPE"]),
  returnUrl: z.string().url(),
  notifyUrl: z.string().url().optional(),
});

/**
 * GET /api/payments
 * 取得付款記錄列表
 */
export async function GET(request: NextRequest) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const orderId = searchParams.get("orderId");
    const status = searchParams.get("status");

    const where = {
      tenantId: session.user.tenantId,
      ...(orderId && { orderId }),
      ...(status && { status: status as never }),
    };

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { id: true, orderNo: true, totalAmount: true } },
        },
      }),
      db.payment.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: payments,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("取得付款記錄錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得付款記錄失敗" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payments
 * 建立付款交易
 */
/**
 * POST /api/payments
 * 建立付款交易
 */
export async function POST(request: NextRequest) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = createPaymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
        },
        { status: 400 }
      );
    }

    const { orderId, provider, returnUrl, notifyUrl } = validation.data;

    // 0. Idempotency Check: 檢查是否已有相同訂單的待付款記錄
    const existingPayment = await db.payment.findFirst({
      where: {
        tenantId: session.user.tenantId, // Ensure tenant scope scope
        orderId,
        provider,
        status: { in: ["INITIATED", "PENDING"] },
      },
    });

    // 1. 取得並驗證訂單
    const order = await db.order.findFirst({
      where: { id: orderId, tenantId: session.user.tenantId },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到訂單" } },
        { status: 404 }
      );
    }

    // 2. 取得租戶的金流配置 (Dynamic Config)
    // 這裡需要將 string 轉為 PaymentProviderType，假設 input 驗證已通過 enum check
    const { getProviderConfig } = await import("@/lib/payment");
    const providerConfig = await getProviderConfig(session.user.tenantId, provider as any);

    if (!providerConfig) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "CONFIG_MISSING", message: `尚未設定 ${provider} 金流資訊` }
        },
        { status: 400 }
      );
    }

    // 3. 建立或使用現有付款記錄
    let payment = existingPayment;
    if (!payment) {
      payment = await db.payment.create({
        data: {
          id: generateId(),
          tenantId: session.user.tenantId,
          orderId,
          provider: provider as any,
          amount: order.totalAmount,
          currency: order.currency,
          status: "INITIATED",
        },
      });
    }

    // 4. 根據金流供應商產生交易，傳入 DB config
    let result: { formHtml?: string; redirectUrl?: string; clientSecret?: string } = {};
    let transactionNo = "";
    let providerOrderNo = "";

    switch (provider) {
      case "ECPAY": {
        const { createTransaction } = await import("@/lib/payment/ecpay");
        const ecpayResult = await createTransaction(
          {
            merchantId: providerConfig.merchantId as string,
            hashKey: providerConfig.hashKey as string,
            hashIV: providerConfig.hashIV as string,
            isProduction: providerConfig.isProduction === true || providerConfig.isProduction === "true",
          },
          {
            orderId: payment.id,
            amount: Number(order.totalAmount),
            itemName: `訂單 ${order.orderNo}`,
            returnUrl,
            notifyUrl: notifyUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/ecpay/notify`,
          }
        );
        result.formHtml = ecpayResult.formHtml;
        transactionNo = ecpayResult.merchantTradeNo;
        break;
      }
      case "NEWEBPAY": {
        const { createTransaction } = await import("@/lib/payment/newebpay");
        const newebpayResult = await createTransaction(
          {
            merchantId: providerConfig.merchantId as string,
            hashKey: providerConfig.hashKey as string,
            hashIV: providerConfig.hashIV as string,
            isProduction: providerConfig.isProduction === true || providerConfig.isProduction === "true",
          },
          {
            orderId: payment.id,
            amount: Number(order.totalAmount),
            itemDesc: `訂單 ${order.orderNo}`,
            email: session.user.email || "",
            returnUrl,
            notifyUrl: notifyUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/newebpay/notify`,
          }
        );
        result.formHtml = newebpayResult.formHtml;
        transactionNo = newebpayResult.merchantOrderNo;
        break;
      }
      case "STRIPE": {
        const { createPaymentIntent } = await import("@/lib/payment/stripe");
        const stripeResult = await createPaymentIntent(
          {
            secretKey: (providerConfig.secretKey || providerConfig.STRIPE_SECRET_KEY) as string,
            webhookSecret: (providerConfig.webhookSecret || providerConfig.STRIPE_WEBHOOK_SECRET) as string,
          },
          {
            orderId: payment.id,
            amount: Number(order.totalAmount),
            successUrl: returnUrl,
            cancelUrl: returnUrl,
          }
        );
        result.clientSecret = stripeResult.clientSecret;
        providerOrderNo = stripeResult.paymentIntentId;
        break;
      }
    }

    // 更新付款記錄的交易編號
    if (transactionNo || providerOrderNo) {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          transactionNo: transactionNo || undefined,
          providerOrderNo: providerOrderNo || undefined,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        ...result,
      },
    });
  } catch (error) {
    console.error("建立付款交易錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立付款交易失敗" } },
      { status: 500 }
    );
  }
}
