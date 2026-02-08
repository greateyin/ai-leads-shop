import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDefaultProvider, type PaymentFormData } from "@/lib/payment";
import { generateId } from "@/lib/id";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";
import { authWithTenant } from "@/lib/api/auth-helpers";

/**
 * 付款請求 Schema
 * 訪客用 email 驗證身份，登入用戶用 session
 */
const payRequestSchema = z.object({
  /** 訪客驗證用 email（訪客訂單必填） */
  email: z.string().email().optional(),
  /** 付款完成後的返回 URL */
  returnUrl: z.string().url(),
});

/**
 * POST /api/orders/[id]/pay
 * 產生金流付款表單資料（支援訪客）
 *
 * 安全策略：
 * - Tenant 邊界：訂單的 tenantId 必須與 request host 解析出的 tenant 匹配
 * - 登入用戶：session.userId 必須與 order.userId 匹配
 * - 訪客用戶：email 必填且必須與 order.metadata.guestEmail 匹配
 *
 * 流程：
 * 1. 解析 tenant + 驗證訂單歸屬
 * 2. 身份驗證（session 或 email）
 * 3. 查詢或建立 payment 記錄
 * 4. 根據金流供應商產生加密表單資料
 * 5. 回傳結構化 { actionUrl, fields } 供前端渲染 auto-submit form
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await request.json();
    const validation = payRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: validation.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { email, returnUrl } = validation.data;

    // ── 0. Tenant 邊界驗證 ──
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "TENANT_NOT_FOUND", message: "無法解析租戶" } },
        { status: 400 }
      );
    }

    // 1. 查詢訂單（含 tenant 資訊），限定當前 tenant
    const order = await db.order.findFirst({
      where: { id: orderId, tenantId: tenant.tenantId },
      select: {
        id: true,
        orderNo: true,
        tenantId: true,
        totalAmount: true,
        currency: true,
        status: true,
        paymentStatus: true,
        metadata: true,
        userId: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到訂單" } },
        { status: 404 }
      );
    }

    // 從 metadata 取得訪客 email（guest checkout 存在 metadata.guestEmail）
    const metadata = (order.metadata ?? {}) as Record<string, unknown>;
    const guestEmail = typeof metadata.guestEmail === "string" ? metadata.guestEmail : null;

    // ── 2. 身份驗證 ──
    if (order.userId) {
      // 登入用戶訂單 → 用 session 驗證
      const { session } = await authWithTenant({ requireTenant: false });
      if (!session || session.user.id !== order.userId) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "無權操作此訂單" } },
          { status: 403 }
        );
      }
    } else if (guestEmail) {
      // 訪客訂單 → email 必填且必須匹配
      if (!email) {
        return NextResponse.json(
          { success: false, error: { code: "EMAIL_REQUIRED", message: "訪客訂單需提供電子郵件驗證" } },
          { status: 400 }
        );
      }
      if (guestEmail.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "電子郵件不匹配" } },
          { status: 403 }
        );
      }
    } else {
      // 既無 userId 也無 guestEmail → 無法驗證身份
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "無法驗證訂單擁有者" } },
        { status: 403 }
      );
    }

    // 3. 檢查訂單是否已付款
    if (order.paymentStatus === "PAID") {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_PAID", message: "此訂單已完成付款" } },
        { status: 409 }
      );
    }

    // 4. 查詢金流供應商
    const provider = await getDefaultProvider(order.tenantId);
    if (!provider) {
      return NextResponse.json(
        { success: false, error: { code: "NO_PROVIDER", message: "尚未設定金流供應商" } },
        { status: 400 }
      );
    }

    const cfg = provider.config as Record<string, string> | null;
    if (!cfg) {
      return NextResponse.json(
        { success: false, error: { code: "CONFIG_MISSING", message: "金流配置不完整" } },
        { status: 400 }
      );
    }

    // 5. 查找或建立 payment 記錄
    let payment = await db.payment.findFirst({
      where: {
        orderId: order.id,
        tenantId: order.tenantId,
        status: { in: ["INITIATED", "PENDING"] },
      },
    });

    if (!payment) {
      payment = await db.payment.create({
        data: {
          id: generateId(),
          tenantId: order.tenantId,
          orderId: order.id,
          providerId: provider.id,
          provider: provider.type,
          amount: order.totalAmount,
          currency: order.currency,
          status: "INITIATED",
        },
      });
    }

    // 6. 根據供應商產生付款表單
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const buyerEmail = guestEmail || email || "";
    let formData: PaymentFormData;
    let transactionNo = "";

    switch (provider.type) {
      case "NEWEBPAY": {
        const { createFormData } = await import("@/lib/payment/newebpay");
        const result = await createFormData(
          {
            merchantId: cfg.merchantId || cfg.NEWEBPAY_MERCHANT_ID || "",
            hashKey: cfg.hashKey || cfg.NEWEBPAY_HASH_KEY || "",
            hashIV: cfg.hashIV || cfg.NEWEBPAY_HASH_IV || "",
            isProduction: cfg.isProduction === "true",
          },
          {
            orderId: payment.id,
            amount: Number(order.totalAmount),
            itemDesc: `訂單 ${order.orderNo}`,
            email: buyerEmail,
            returnUrl,
            notifyUrl: `${appUrl}/api/payments/newebpay/notify`,
            clientBackUrl: returnUrl,
          }
        );
        formData = {
          actionUrl: result.actionUrl,
          fields: result.fields,
          provider: "NEWEBPAY",
        };
        transactionNo = result.merchantOrderNo;
        break;
      }
      case "ECPAY": {
        const { createFormData } = await import("@/lib/payment/ecpay");
        const result = await createFormData(
          {
            merchantId: cfg.merchantId || cfg.ECPAY_MERCHANT_ID || "",
            hashKey: cfg.hashKey || cfg.ECPAY_HASH_KEY || "",
            hashIV: cfg.hashIV || cfg.ECPAY_HASH_IV || "",
            isProduction: cfg.isProduction === "true",
          },
          {
            orderId: payment.id,
            amount: Number(order.totalAmount),
            itemName: `訂單 ${order.orderNo}`,
            returnUrl,
            notifyUrl: `${appUrl}/api/payments/ecpay/notify`,
          }
        );
        formData = {
          actionUrl: result.actionUrl,
          fields: result.fields,
          provider: "ECPAY",
        };
        transactionNo = result.merchantTradeNo;
        break;
      }
      case "STRIPE": {
        const { createCheckoutSession } = await import("@/lib/payment/stripe");
        const stripeConfig = {
          secretKey: (cfg.secretKey || cfg.STRIPE_SECRET_KEY || "") as string,
          webhookSecret: (cfg.webhookSecret || cfg.STRIPE_WEBHOOK_SECRET || "") as string,
        };
        const result = await createCheckoutSession(stripeConfig, {
          orderId: payment.id,
          amount: Number(order.totalAmount),
          currency: order.currency.toLowerCase(),
          description: `訂單 ${order.orderNo}`,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
          customerEmail: buyerEmail,
        });

        // Stripe 用 redirect URL，不是表單
        await db.payment.update({
          where: { id: payment.id },
          data: { transactionNo: result.sessionId, status: "PENDING" },
        });

        return NextResponse.json({
          success: true,
          data: {
            type: "redirect",
            redirectUrl: result.url,
            provider: "STRIPE",
            paymentId: payment.id,
          },
        });
      }
      default:
        return NextResponse.json(
          { success: false, error: { code: "UNSUPPORTED", message: `不支援的金流: ${provider.type}` } },
          { status: 400 }
        );
    }

    // 7. 更新 payment 記錄
    await db.payment.update({
      where: { id: payment.id },
      data: {
        transactionNo: transactionNo || undefined,
        status: "PENDING",
      },
    });

    console.log(`[Pay] Order ${order.orderNo} → ${provider.type}, txn: ${transactionNo}`);

    return NextResponse.json({
      success: true,
      data: {
        type: "form_redirect",
        ...formData,
        paymentId: payment.id,
      },
    });
  } catch (error) {
    console.error("[Pay] 產生付款表單錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "產生付款表單失敗" } },
      { status: 500 }
    );
  }
}
