import { db } from "@/lib/db";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { TrackingScripts } from "@/components/tracking/tracking-scripts";
import { UtmPersistence } from "@/components/tracking/utm-persistence";
import { PublicHeader } from "@/components/layout/public-header";

/**
 * 依 tenantId 取得追蹤設定
 */
async function getTrackingSettings(tenantId: string) {
  const settings = await db.trackingSettings.findUnique({
    where: { tenantId },
  });
  return settings;
}

/**
 * 公開頁面 Layout
 * 使用共用 tenant resolver 解析當前租戶，注入追蹤腳本
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 使用共用 resolver 解析 tenant（支援 custom domain / subdomain / localhost）
  const tenant = await resolveTenant();

  // 取得租戶追蹤設定
  const trackingSettings = tenant
    ? await getTrackingSettings(tenant.tenantId)
    : null;

  return (
    <>
      {/* 動態注入追蹤腳本（依租戶設定） */}
      {trackingSettings && (
        <TrackingScripts
          ga4MeasurementId={trackingSettings.ga4MeasurementId}
          metaPixelId={trackingSettings.metaPixelId}
          gtmContainerId={trackingSettings.gtmContainerId}
          tiktokPixelId={trackingSettings.tiktokPixelId}
          lineTagId={trackingSettings.lineTagId}
        />
      )}

      {/* UTM 參數持久化（首次進站自動擷取） */}
      <UtmPersistence />

      {/* Header */}
      <PublicHeader />

      {/* 頁面內容 */}
      <main className="min-h-screen">{children}</main>
    </>
  );
}
