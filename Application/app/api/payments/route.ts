import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
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
    const session = await auth();
    if (!session?.user?.tenantId) {
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
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
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

    // 取得訂單
    const order = await db.order.findFirst({
      where: { id: orderId, tenantId: session.user.tenantId },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到訂單" } },
        { status: 404 }
      );
    }

    // 建立付款記錄
    const payment = await db.payment.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        orderId,
        provider,
        amount: order.totalAmount,
        currency: order.currency,
        status: "INITIATED",
      },
    });

    // 根據金流供應商產生交易
    let result: { formHtml?: string; redirectUrl?: string; clientSecret?: string } = {};

    switch (provider) {
      case "ECPAY": {
        const { createTransaction } = await import("@/lib/payment/ecpay");
        const ecpayResult = await createTransaction(
          {
            merchantId: process.env.ECPAY_MERCHANT_ID!,
            hashKey: process.env.ECPAY_HASH_KEY!,
            hashIV: process.env.ECPAY_HASH_IV!,
            isProduction: process.env.NODE_ENV === "production",
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
        break;
      }
      case "NEWEBPAY": {
        const { createTransaction } = await import("@/lib/payment/newebpay");
        const newebpayResult = await createTransaction(
          {
            merchantId: process.env.NEWEBPAY_MERCHANT_ID!,
            hashKey: process.env.NEWEBPAY_HASH_KEY!,
            hashIV: process.env.NEWEBPAY_HASH_IV!,
            isProduction: process.env.NODE_ENV === "production",
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
        break;
      }
      case "STRIPE": {
        const { createPaymentIntent } = await import("@/lib/payment/stripe");
        const stripeResult = await createPaymentIntent(
          {
            secretKey: process.env.STRIPE_SECRET_KEY!,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
          },
          {
            orderId: payment.id,
            amount: Number(order.totalAmount),
            successUrl: returnUrl,
            cancelUrl: returnUrl,
          }
        );
        result.clientSecret = stripeResult.clientSecret;
        break;
      }
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
