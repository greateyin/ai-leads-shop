import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
