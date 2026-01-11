import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/analytics/dashboard
 * 取得儀表板統計數據
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const tenantId = session.user.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    // 並行查詢多個統計數據
    const [
      todayOrders,
      todayRevenue,
      monthOrders,
      monthRevenue,
      lastMonthOrders,
      lastMonthRevenue,
      totalProducts,
      pendingOrders,
      recentOrders,
      topProducts,
    ] = await Promise.all([
      // 今日訂單數
      db.order.count({
        where: {
          tenantId,
          createdAt: { gte: today },
        },
      }),
      // 今日營收
      db.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: today },
          paymentStatus: "PAID",
        },
        _sum: { totalAmount: true },
      }),
      // 本月訂單數
      db.order.count({
        where: {
          tenantId,
          createdAt: { gte: thisMonth },
        },
      }),
      // 本月營收
      db.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: thisMonth },
          paymentStatus: "PAID",
        },
        _sum: { totalAmount: true },
      }),
      // 上月訂單數
      db.order.count({
        where: {
          tenantId,
          createdAt: { gte: lastMonth, lte: lastMonthEnd },
        },
      }),
      // 上月營收
      db.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: lastMonth, lte: lastMonthEnd },
          paymentStatus: "PAID",
        },
        _sum: { totalAmount: true },
      }),
      // 商品總數
      db.product.count({
        where: { tenantId, status: "PUBLISHED" },
      }),
      // 待處理訂單
      db.order.count({
        where: {
          tenantId,
          status: { in: ["PENDING", "PAID", "PROCESSING"] },
        },
      }),
      // 近期訂單
      db.order.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          orderNo: true,
          totalAmount: true,
          status: true,
          createdAt: true,
        },
      }),
      // 熱門商品
      db.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            tenantId,
            createdAt: { gte: thisMonth },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
    ]);

    // 計算成長率
    const revenueGrowth =
      lastMonthRevenue._sum.totalAmount && Number(lastMonthRevenue._sum.totalAmount) > 0
        ? (((Number(monthRevenue._sum.totalAmount) || 0) - Number(lastMonthRevenue._sum.totalAmount)) /
          Number(lastMonthRevenue._sum.totalAmount)) *
        100
        : 0;

    const orderGrowth =
      lastMonthOrders > 0 ? ((monthOrders - lastMonthOrders) / lastMonthOrders) * 100 : 0;

    // 取得熱門商品詳細資訊
    const topProductDetails = await db.product.findMany({
      where: { id: { in: topProducts.map((p) => p.productId) }, tenantId },
      select: { id: true, name: true, coverImageUrl: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        today: {
          orders: todayOrders,
          revenue: Number(todayRevenue._sum.totalAmount) || 0,
        },
        thisMonth: {
          orders: monthOrders,
          revenue: Number(monthRevenue._sum.totalAmount) || 0,
          revenueGrowth: Math.round(revenueGrowth * 10) / 10,
          orderGrowth: Math.round(orderGrowth * 10) / 10,
        },
        summary: {
          totalProducts,
          pendingOrders,
        },
        recentOrders,
        topProducts: topProducts.map((p) => ({
          ...topProductDetails.find((d) => d.id === p.productId),
          soldCount: p._sum.quantity,
        })),
      },
    });
  } catch (error) {
    console.error("取得儀表板數據錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得儀表板數據失敗" } },
      { status: 500 }
    );
  }
}
