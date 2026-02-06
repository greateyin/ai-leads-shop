import { NextRequest, NextResponse } from "next/server";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";

/**
 * GET /api/analytics/ai-impact
 * 取得 AI 貢獻分析報表
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const tenantId = session.user.tenantId;

    // 計算日期範圍
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // 取得 AI 互動統計
    const [
      totalInteractions,
      interactionsByType,
      aiAttributions,
      totalRevenue,
      aiAssistedRevenue,
    ] = await Promise.all([
      // 總 AI 互動次數
      db.aiInteraction.count({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
        },
      }),

      // 依類型分組的互動次數
      db.aiInteraction.groupBy({
        by: ["type"],
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
        },
        _count: { type: true },
      }),

      // AI 歸因記錄
      db.aiAttribution.findMany({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
        },
        include: {
          order: { select: { id: true, totalAmount: true } },
          aiInteraction: { select: { type: true } },
        },
      }),

      // 總營收
      db.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
          paymentStatus: "PAID",
        },
        _sum: { totalAmount: true },
      }),

      // AI 輔助訂單營收
      db.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
          paymentStatus: "PAID",
          aiAttributions: { some: {} },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    // 計算 AI 貢獻率
    const totalRevenueAmount = Number(totalRevenue._sum.totalAmount || 0);
    const aiRevenueAmount = Number(aiAssistedRevenue._sum.totalAmount || 0);
    const aiContributionRate = totalRevenueAmount > 0
      ? Math.round((aiRevenueAmount / totalRevenueAmount) * 100)
      : 0;

    // 依類型整理互動統計
    const interactionStats = interactionsByType.reduce(
      (acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      },
      {} as Record<string, number>
    );

    // 計算平均 AI 貢獻金額
    const avgAiRevenue = aiAttributions.length > 0
      ? aiAttributions.reduce((sum, a) => sum + Number(a.revenue || 0), 0) / aiAttributions.length
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        summary: {
          totalInteractions,
          totalRevenue: totalRevenueAmount,
          aiAssistedRevenue: aiRevenueAmount,
          aiContributionRate,
          aiAttributionsCount: aiAttributions.length,
          avgAiRevenuePerAttribution: Math.round(avgAiRevenue),
        },
        interactionsByType: interactionStats,
        breakdown: {
          productDescriptions: interactionStats.PRODUCT_DESCRIPTION || 0,
          blogSummaries: interactionStats.BLOG_SUMMARY || 0,
          chatInteractions: interactionStats.CHAT || 0,
          faqGenerations: interactionStats.FAQ || 0,
        },
        insights: generateInsights({
          totalInteractions,
          aiContributionRate,
          interactionStats,
        }),
      },
    });
  } catch (error) {
    console.error("Get AI impact error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得 AI 貢獻分析失敗" } },
      { status: 500 }
    );
  }
}

/**
 * 產生 AI 洞察建議
 */
function generateInsights(data: {
  totalInteractions: number;
  aiContributionRate: number;
  interactionStats: Record<string, number>;
}): string[] {
  const insights: string[] = [];

  if (data.totalInteractions === 0) {
    insights.push("尚未有 AI 互動記錄，建議開始使用 AI 功能提升效率");
    return insights;
  }

  if (data.aiContributionRate >= 30) {
    insights.push(`AI 輔助銷售貢獻率達 ${data.aiContributionRate}%，表現優異`);
  } else if (data.aiContributionRate >= 10) {
    insights.push(`AI 輔助銷售貢獻率為 ${data.aiContributionRate}%，建議增加 AI 導購使用`);
  } else {
    insights.push("AI 貢獻率偏低，建議啟用更多 AI 功能提升銷售");
  }

  const chatCount = data.interactionStats.CHAT || 0;
  const productDescCount = data.interactionStats.PRODUCT_DESCRIPTION || 0;

  if (chatCount > productDescCount * 2) {
    insights.push("AI 導購使用頻繁，可考慮優化產品描述以降低顧客諮詢");
  }

  if (productDescCount === 0) {
    insights.push("建議使用 AI 生成商品描述，提升產品頁面品質");
  }

  return insights;
}
