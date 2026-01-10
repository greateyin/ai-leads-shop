"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 追蹤設定介面
 */
interface TrackingSettings {
  ga4MeasurementId: string | null;
  metaPixelId: string | null;
  gtmContainerId: string | null;
  tiktokPixelId: string | null;
  lineTagId: string | null;
}

/**
 * 追蹤設定頁面
 * 路由: /dashboard/settings/tracking
 */
export default function TrackingSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<TrackingSettings>({
    ga4MeasurementId: null,
    metaPixelId: null,
    gtmContainerId: null,
    tiktokPixelId: null,
    lineTagId: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        // 取得當前租戶 ID (從 session 或 API)
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();
        const tenantId = session?.user?.tenantId;

        if (!tenantId) {
          setError("無法取得租戶資訊");
          setIsLoading(false);
          return;
        }

        const res = await fetch(`/api/tenants/${tenantId}/tracking`);
        const data = await res.json();

        if (data.success) {
          setSettings({
            ga4MeasurementId: data.data.ga4MeasurementId || "",
            metaPixelId: data.data.metaPixelId || "",
            gtmContainerId: data.data.gtmContainerId || "",
            tiktokPixelId: data.data.tiktokPixelId || "",
            lineTagId: data.data.lineTagId || "",
          });
        }
      } catch {
        setError("載入設定失敗");
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  /**
   * 儲存設定
   */
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      const tenantId = session?.user?.tenantId;

      if (!tenantId) {
        setError("無法取得租戶資訊");
        return;
      }

      const res = await fetch(`/api/tenants/${tenantId}/tracking`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ga4MeasurementId: settings.ga4MeasurementId || null,
          metaPixelId: settings.metaPixelId || null,
          gtmContainerId: settings.gtmContainerId || null,
          tiktokPixelId: settings.tiktokPixelId || null,
          lineTagId: settings.lineTagId || null,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error?.message || "儲存失敗");
      }
    } catch {
      setError("儲存失敗");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">載入中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">追蹤設定</h2>
          <p className="text-muted-foreground">
            設定 Google Analytics、Meta Pixel 等第三方追蹤代碼
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "儲存設定"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 text-green-800 p-3 rounded-md">
          設定已儲存成功！
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Google Analytics 4 */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded flex items-center justify-center">
              📊
            </div>
            <h3 className="font-semibold">Google Analytics 4</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            追蹤網站流量與使用者行為分析
          </p>
          <div className="space-y-2">
            <Label htmlFor="ga4">Measurement ID</Label>
            <Input
              id="ga4"
              placeholder="G-XXXXXXXXXX"
              value={settings.ga4MeasurementId || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  ga4MeasurementId: e.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              在 GA4 管理介面 {">"} 資料串流中取得
            </p>
          </div>
        </div>

        {/* Google Tag Manager */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
              🏷️
            </div>
            <h3 className="font-semibold">Google Tag Manager</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            統一管理所有追蹤代碼（設定後會取代 GA4 直接注入）
          </p>
          <div className="space-y-2">
            <Label htmlFor="gtm">Container ID</Label>
            <Input
              id="gtm"
              placeholder="GTM-XXXXXXX"
              value={settings.gtmContainerId || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  gtmContainerId: e.target.value,
                }))
              }
            />
          </div>
        </div>

        {/* Meta Pixel */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white">
              f
            </div>
            <h3 className="font-semibold">Meta Pixel (Facebook)</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            追蹤 Facebook/Instagram 廣告轉換
          </p>
          <div className="space-y-2">
            <Label htmlFor="pixel">Pixel ID</Label>
            <Input
              id="pixel"
              placeholder="1234567890123456"
              value={settings.metaPixelId || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  metaPixelId: e.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              在 Meta 事件管理工具中取得
            </p>
          </div>
        </div>

        {/* TikTok Pixel */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center text-white">
              🎵
            </div>
            <h3 className="font-semibold">TikTok Pixel</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            追蹤 TikTok 廣告轉換
          </p>
          <div className="space-y-2">
            <Label htmlFor="tiktok">Pixel ID</Label>
            <Input
              id="tiktok"
              placeholder="XXXXXXXXXXXXXXXXX"
              value={settings.tiktokPixelId || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  tiktokPixelId: e.target.value,
                }))
              }
            />
          </div>
        </div>

        {/* LINE Tag */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center text-white">
              L
            </div>
            <h3 className="font-semibold">LINE Tag</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            追蹤 LINE 廣告轉換
          </p>
          <div className="space-y-2">
            <Label htmlFor="line">Tag ID</Label>
            <Input
              id="line"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={settings.lineTagId || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  lineTagId: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">💡 使用提示</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• 若使用 GTM，建議在 GTM 內統一管理所有追蹤代碼</li>
          <li>• 追蹤代碼會自動注入到您的商店前台頁面</li>
          <li>• 設定完成後，請使用 Tag Assistant 或 Pixel Helper 驗證是否正常運作</li>
        </ul>
      </div>
    </div>
  );
}
