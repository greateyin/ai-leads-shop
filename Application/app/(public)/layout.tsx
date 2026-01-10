import { headers } from "next/headers";
import { db } from "@/lib/db";
import { TrackingScripts } from "@/components/tracking/tracking-scripts";

/**
 * 取得租戶追蹤設定
 */
async function getTrackingSettings(tenantSubdomain?: string) {
  if (!tenantSubdomain) return null;

  const tenant = await db.tenant.findFirst({
    where: { subdomain: tenantSubdomain },
    include: { trackingSettings: true },
  });

  return tenant?.trackingSettings;
}

/**
 * 公開頁面 Layout
 * 動態載入租戶追蹤設定
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 從 headers 取得 host 解析租戶 subdomain
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const subdomain = host.split(".")[0];

  // 取得租戶追蹤設定
  const trackingSettings = await getTrackingSettings(
    subdomain !== "localhost" && subdomain !== "www" ? subdomain : undefined
  );

  return (
    <>
      {/* 動態注入追蹤腳本 */}
      {trackingSettings && (
        <TrackingScripts
          ga4MeasurementId={trackingSettings.ga4MeasurementId}
          metaPixelId={trackingSettings.metaPixelId}
          gtmContainerId={trackingSettings.gtmContainerId}
          tiktokPixelId={trackingSettings.tiktokPixelId}
          lineTagId={trackingSettings.lineTagId}
        />
      )}

      {/* 頁面內容 */}
      <main className="min-h-screen">{children}</main>
    </>
  );
}
