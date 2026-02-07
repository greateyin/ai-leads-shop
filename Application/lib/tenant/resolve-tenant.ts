import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * Tenant 解析結果介面
 * 包含 tenant、shop 資訊以及解析來源
 */
export interface TenantResolution {
  /** 租戶 ID */
  tenantId: string;
  /** 租戶子網域 */
  subdomain: string;
  /** 租戶名稱 */
  tenantName: string;
  /** 商店 ID */
  shopId: string;
  /** 商店 slug */
  shopSlug: string;
  /** 商店名稱 */
  shopName: string;
  /** 解析來源：custom domain / subdomain / localhost fallback */
  matchedBy: "domain" | "subdomain" | "localhost";
}

// ─── Internal helpers ────────────────────────────────────────

/**
 * 從 host header 解析原始主機名稱
 * 處理 x-forwarded-host、port 去除、www 前綴
 */
function extractHostname(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-host");
  const raw = forwarded || headersList.get("host") || "";
  return raw.split(":")[0].toLowerCase().trim();
}

/**
 * 判斷是否為本地開發環境
 */
function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local")
  );
}

/**
 * 從 hostname 提取 subdomain 部分
 * 例：myshop.example.com → myshop
 * 例：www.example.com → null（www 不視為租戶）
 * 例：example.com → null（裸域）
 */
function extractSubdomain(hostname: string): string | null {
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (sub === "www") return null;
  return sub;
}

// Prisma include/select 共用片段
const TENANT_SELECT = {
  id: true,
  subdomain: true,
  name: true,
  status: true,
} as const;

const SHOP_SELECT = {
  id: true,
  slug: true,
  name: true,
} as const;

// ─── Core resolver (hostname → TenantResolution) ────────────

/**
 * 核心解析邏輯（Single Source of Truth）
 *
 * 解析優先序：
 * 1. Custom domain → Shop.domain 查詢
 * 2. Subdomain → Tenant.subdomain 查詢
 * 3. Localhost → 開發環境 fallback（取第一個 active tenant+shop）
 * 4. 以上都不符合 → 回傳 null
 */
async function _resolveByHostname(
  hostname: string
): Promise<TenantResolution | null> {
  if (!hostname) return null;

  // ── 1. Custom domain 查詢 ──
  if (!isLocalhost(hostname)) {
    const shopByDomain = await db.shop.findFirst({
      where: { domain: hostname },
      include: { tenant: { select: TENANT_SELECT } },
    });

    if (shopByDomain && shopByDomain.tenant.status === "ACTIVE") {
      return {
        tenantId: shopByDomain.tenant.id,
        subdomain: shopByDomain.tenant.subdomain,
        tenantName: shopByDomain.tenant.name,
        shopId: shopByDomain.id,
        shopSlug: shopByDomain.slug,
        shopName: shopByDomain.name,
        matchedBy: "domain",
      };
    }

    // ── 2. Subdomain 查詢 ──
    const sub = extractSubdomain(hostname);
    if (sub) {
      const tenant = await db.tenant.findFirst({
        where: { subdomain: sub, status: "ACTIVE" },
        include: {
          shops: { take: 1, orderBy: { createdAt: "asc" }, select: SHOP_SELECT },
        },
      });

      if (tenant && tenant.shops.length > 0) {
        const shop = tenant.shops[0];
        return {
          tenantId: tenant.id,
          subdomain: tenant.subdomain,
          tenantName: tenant.name,
          shopId: shop.id,
          shopSlug: shop.slug,
          shopName: shop.name,
          matchedBy: "subdomain",
        };
      }
    }

    // 非 localhost 但無法解析 → 回傳 null
    return null;
  }

  // ── 3. Localhost fallback（僅限開發環境） ──
  if (process.env.NODE_ENV === "production") return null;

  const fallbackTenant = await db.tenant.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: {
      shops: { take: 1, orderBy: { createdAt: "asc" }, select: SHOP_SELECT },
    },
  });

  if (fallbackTenant && fallbackTenant.shops.length > 0) {
    const shop = fallbackTenant.shops[0];
    return {
      tenantId: fallbackTenant.id,
      subdomain: fallbackTenant.subdomain,
      tenantName: fallbackTenant.name,
      shopId: shop.id,
      shopSlug: shop.slug,
      shopName: shop.name,
      matchedBy: "localhost",
    };
  }

  return null;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * 共用 Tenant 解析器（用於 Server Components / SSR）
 * 自動從 next/headers 讀取 host
 */
export async function resolveTenant(): Promise<TenantResolution | null> {
  const headersList = await headers();
  const hostname = extractHostname(headersList);
  return _resolveByHostname(hostname);
}

/**
 * 從 NextRequest 解析 tenant（用於 API Route）
 * 與 resolveTenant() 使用相同核心邏輯
 */
export async function resolveTenantFromRequest(
  request: Request
): Promise<TenantResolution | null> {
  const forwarded = request.headers.get("x-forwarded-host");
  const raw = forwarded || request.headers.get("host") || "";
  const hostname = raw.split(":")[0].toLowerCase().trim();
  return _resolveByHostname(hostname);
}
