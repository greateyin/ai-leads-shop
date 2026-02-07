/**
 * Unit tests for shared tenant resolver
 * @module lib/tenant/resolve-tenant
 */

// Mock next/headers before importing the module
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

// Mock Prisma client
jest.mock("@/lib/db", () => ({
  db: {
    shop: { findFirst: jest.fn() },
    tenant: { findFirst: jest.fn() },
  },
}));

import { resolveTenant, resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";
import { headers } from "next/headers";
import { db } from "@/lib/db";

const mockHeaders = headers as jest.MockedFunction<typeof headers>;
const mockShopFindFirst = db.shop.findFirst as jest.Mock;
const mockTenantFindFirst = db.tenant.findFirst as jest.Mock;

/** Helper: create a mock Headers object */
function createMockHeaders(map: Record<string, string>): Headers {
  return {
    get: (key: string) => map[key.toLowerCase()] ?? null,
  } as unknown as Headers;
}

/** Helper: create a mock Request */
function createMockRequest(host: string, forwarded?: string): Request {
  const headerMap: Record<string, string> = { host };
  if (forwarded) headerMap["x-forwarded-host"] = forwarded;
  return {
    headers: createMockHeaders(headerMap),
  } as unknown as Request;
}

/** Reusable mock data */
const ACTIVE_TENANT = {
  id: "tenant-1",
  subdomain: "myshop",
  name: "My Shop",
  status: "ACTIVE",
};

const MOCK_SHOP = {
  id: "shop-1",
  slug: "my-shop",
  name: "My Shop Store",
  domain: "myshop.com",
  tenant: ACTIVE_TENANT,
};

const INACTIVE_TENANT = {
  ...ACTIVE_TENANT,
  id: "tenant-inactive",
  status: "SUSPENDED",
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── resolveTenant() (SSR / Server Component) ────────────────

describe("resolveTenant", () => {
  it("should resolve by custom domain", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "myshop.com" }) as any
    );
    mockShopFindFirst.mockResolvedValue(MOCK_SHOP);

    const result = await resolveTenant();

    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe("tenant-1");
    expect(result!.shopId).toBe("shop-1");
    expect(result!.matchedBy).toBe("domain");
    expect(mockShopFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domain: "myshop.com" },
      })
    );
  });

  it("should resolve by subdomain", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "myshop.example.com" }) as any
    );
    // Custom domain lookup returns null
    mockShopFindFirst.mockResolvedValue(null);
    // Subdomain lookup returns tenant
    mockTenantFindFirst.mockResolvedValue({
      ...ACTIVE_TENANT,
      shops: [{ id: "shop-2", slug: "shop-two", name: "Shop Two" }],
    });

    const result = await resolveTenant();

    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe("tenant-1");
    expect(result!.subdomain).toBe("myshop");
    expect(result!.matchedBy).toBe("subdomain");
  });

  it("should return null for www subdomain", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "www.example.com" }) as any
    );
    mockShopFindFirst.mockResolvedValue(null);

    const result = await resolveTenant();

    expect(result).toBeNull();
    // Should NOT query tenant by 'www'
    expect(mockTenantFindFirst).not.toHaveBeenCalled();
  });

  it("should return null for bare domain (no subdomain)", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "example.com" }) as any
    );
    mockShopFindFirst.mockResolvedValue(null);

    const result = await resolveTenant();

    expect(result).toBeNull();
  });

  it("should return null for inactive tenant (custom domain)", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "myshop.com" }) as any
    );
    mockShopFindFirst.mockResolvedValue({
      ...MOCK_SHOP,
      tenant: INACTIVE_TENANT,
    });

    const result = await resolveTenant();

    // Custom domain matched but tenant is SUSPENDED → falls through
    // No subdomain in "myshop.com" (only 2 parts) → returns null
    expect(result).toBeNull();
  });

  it("should fallback to first active tenant on localhost (dev mode)", async () => {
    const originalEnv = process.env.NODE_ENV;
    // @ts-ignore - NODE_ENV override for test
    process.env.NODE_ENV = "development";

    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "localhost:3000" }) as any
    );
    mockTenantFindFirst.mockResolvedValue({
      ...ACTIVE_TENANT,
      shops: [{ id: "shop-dev", slug: "dev-shop", name: "Dev Shop" }],
    });

    const result = await resolveTenant();

    expect(result).not.toBeNull();
    expect(result!.matchedBy).toBe("localhost");
    expect(result!.shopSlug).toBe("dev-shop");

    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });

  it("should return null on localhost in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    // @ts-ignore
    process.env.NODE_ENV = "production";

    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "localhost:3000" }) as any
    );

    const result = await resolveTenant();

    expect(result).toBeNull();

    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });

  it("should return null for empty host header", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({}) as any
    );

    const result = await resolveTenant();

    expect(result).toBeNull();
  });

  it("should prefer x-forwarded-host over host", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({
        host: "internal.lb.local",
        "x-forwarded-host": "myshop.com",
      }) as any
    );
    mockShopFindFirst.mockResolvedValue(MOCK_SHOP);

    const result = await resolveTenant();

    expect(result).not.toBeNull();
    expect(result!.matchedBy).toBe("domain");
    // Should query with the forwarded host, not the internal host
    expect(mockShopFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domain: "myshop.com" },
      })
    );
  });

  it("should strip port from host header", async () => {
    mockHeaders.mockResolvedValue(
      createMockHeaders({ host: "myshop.com:443" }) as any
    );
    mockShopFindFirst.mockResolvedValue(MOCK_SHOP);

    const result = await resolveTenant();

    expect(result).not.toBeNull();
    expect(mockShopFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domain: "myshop.com" },
      })
    );
  });
});

// ─── resolveTenantFromRequest() (API Route) ──────────────────

describe("resolveTenantFromRequest", () => {
  it("should resolve by custom domain from Request object", async () => {
    const request = createMockRequest("myshop.com");
    mockShopFindFirst.mockResolvedValue(MOCK_SHOP);

    const result = await resolveTenantFromRequest(request);

    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe("tenant-1");
    expect(result!.matchedBy).toBe("domain");
  });

  it("should resolve by subdomain from Request object", async () => {
    const request = createMockRequest("tenant-a.example.com");
    mockShopFindFirst.mockResolvedValue(null);
    mockTenantFindFirst.mockResolvedValue({
      id: "t-a",
      subdomain: "tenant-a",
      name: "Tenant A",
      status: "ACTIVE",
      shops: [{ id: "s-a", slug: "shop-a", name: "Shop A" }],
    });

    const result = await resolveTenantFromRequest(request);

    expect(result).not.toBeNull();
    expect(result!.subdomain).toBe("tenant-a");
    expect(result!.matchedBy).toBe("subdomain");
  });

  it("should prefer x-forwarded-host in Request", async () => {
    const request = createMockRequest("internal:8080", "myshop.com");
    mockShopFindFirst.mockResolvedValue(MOCK_SHOP);

    const result = await resolveTenantFromRequest(request);

    expect(result).not.toBeNull();
    expect(result!.matchedBy).toBe("domain");
  });

  it("should return null for unknown domain", async () => {
    const request = createMockRequest("unknown.com");
    mockShopFindFirst.mockResolvedValue(null);

    const result = await resolveTenantFromRequest(request);

    expect(result).toBeNull();
  });
});
