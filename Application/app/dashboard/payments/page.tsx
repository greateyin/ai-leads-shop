"use client";

import { useState, useEffect } from "react";

/**
 * 金流管理頁面
 */
export default function PaymentsPage() {
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPayments() {
      try {
        const response = await fetch("/api/payments");
        const data = await response.json();
        if (data.success) {
          setPayments(data.data.items);
        }
      } catch (error) {
        console.error("載入付款記錄失敗:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPayments();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">金流管理</h2>
        <p className="text-muted-foreground">查看付款記錄與金流設定</p>
      </div>

      {/* 金流供應商設定 */}
      <div className="grid gap-4 md:grid-cols-3">
        <ProviderCard
          name="綠界 ECPay"
          status={process.env.ECPAY_MERCHANT_ID ? "已設定" : "未設定"}
          icon="💳"
        />
        <ProviderCard
          name="藍新 NewebPay"
          status={process.env.NEWEBPAY_MERCHANT_ID ? "已設定" : "未設定"}
          icon="🏦"
        />
        <ProviderCard
          name="Stripe"
          status={process.env.STRIPE_SECRET_KEY ? "已設定" : "未設定"}
          icon="💰"
        />
      </div>

      {/* 付款記錄 */}
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h3 className="font-semibold">付款記錄</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center">載入中...</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>尚無付款記錄</p>
          </div>
        ) : (
          <div className="divide-y">
            {payments.map((payment) => {
              const p = payment as {
                id: string;
                provider: string;
                amount: number;
                currency: string;
                status: string;
                createdAt: string;
                order?: { orderNo: string };
              };
              return (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">訂單 #{p.order?.orderNo}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.provider} · {new Date(p.createdAt).toLocaleString("zh-TW")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {p.currency} {p.amount}
                    </p>
                    <StatusBadge status={p.status} />
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
  status,
  icon,
}: {
  name: string;
  status: string;
  icon: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{status}</p>
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
    INITIATED: "bg-gray-100 text-gray-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    PAID: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
    REFUNDED: "bg-purple-100 text-purple-800",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}
