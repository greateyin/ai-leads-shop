import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { withAdminAuth, type AuthenticatedSession } from "@/lib/api/with-auth";

/**
 * 退款請求驗證 Schema
 */
const refundSchema = z.object({
  amount: z.number().positive("退款金額必須大於 0").optional(),
  reason: z.string().optional(),
});

/**
 * POST /api/payments/[id]/refund
 * 處理退款請求（需要 OWNER / ADMIN 角色）
 */
export const POST = withAdminAuth(async (
  request: NextRequest,
  session: AuthenticatedSession,
  context?: { params: Promise<{ id: string }> }
) => {
  try {
    const { id: paymentId } = await context!.params;
    const body = await request.json();
    const validation = refundSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "驗證失敗",
            details: validation.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    // 取得付款記錄
    const payment = await db.payment.findFirst({
      where: {
        id: paymentId,
        tenantId: session.user.tenantId,
      },
      include: { order: true },
    });

    if (!payment) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "找不到付款記錄" },
        },
        { status: 404 }
      );
    }

    // 檢查付款狀態
    if (payment.status !== "PAID") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_STATUS",
            message: "只有已付款的訂單可以退款",
          },
        },
        { status: 400 }
      );
    }

    const refundAmount = validation.data.amount || Number(payment.amount);

    // 檢查退款金額
    if (refundAmount > Number(payment.amount)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_AMOUNT",
            message: "退款金額不能超過付款金額",
          },
        },
        { status: 400 }
      );
    }

    // 建立退款記錄
    const refund = await db.paymentRefund.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        paymentId,
        amount: refundAmount,
        currency: payment.currency,
        status: "PENDING",
      },
    });

    // TODO: 呼叫金流供應商 API 進行實際退款
    // 根據 payment.provider 決定呼叫哪個 SDK
    // switch (payment.provider) {
    //   case "ECPAY":
    //     await ecpayRefund(payment, refundAmount);
    //     break;
    //   case "NEWEBPAY":
    //     await newebpayRefund(payment, refundAmount);
    //     break;
    //   case "STRIPE":
    //     await stripeRefund(payment, refundAmount);
    //     break;
    // }

    // 更新付款與訂單狀態
    const isFullRefund = refundAmount >= Number(payment.amount);

    await db.$transaction([
      db.payment.update({
        where: { id: paymentId },
        data: { status: isFullRefund ? "REFUNDED" : "PAID" },
      }),
      db.order.update({
        where: { id: payment.orderId },
        data: { status: "REFUNDING" },
      }),
      db.paymentRefund.update({
        where: { id: refund.id },
        data: { status: "REFUNDED" },
      }),
    ]);

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "REFUND",
        entityType: "Payment",
        entityId: paymentId,
        newValue: {
          refundId: refund.id,
          amount: refundAmount,
          reason: validation.data.reason,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        refundId: refund.id,
        amount: refundAmount,
        currency: payment.currency,
        status: "REFUNDED",
      },
    });
  } catch (error) {
    console.error("Refund error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "退款處理失敗" },
      },
      { status: 500 }
    );
  }
});
