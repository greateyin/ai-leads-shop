"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 訂單詳情頁面
 */
export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const response = await fetch(`/api/orders/${orderId}`);
        const data = await response.json();
        if (data.success) {
          setOrder(data.data);
        }
      } catch (error) {
        console.error("載入訂單失敗:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  /**
   * 更新訂單狀態
   */
  const handleUpdateStatus = async (status: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (data.success) {
        setOrder(data.data);
      }
    } catch (error) {
      console.error("更新狀態失敗:", error);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">載入中...</div>;
  }

  if (!order) {
    return <div className="p-8 text-center">找不到訂單</div>;
  }

  const orderData = order as {
    orderNo: string;
    status: string;
    paymentStatus: string;
    shippingStatus: string;
    totalAmount: number;
    currency: string;
    createdAt: string;
    user?: { name: string; email: string };
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    addresses: Array<{
      type: string;
      contactName: string;
      phone: string;
      city: string;
      addressLine1: string;
    }>;
  };

  return (
    <div className="space-y-6">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">訂單 #{orderData.orderNo}</h2>
          <p className="text-muted-foreground">
            建立於 {new Date(orderData.createdAt).toLocaleString("zh-TW")}
          </p>
        </div>
        <Link href="/dashboard/orders">
          <Button variant="outline">返回列表</Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 訂單狀態 */}
        <div className="rounded-lg border p-6">
          <h3 className="mb-4 font-semibold">訂單狀態</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">訂單狀態</span>
              <StatusBadge status={orderData.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">付款狀態</span>
              <StatusBadge status={orderData.paymentStatus} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">出貨狀態</span>
              <StatusBadge status={orderData.shippingStatus} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {orderData.status === "PAID" && (
              <Button size="sm" onClick={() => handleUpdateStatus("PROCESSING")}>
                開始處理
              </Button>
            )}
            {orderData.status === "PROCESSING" && (
              <Button size="sm" onClick={() => handleUpdateStatus("SHIPPED")}>
                標記出貨
              </Button>
            )}
          </div>
        </div>

        {/* 顧客資訊 */}
        <div className="rounded-lg border p-6">
          <h3 className="mb-4 font-semibold">顧客資訊</h3>
          <div className="space-y-2">
            <p>{orderData.user?.name || "訪客"}</p>
            <p className="text-muted-foreground">{orderData.user?.email || "-"}</p>
          </div>
          {orderData.addresses?.[0] && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium">收件地址</h4>
              <p>{orderData.addresses[0].contactName}</p>
              <p>{orderData.addresses[0].phone}</p>
              <p>
                {orderData.addresses[0].city} {orderData.addresses[0].addressLine1}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 訂單商品 */}
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h3 className="font-semibold">訂單商品</h3>
        </div>
        <div className="divide-y">
          {orderData.items?.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {orderData.currency} {item.unitPrice} × {item.quantity}
                </p>
              </div>
              <p className="font-medium">
                {orderData.currency} {item.subtotal}
              </p>
            </div>
          ))}
        </div>
        <div className="border-t p-4">
          <div className="flex justify-between text-lg font-bold">
            <span>總計</span>
            <span>
              {orderData.currency} {orderData.totalAmount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 狀態標籤元件
 */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    PAID: "bg-green-100 text-green-800",
    PROCESSING: "bg-blue-100 text-blue-800",
    SHIPPED: "bg-purple-100 text-purple-800",
    COMPLETED: "bg-gray-100 text-gray-800",
    CANCELLED: "bg-red-100 text-red-800",
    PREPARING: "bg-orange-100 text-orange-800",
    DELIVERING: "bg-indigo-100 text-indigo-800",
    DELIVERED: "bg-green-100 text-green-800",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}
