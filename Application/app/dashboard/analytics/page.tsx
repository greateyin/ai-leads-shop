"use client";

import { useState, useEffect } from "react";

/**
 * 分析頁面
 */
export default function AnalyticsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const response = await fetch("/api/analytics/dashboard");
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        }
      } catch (error) {
        console.error("載入分析數據失敗:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">載入中...</div>;
  }

  const analytics = data as {
    today: { orders: number; revenue: number };
    thisMonth: { orders: number; revenue: number; revenueGrowth: number; orderGrowth: number };
    summary: { totalProducts: number; pendingOrders: number };
    recentOrders: Array<{ id: string; orderNo: string; totalAmount: number; status: string }>;
    topProducts: Array<{ id: string; name: string; soldCount: number }>;
  } | null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">數據分析</h2>
        <p className="text-muted-foreground">查看您的商店營運數據</p>
      </div>

      {/* KPI 卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="今日營收"
          value={`NT$ ${analytics?.today.revenue || 0}`}
          change=""
        />
        <KPICard
          title="今日訂單"
          value={String(analytics?.today.orders || 0)}
          change=""
        />
        <KPICard
          title="本月營收"
          value={`NT$ ${analytics?.thisMonth.revenue || 0}`}
          change={`${analytics?.thisMonth.revenueGrowth || 0}%`}
        />
        <KPICard
          title="本月訂單"
          value={String(analytics?.thisMonth.orders || 0)}
          change={`${analytics?.thisMonth.orderGrowth || 0}%`}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 熱門商品 */}
        <div className="rounded-lg border">
          <div className="border-b p-4">
            <h3 className="font-semibold">熱門商品</h3>
          </div>
          {analytics?.topProducts?.length ? (
            <div className="divide-y">
              {analytics.topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </span>
                    <span>{product.name}</span>
                  </div>
                  <span className="text-muted-foreground">{product.soldCount} 件</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">尚無數據</div>
          )}
        </div>

        {/* 近期訂單 */}
        <div className="rounded-lg border">
          <div className="border-b p-4">
            <h3 className="font-semibold">近期訂單</h3>
          </div>
          {analytics?.recentOrders?.length ? (
            <div className="divide-y">
              {analytics.recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">#{order.orderNo}</p>
                    <StatusBadge status={order.status} />
                  </div>
                  <span className="font-medium">NT$ {order.totalAmount}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">尚無訂單</div>
          )}
        </div>
      </div>

      {/* AI 貢獻報告預留區 */}
      <div className="rounded-lg border p-6">
        <h3 className="mb-4 font-semibold">AI 功能貢獻分析</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-2xl font-bold">--</p>
            <p className="text-sm text-muted-foreground">AI 描述商品數</p>
          </div>
          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-2xl font-bold">--</p>
            <p className="text-sm text-muted-foreground">AI 對話次數</p>
          </div>
          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-2xl font-bold">--%</p>
            <p className="text-sm text-muted-foreground">AI 貢獻營收佔比</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * KPI 卡片
 */
function KPICard({
  title,
  value,
  change,
}: {
  title: string;
  value: string;
  change: string;
}) {
  const isPositive = change.startsWith("+") || (parseFloat(change) > 0);

  return (
    <div className="rounded-lg border p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {change && (
        <p className={`mt-1 text-sm ${isPositive ? "text-green-600" : "text-red-600"}`}>
          {isPositive && "+"}{change} vs 上月
        </p>
      )}
    </div>
  );
}

/**
 * 狀態標籤
 */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    PAID: "bg-green-100 text-green-800",
    PROCESSING: "bg-blue-100 text-blue-800",
    SHIPPED: "bg-purple-100 text-purple-800",
    COMPLETED: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}
