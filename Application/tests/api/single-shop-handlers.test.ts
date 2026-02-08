/**
 * @jest-environment node
 */

/**
 * Handler-level tests for single-shop enforcement
 * 直接呼叫 API route handler 驗證 HTTP status 與 response body
 * @module tests/api/single-shop-handlers
 */

// Mock next/headers (required by route handlers)
jest.mock("next/headers", () => ({
    headers: jest.fn(),
}));

// Mock Prisma client
jest.mock("@/lib/db", () => ({
    db: {
        shop: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        order: {
            findFirst: jest.fn(),
        },
        tenant: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        },
        cart: {
            findFirst: jest.fn(),
        },
        product: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
    },
}));

// Mock auth helper
jest.mock("@/lib/api/auth-helpers", () => ({
    authWithTenant: jest.fn(),
    isWriteRole: jest.fn().mockReturnValue(true),
}));

// Mock tenant resolver
jest.mock("@/lib/tenant/resolve-tenant", () => ({
    resolveTenantFromRequest: jest.fn(),
}));

// Mock id generator
jest.mock("@/lib/id", () => ({
    generateId: jest.fn().mockReturnValue("mock-uuid-001"),
}));

// Mock slugify
jest.mock("@/lib/utils", () => ({
    slugify: jest.fn().mockImplementation((s: string) => s.toLowerCase().replace(/\s+/g, "-")),
    generateOrderNo: jest.fn().mockReturnValue("ORD-MOCK-001"),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";

const mockShopFindFirst = db.shop.findFirst as jest.Mock;
const mockShopCreate = db.shop.create as jest.Mock;
const mockOrderFindFirst = db.order.findFirst as jest.Mock;
const mockCartFindFirst = db.cart.findFirst as jest.Mock;
const mockAuthWithTenant = authWithTenant as jest.Mock;
const mockResolveTenant = resolveTenantFromRequest as jest.Mock;

// ─── Constants ───────────────────────────────────────────────

const TENANT_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const SESSION_OWNER = {
    user: {
        id: "user-owner-01",
        tenantId: TENANT_A_ID,
        role: "OWNER",
    },
};

const SESSION_MEMBER = {
    user: {
        id: "user-member-01",
        tenantId: TENANT_A_ID,
        role: "MEMBER",
    },
};

const EXISTING_SHOP = {
    id: "shop-aaa-001",
    tenantId: TENANT_A_ID,
    name: "My Shop",
    slug: "my-shop",
    currency: "TWD",
};

// ─── Helpers ─────────────────────────────────────────────────

/** Build a NextRequest from a URL + JSON body */
function buildRequest(path: string, body?: Record<string, unknown>): NextRequest {
    const url = `http://shop-a.example.com${path}`;
    const init: RequestInit = {
        method: body ? "POST" : "GET",
        headers: {
            "Content-Type": "application/json",
            host: "shop-a.example.com",
        },
    };
    if (body) {
        init.body = JSON.stringify(body);
    }
    return new NextRequest(url, init);
}

// ─── Setup ───────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
});

// =========================================================
// POST /api/shops — 409 when tenant already has a shop
// =========================================================
describe("POST /api/shops handler", () => {
    it("returns 409 CONFLICT when tenant already has a shop", async () => {
        mockAuthWithTenant.mockResolvedValue({ session: SESSION_OWNER });
        mockShopFindFirst.mockResolvedValue(EXISTING_SHOP);

        const { POST } = await import("@/app/api/shops/route");
        const req = buildRequest("/api/shops", { name: "Second Shop" });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(409);
        expect(data.success).toBe(false);
        expect(data.error.code).toBe("CONFLICT");
        expect(data.error.message).toContain("一個商店");
    });

    it("returns 200 and creates shop when tenant has no shop", async () => {
        mockAuthWithTenant.mockResolvedValue({ session: SESSION_OWNER });
        mockShopFindFirst.mockResolvedValue(null);
        mockShopCreate.mockResolvedValue({
            ...EXISTING_SHOP,
            id: "new-shop-id",
            name: "New Shop",
            slug: "new-shop",
        });

        const { POST } = await import("@/app/api/shops/route");
        const req = buildRequest("/api/shops", { name: "New Shop" });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.name).toBe("New Shop");
    });

    it("returns 403 when non-admin role tries to create shop", async () => {
        mockAuthWithTenant.mockResolvedValue({ session: SESSION_MEMBER });

        const { POST } = await import("@/app/api/shops/route");
        const req = buildRequest("/api/shops", { name: "Forbidden Shop" });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.success).toBe(false);
    });
});

// =========================================================
// POST /api/orders/lookup — 403 when tenant unresolvable
// =========================================================
describe("POST /api/orders/lookup handler", () => {
    it("returns 403 FORBIDDEN when tenant cannot be resolved from host", async () => {
        mockResolveTenant.mockResolvedValue(null);

        const { POST } = await import("@/app/api/orders/lookup/route");
        const req = buildRequest("/api/orders/lookup", {
            email: "attacker@evil.com",
            orderNo: "ORD-STOLEN-001",
            shopSlug: "victim-shop",
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when order not found within resolved tenant", async () => {
        mockResolveTenant.mockResolvedValue({
            tenantId: TENANT_A_ID,
            subdomain: "shop-a",
            shopId: "shop-aaa-001",
            shopSlug: "shop-a",
            matchedBy: "subdomain",
        });
        mockOrderFindFirst.mockResolvedValue(null);

        const { POST } = await import("@/app/api/orders/lookup/route");
        const req = buildRequest("/api/orders/lookup", {
            email: "customer@test.com",
            orderNo: "ORD-NONEXIST",
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(404);
        expect(data.success).toBe(false);
    });
});

// =========================================================
// POST /api/carts/checkout — shop derived from tenant
// =========================================================
describe("POST /api/carts/checkout handler", () => {
    it("returns 404 when tenant has no shop", async () => {
        mockAuthWithTenant.mockResolvedValue({ session: SESSION_OWNER });
        mockShopFindFirst.mockResolvedValue(null);

        const { POST } = await import("@/app/api/carts/checkout/route");
        // Use a valid UUID so Zod validation passes and we reach the shop lookup
        const forgedShopId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        const req = buildRequest("/api/carts/checkout", {
            shopId: forgedShopId,
            shippingAddress: {
                contactName: "Test",
                phone: "0912345678",
                city: "Taipei",
                postalCode: "100",
                addressLine1: "123 Test Rd",
            },
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(404);
        expect(data.success).toBe(false);
        expect(data.error.code).toBe("NOT_FOUND");
    });

    it("derives shop from tenant — ignores forged shopId in request body", async () => {
        mockAuthWithTenant.mockResolvedValue({ session: SESSION_OWNER });
        mockShopFindFirst.mockResolvedValue(EXISTING_SHOP);
        // Cart is empty → should still query shop by tenant, not by forged shopId
        mockCartFindFirst.mockResolvedValue(null);

        const forgedShopId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        const { POST } = await import("@/app/api/carts/checkout/route");
        const req = buildRequest("/api/carts/checkout", {
            shopId: forgedShopId,
            shippingAddress: {
                contactName: "Test",
                phone: "0912345678",
                city: "Taipei",
                postalCode: "100",
                addressLine1: "123 Test Rd",
            },
        });

        await POST(req);

        // Verify shop was queried by tenantId, NOT by the forged shopId
        expect(mockShopFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { tenantId: TENANT_A_ID },
            })
        );

        // Ensure the forged ID was never passed to any db call
        const allCalls = JSON.stringify(mockShopFindFirst.mock.calls);
        expect(allCalls).not.toContain(forgedShopId);
    });
});
