"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 設定頁面
 */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"general" | "billing" | "usage">("general");
  const [tenant, setTenant] = useState<Record<string, unknown> | null>(null);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [tenantRes, usageRes] = await Promise.all([
          fetch("/api/tenants"),
          fetch("/api/usage"),
        ]);
        const [tenantData, usageData] = await Promise.all([
          tenantRes.json(),
          usageRes.json(),
        ]);
        if (tenantData.success) setTenant(tenantData.data);
        if (usageData.success) setUsage(usageData.data);
      } catch (error) {
        console.error("載入設定失敗:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">載入中...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">設定</h2>
        <p className="text-muted-foreground">管理您的商店設定</p>
      </div>

      <div className="flex gap-2 border-b">
        {["general", "billing", "usage"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "general" ? "一般設定" : tab === "billing" ? "訂閱方案" : "用量統計"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border p-6">
        {activeTab === "general" && <GeneralSettings tenant={tenant} />}
        {activeTab === "billing" && <BillingSettings tenant={tenant} />}
        {activeTab === "usage" && <UsageSettings usage={usage} />}
      </div>
    </div>
  );
}

function GeneralSettings({ tenant }: { tenant: Record<string, unknown> | null }) {
  const [name, setName] = useState((tenant?.name as string) || "");
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="tenantName">商店名稱</Label>
        <Input id="tenantName" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>子網域</Label>
        <Input value={(tenant?.subdomain as string) || ""} disabled />
      </div>
      <Button onClick={handleSave} disabled={isLoading}>
        {isLoading ? "儲存中..." : "儲存設定"}
      </Button>
    </div>
  );
}

function BillingSettings({ tenant }: { tenant: Record<string, unknown> | null }) {
  const currentPlan = (tenant?.plan as string) || "SEED";
  const plans = [
    { id: "SEED", name: "種子方案", price: "免費", features: ["50 個商品", "100 筆訂單/月"] },
    { id: "GROWTH", name: "成長方案", price: "NT$ 499/月", features: ["500 個商品", "1,000 筆訂單/月"] },
    { id: "PRO", name: "專業方案", price: "NT$ 1,499/月", features: ["無限商品", "無限訂單"] },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((plan) => (
        <div key={plan.id} className={`rounded-lg border p-4 ${currentPlan === plan.id ? "border-primary" : ""}`}>
          <h3 className="font-semibold">{plan.name}</h3>
          <p className="text-2xl font-bold mt-2">{plan.price}</p>
          <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
            {plan.features.map((f) => <li key={f}>✓ {f}</li>)}
          </ul>
          {currentPlan === plan.id && <span className="text-xs text-primary mt-2 block">目前方案</span>}
        </div>
      ))}
    </div>
  );
}

function UsageSettings({ usage }: { usage: Record<string, unknown> | null }) {
  const data = usage as { usage?: Record<string, { used: number; limit: number; percentage: number }> } | null;
  
  return (
    <div className="space-y-4">
      {["products", "orders", "aiTokens", "storage"].map((key) => {
        const item = data?.usage?.[key];
        return (
          <div key={key} className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{key === "products" ? "商品" : key === "orders" ? "訂單" : key === "aiTokens" ? "AI Token" : "儲存空間"}</span>
              <span>{item?.used || 0} / {item?.limit === -1 ? "∞" : item?.limit || 0}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.min(item?.percentage || 0, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
