import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 方案變更 Schema
 */
const updateBillingSchema = z.object({
  plan: z.enum(["SEED", "GROWTH", "PRO"]).optional(),
  billingMethod: z.enum(["CREDIT_CARD", "BANK_TRANSFER", "CRYPTO"]).optional(),
});

/**
 * GET /api/tenants/[id]/billing
 * 取得租戶計費資訊
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "請先登入" },
        },
        { status: 401 }
      );
    }

    const { id: tenantId } = await params;

    // 驗證使用者權限
    const userTenant = await db.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId,
        },
      },
    });

    if (!userTenant || !["OWNER", "ADMIN"].includes(userTenant.role)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "無權限查看計費資訊" },
        },
        { status: 403 }
      );
    }

    // 取得計費帳戶資訊
    const billingAccount = await db.tenantBillingAccount.findUnique({
      where: { tenantId },
    });

    // 取得最新發票
    const recentInvoices = await db.tenantInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 取得當月用量
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const usageMetrics = await db.tenantUsageMetric.findMany({
      where: {
        tenantId,
        periodStart: { gte: currentMonth },
      },
    });

    // 取得配額限制
    const apiLimits = await db.tenantApiLimit.findMany({
      where: { tenantId },
    });

    return NextResponse.json({
      success: true,
      data: {
        billingAccount: billingAccount
          ? {
            plan: billingAccount.plan,
            billingMethod: billingAccount.billingMethod,
            nextBillingDate: billingAccount.nextBillingDate,
            status: billingAccount.status,
            currency: billingAccount.currency,
          }
          : null,
        recentInvoices: recentInvoices.map((inv) => ({
          id: inv.id,
          invoiceNo: inv.invoiceNo,
          amount: inv.amount,
          currency: inv.currency,
          status: inv.status,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          paidAt: inv.paidAt,
        })),
        currentUsage: usageMetrics.map((m) => ({
          metricType: m.metricType,
          value: m.value,
          periodStart: m.periodStart,
          periodEnd: m.periodEnd,
        })),
        limits: apiLimits.map((l) => ({
          metric: l.metric,
          limitValue: l.limitValue,
        })),
      },
    });
  } catch (error) {
    console.error("Get billing error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得計費資訊失敗" },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tenants/[id]/billing
 * 變更方案或付款方式
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "請先登入" },
        },
        { status: 401 }
      );
    }

    const { id: tenantId } = await params;
    const body = await request.json();
    const validation = updateBillingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "資料格式錯誤",
            details: validation.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    // 驗證使用者權限 (只有 OWNER 可變更方案)
    const userTenant = await db.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId,
        },
      },
    });

    if (!userTenant || userTenant.role !== "OWNER") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "只有擁有者可變更方案" },
        },
        { status: 403 }
      );
    }

    const { plan, billingMethod } = validation.data;

    // 取得現有計費帳戶
    let billingAccount = await db.tenantBillingAccount.findUnique({
      where: { tenantId },
    });

    const oldPlan = billingAccount?.plan;
    const oldBillingMethod = billingAccount?.billingMethod;

    if (!billingAccount) {
      // 若不存在則創建
      billingAccount = await db.tenantBillingAccount.create({
        data: {
          id: generateId(),
          tenantId,
          plan: plan || "SEED",
          billingMethod: billingMethod || "CREDIT_CARD",
          status: "ACTIVE",
          currency: "TWD",
        },
      });
    } else {
      // 更新現有帳戶
      billingAccount = await db.tenantBillingAccount.update({
        where: { tenantId },
        data: {
          ...(plan && { plan }),
          ...(billingMethod && { billingMethod }),
        },
      });
    }

    // 同步更新 tenant 的 plan
    if (plan) {
      await db.tenant.update({
        where: { id: tenantId },
        data: { plan },
      });

      // 更新 API 限額根據新方案
      const planLimits: Record<string, Record<string, number>> = {
        SEED: {
          REQUESTS_PER_MINUTE: 60,
          AI_TOKENS_PER_MONTH: 10000,
          STORAGE_MB: 500,
        },
        GROWTH: {
          REQUESTS_PER_MINUTE: 300,
          AI_TOKENS_PER_MONTH: 100000,
          STORAGE_MB: 5000,
        },
        PRO: {
          REQUESTS_PER_MINUTE: 1000,
          AI_TOKENS_PER_MONTH: 1000000,
          STORAGE_MB: 50000,
        },
      };

      const limits = planLimits[plan];
      if (limits) {
        for (const [metric, limitValue] of Object.entries(limits)) {
          await db.tenantApiLimit.upsert({
            where: {
              tenantId_metric: { tenantId, metric: metric as "REQUESTS_PER_MINUTE" | "AI_TOKENS_PER_MONTH" | "STORAGE_MB" },
            },
            update: { limitValue },
            create: {
              id: generateId(),
              tenantId,
              metric: metric as "REQUESTS_PER_MINUTE" | "AI_TOKENS_PER_MONTH" | "STORAGE_MB",
              limitValue,
            },
          });
        }
      }
    }

    // 記錄審計日誌
    await db.auditLog.create({
      data: {
        id: generateId(),
        tenantId,
        userId: session.user.id,
        action: "PLAN_CHANGE",
        entityType: "TenantBillingAccount",
        entityId: billingAccount.id,
        oldValue: { plan: oldPlan, billingMethod: oldBillingMethod },
        newValue: { plan: billingAccount.plan, billingMethod: billingAccount.billingMethod },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        plan: billingAccount.plan,
        billingMethod: billingAccount.billingMethod,
        nextBillingDate: billingAccount.nextBillingDate,
        status: billingAccount.status,
      },
      message: "方案已更新",
    });
  } catch (error) {
    console.error("Update billing error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "更新計費資訊失敗" },
      },
      { status: 500 }
    );
  }
}
