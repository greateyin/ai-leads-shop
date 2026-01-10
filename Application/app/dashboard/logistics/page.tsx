"use client";

import { useState, useEffect } from "react";

/**
 * 物流管理頁面
 */
export default function LogisticsPage() {
  const [shippingOrders, setShippingOrders] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchShippingOrders() {
      try {
        const response = await fetch("/api/logistics");
        const data = await response.json();
        if (data.success) {
          setShippingOrders(data.data.items);
        }
      } catch (error) {
        console.error("載入物流訂單失敗:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchShippingOrders();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">物流管理</h2>
        <p className="text-muted-foreground">追蹤出貨狀態與管理物流設定</p>
      </div>

      {/* 物流供應商 */}
      <div className="grid gap-4 md:grid-cols-3">
        <ProviderCard name="綠界物流" description="超商取貨、宅配" icon="🚚" />
        <ProviderCard name="順豐速運" description="快遞服務" icon="📦" />
        <ProviderCard name="黑貓宅急便" description="宅配服務" icon="🐱" />
      </div>

      {/* 物流訂單列表 */}
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h3 className="font-semibold">物流訂單</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center">載入中...</div>
        ) : shippingOrders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>尚無物流訂單</p>
          </div>
        ) : (
          <div className="divide-y">
            {shippingOrders.map((shipping) => {
              const s = shipping as {
                id: string;
                trackingNumber: string;
                status: string;
                createdAt: string;
                order?: { orderNo: string };
                provider?: { name: string };
                method?: { name: string };
              };
              return (
                <div key={s.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">
                      {s.trackingNumber || "待取得"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      訂單 #{s.order?.orderNo} · {s.provider?.name} · {s.method?.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={s.status} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString("zh-TW")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 供應商卡片
 */
function ProviderCard({
  name,
  description,
  icon,
}: {
  name: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 狀態標籤
 */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    CREATED: "bg-gray-100 text-gray-800",
    AWAITING_PICKUP: "bg-yellow-100 text-yellow-800",
    IN_TRANSIT: "bg-blue-100 text-blue-800",
    ARRIVED_AT_STORE: "bg-purple-100 text-purple-800",
    DELIVERED: "bg-green-100 text-green-800",
    RETURNED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-800",
  };

  const labels: Record<string, string> = {
    CREATED: "已建立",
    AWAITING_PICKUP: "待取件",
    IN_TRANSIT: "運送中",
    ARRIVED_AT_STORE: "已到店",
    DELIVERED: "已送達",
    RETURNED: "已退回",
    CANCELLED: "已取消",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
      {labels[status] || status}
    </span>
  );
}
