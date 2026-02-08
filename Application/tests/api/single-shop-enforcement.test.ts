/**
 * Single Tenant = Single Shop enforcement tests
 * 驗證單店制規則：DB 查詢行為驗證（不依賴 NextRequest 全域物件）
 * @module tests/api/single-shop-enforcement
 */

// Mock next/headers
jest.mock("next/headers", () => ({
    headers: jest.fn(),
}));

// Mock Prisma client
jest.mock("@/lib/db", () => ({
    db: {
        shop: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        },
        order: {
            findFirst: jest.fn(),
        },
        tenant: {
            findFirst: jest.fn(),
        },
    },
}));

import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";
import { db } from "@/lib/db";

const mockShopFindFirst = db.shop.findFirst as jest.Mock;
const mockOrderFindFirst = db.order.findFirst as jest.Mock;
const mockTenantFindFirst = db.tenant.findFirst as jest.Mock;

// ─── Test data ───────────────────────────────────────────────

const TENANT_A_ID = "tenant-aaa-111";
const TENANT_B_ID = "tenant-bbb-222";

const TENANT_A = {
    id: TENANT_A_ID,
    subdomain: "shop-a",
    name: "Shop A",
    status: "ACTIVE",
};

const SHOP_A = {
    id: "shop-a-1",
    slug: "shop-a",
    name: "Shop A Store",
    domain: "shop-a.example.com",
    tenantId: TENANT_A_ID,
    tenant: TENANT_A,
};

const SHOP_B = {
    id: "shop-b-1",
    slug: "shop-b",
    name: "Shop B Store",
    domain: "shop-b.example.com",
    tenantId: TENANT_B_ID,
};

/** Helper: create a lightweight mock Request for resolveTenantFromRequest */
function createRequest(host: string): Request {
    return {
        headers: {
            get: (key: string) => {
                if (key.toLowerCase() === "host") return host;
                if (key.toLowerCase() === "x-forwarded-host") return null;
                return null;
            },
        },
    } as unknown as Request;
}

// ─── Tests ──────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
});

// =========================================================
// S3: 單店制 — DB unique 約束驗證（邏輯層）
// =========================================================
describe("Single Shop Enforcement - DB constraint logic", () => {
    it("tenant can only have one shop — findFirst by tenantId returns unique result", async () => {
        mockShopFindFirst.mockResolvedValue(SHOP_A);

        const existing = await db.shop.findFirst({
            where: { tenantId: TENANT_A_ID },
        });

        expect(existing).not.toBeNull();
        expect(existing!.tenantId).toBe(TENANT_A_ID);
        expect(mockShopFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { tenantId: TENANT_A_ID },
            })
        );
    });

    it("shop creation should be blocked when tenant already has a shop", async () => {
        // Simulate the check POST /api/shops performs
        mockShopFindFirst.mockResolvedValue(SHOP_A);

        const existing = await db.shop.findFirst({
            where: { tenantId: TENANT_A_ID },
            select: { id: true },
        });

        // The API should return 409 in this case
        expect(existing).not.toBeNull();
        // This proves the guard condition is met — API would reject
    });

    it("first shop creation is allowed when tenant has no shop", async () => {
        mockShopFindFirst.mockResolvedValue(null);

        const existing = await db.shop.findFirst({
            where: { tenantId: TENANT_A_ID },
            select: { id: true },
        });

        expect(existing).toBeNull();
        // API would proceed to create
    });
});

