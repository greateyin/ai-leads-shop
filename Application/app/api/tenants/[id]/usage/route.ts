import { NextRequest, NextResponse } from "next/server";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";

/**
 * GET /api/tenants/[id]/usage
 * 取得特定租戶的用量統計
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await authWithTenant({ requireTenant: false });
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

    if (!userTenant) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "無權限查看此租戶用量" },
        },
        { status: 403 }
      );
    }

    // 取得租戶資訊與方案
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: { billingAccount: true },
    });

    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "找不到租戶" },
        },
        { status: 404 }
      );
    }

    // 計算當月用量
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    // 取得各項用量指標
    const [
      productCount,
      orderCount,
      aiTokenUsage,
      storageUsage,
    ] = await Promise.all([
      db.product.count({
        where: { tenantId, deletedAt: null },
      }),
      db.order.count({
        where: {
          tenantId,
          createdAt: { gte: currentMonth },
        },
      }),
      db.tenantUsageMetric.findFirst({
        where: {
          tenantId,
          metricType: "AI_TOKENS",
          periodStart: { gte: currentMonth },
        },
      }),
      db.tenantUsageMetric.findFirst({
        where: {
          tenantId,
          metricType: "STORAGE_MB",
          periodStart: { gte: currentMonth },
        },
      }),
    ]);

    // 取得配額限制
    const limits = await db.tenantApiLimit.findMany({
      where: { tenantId },
    });

    // 方案限制
    const plan = tenant.billingAccount?.plan || tenant.plan;
    const planLimits: Record<string, Record<string, number>> = {
      SEED: { products: 50, orders: 100, aiTokens: 10000, storage: 100 },
      GROWTH: { products: 500, orders: 1000, aiTokens: 100000, storage: 1000 },
      PRO: { products: -1, orders: -1, aiTokens: -1, storage: -1 },
    };

    const currentPlanLimits = planLimits[plan] || planLimits.SEED;

    return NextResponse.json({
      success: true,
      data: {
        tenantId,
        plan,
        period: {
          start: currentMonth,
          end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
        },
        usage: {
          products: {
            used: productCount,
            limit: currentPlanLimits.products,
            percentage: currentPlanLimits.products > 0 
              ? Math.round((productCount / currentPlanLimits.products) * 100) 
              : 0,
          },
          orders: {
            used: orderCount,
            limit: currentPlanLimits.orders,
            percentage: currentPlanLimits.orders > 0 
              ? Math.round((orderCount / currentPlanLimits.orders) * 100) 
              : 0,
          },
          aiTokens: {
            used: Number(aiTokenUsage?.value || 0),
            limit: currentPlanLimits.aiTokens,
            percentage: currentPlanLimits.aiTokens > 0 
              ? Math.round((Number(aiTokenUsage?.value || 0) / currentPlanLimits.aiTokens) * 100) 
              : 0,
          },
          storage: {
            used: Number(storageUsage?.value || 0),
            limit: currentPlanLimits.storage,
            unit: "MB",
            percentage: currentPlanLimits.storage > 0 
              ? Math.round((Number(storageUsage?.value || 0) / currentPlanLimits.storage) * 100) 
              : 0,
          },
        },
        customLimits: limits.map((l) => ({
          metric: l.metric,
          limitValue: l.limitValue,
        })),
      },
    });
  } catch (error) {
    console.error("Get tenant usage error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得用量統計失敗" },
      },
      { status: 500 }
    );
  }
}