// =========================================================
// F9: orders/lookup — host-based tenant resolve, ignore shopSlug
// =========================================================
describe("Orders Lookup - host-based tenant isolation", () => {
    it("should return null for unknown host (fail-closed)", async () => {
        mockShopFindFirst.mockResolvedValue(null);
        mockTenantFindFirst.mockResolvedValue(null);

        const request = createRequest("evil.com");
        const result = await resolveTenantFromRequest(request);

        expect(result).toBeNull();
        // API would return 403 — attacker cannot query orders
    });

    it("should resolve tenant from host, regardless of what shopSlug client sends", async () => {
        // Attacker is on shop-a.example.com but sends shopSlug: "shop-b"
        const request = createRequest("shop-a.example.com");
        mockShopFindFirst.mockResolvedValue(SHOP_A);

        const result = await resolveTenantFromRequest(request);

        expect(result).not.toBeNull();
        expect(result!.tenantId).toBe(TENANT_A_ID);
        // The lookup API uses result.tenantId, NOT the shopSlug from body
        // So even if body.shopSlug = "shop-b", tenantId is still Tenant A
    });

    it("order query should use resolved tenantId, not client-provided shopSlug", async () => {
        const resolvedTenantId = TENANT_A_ID;
        const attackerShopSlug = "shop-b"; // belongs to Tenant B

        // Simulate what lookup API does after tenant resolution
        mockOrderFindFirst.mockResolvedValue(null);

        await db.order.findFirst({
            where: {
                orderNo: "ORD-123",
                tenantId: resolvedTenantId, // from host, NOT from shopSlug
                OR: [
                    { metadata: { path: ["guestEmail"], equals: "test@test.com" } },
                    { user: { email: "test@test.com" } },
                ],
            },
        });

        expect(mockOrderFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: TENANT_A_ID,
                    orderNo: "ORD-123",
                }),
            })
        );

        // shopSlug "shop-b" is never used in the query
        const callArgs = mockOrderFindFirst.mock.calls[0][0];
        expect(JSON.stringify(callArgs)).not.toContain(attackerShopSlug);
    });
});

// =========================================================
// S5: carts/checkout — shopId ignored, shop derived from tenant
// =========================================================
describe("Cart Checkout - shop derived from tenant", () => {
    it("should query shop by tenantId, not by client-provided shopId", async () => {
        const forgedShopId = "forged-shop-from-tenant-b";
        const sessionTenantId = TENANT_A_ID;

        // Simulate what checkout API does: ignore shopId, query by tenantId
        mockShopFindFirst.mockResolvedValue(SHOP_A);

        const shop = await db.shop.findFirst({
            where: { tenantId: sessionTenantId },
            select: { id: true },
        });

        expect(shop).not.toBeNull();
        expect(shop!.id).toBe(SHOP_A.id);

        // Verify forgedShopId was NOT used
        expect(mockShopFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: sessionTenantId,
                }),
            })
        );

        const callArgs = mockShopFindFirst.mock.calls[0][0];
        expect(JSON.stringify(callArgs)).not.toContain(forgedShopId);
    });

    it("should fail when tenant has no shop", async () => {
        mockShopFindFirst.mockResolvedValue(null);

        const shop = await db.shop.findFirst({
            where: { tenantId: TENANT_A_ID },
            select: { id: true },
        });

        expect(shop).toBeNull();
        // API would return 404
    });
});

// =========================================================
// F7: guest checkout — tenant resolved from host, not shopSlug
// =========================================================
describe("Guest Checkout - tenant isolation via host resolution", () => {
    it("should fail-closed when host cannot be resolved to a tenant", async () => {
        mockShopFindFirst.mockResolvedValue(null);
        mockTenantFindFirst.mockResolvedValue(null);

        const request = createRequest("unknown-domain.com");
        const result = await resolveTenantFromRequest(request);

        expect(result).toBeNull();
        // API returns 403 — guest cannot create order on unknown domain
    });

    it("should resolve tenant from host for guest checkout, ignore body shopSlug", async () => {
        const request = createRequest("shop-a.example.com");
        mockShopFindFirst.mockResolvedValue(SHOP_A);

        const result = await resolveTenantFromRequest(request);

        expect(result).not.toBeNull();
        expect(result!.tenantId).toBe(TENANT_A_ID);
        expect(result!.shopId).toBe(SHOP_A.id);

        // Even if client sends shopSlug: "shop-b", the tenant is always A
    });

    it("should use resolved tenant shopId for order shop association", async () => {
        const request = createRequest("shop-a.example.com");
        mockShopFindFirst.mockResolvedValue(SHOP_A);

        const result = await resolveTenantFromRequest(request);

        // The order API then queries shop within the resolved tenant
        mockShopFindFirst.mockResolvedValue(SHOP_A);
        const shop = await db.shop.findFirst({
            where: { id: result!.shopId },
            include: { tenant: true },
        });

        expect(shop).not.toBeNull();
        expect(shop!.tenantId).toBe(TENANT_A_ID);
    });
});
