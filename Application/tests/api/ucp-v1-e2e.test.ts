/**
 * @jest-environment node
 */

/**
 * UCP v1 — E2E 流程測試 + 安全測試
 *
 * 三層測試：
 *   1. Kill Switch — UCP_ENABLED=false 時所有路由回 503
 *   2. E2E Happy Path — availability → checkout → update → complete → order
 *   3. Security — 錯誤 API key / 跨 tenant / replay complete idempotency
 *
 * 直接呼叫 route handler（不啟動 HTTP server），mock Prisma。
 *
 * @module tests/api/ucp-v1-e2e
 */

// ============================================
// Mocks — 必須在 import 前宣告（jest.mock 會被 hoisted）
// ============================================

jest.mock("next/headers", () => ({
    headers: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
    db: {
        shop: { findFirst: jest.fn(), findMany: jest.fn() },
        product: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
        ucpCheckoutSession: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        order: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        paymentProvider: { findMany: jest.fn() },
        $transaction: jest.fn(),
    },
}));

jest.mock("@/lib/id", () => ({
    generateId: jest.fn(() => "00000000-0000-0000-0000-000000000001"),
}));

jest.mock("@/lib/payment/stripe", () => ({
    getStripeConfigForTenant: jest.fn(() => null),
    createPaymentIntent: jest.fn(),
}));

jest.mock("@/lib/ucp/middleware", () => ({
    verifyUcpRequest: jest.fn(),
    verifyUcpPublicRequest: jest.fn(),
    formatUcpError: jest.fn((code: string, message: string, details?: unknown) => ({
        error: { code, message, ...(details || {}) },
    })),
}));

jest.mock("@/lib/ucp/handlers/callbacks", () => ({
    sendOrderCallback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/logistics", () => ({
    calculateShippingFee: jest.fn(() => 60),
}));

// ============================================
// Imports
// ============================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyUcpRequest, verifyUcpPublicRequest } from "@/lib/ucp/middleware";

/** 型別化的 mock db */
const mockDb = db as unknown as {
    shop: { findFirst: jest.Mock; findMany: jest.Mock };
    product: { findMany: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
    ucpCheckoutSession: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    order: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    paymentProvider: { findMany: jest.Mock };
    $transaction: jest.Mock;
};

const mockVerifyUcp = verifyUcpRequest as jest.Mock;
const mockVerifyUcpPublic = verifyUcpPublicRequest as jest.Mock;

// ============================================
// Test Constants
// ============================================

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SHOP_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PRODUCT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SESSION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ORDER_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const AUTH_OK = {
    success: true,
    context: {
        tenantId: TENANT_ID,
        shopId: SHOP_ID,
        platformId: "google",
        merchantId: SHOP_ID,
    },
};

const AUTH_FAIL = {
    success: false,
    error: "Invalid API key",
};

const MOCK_SHOP = {
    id: SHOP_ID,
    name: "Test Shop",
    tenantId: TENANT_ID,
    domain: null,
    currency: "TWD",
    config: {
        ucp: {
            enabled: true,
            callbackUrl: "https://example.com/callback",
            paymentHandlers: ["CARD"],
            shippingCountries: ["TW"],
        },
    },
    tenant: { name: "TestTenant" },
};

const MOCK_PRODUCT = {
    id: PRODUCT_ID,
    name: "Test Widget",
    price: 500,
    stock: 10,
    sku: "TW001",
    coverImageUrl: null,
    shop: { domain: null },
};

// ============================================
// Helpers
// ============================================

/**
 * 建立帶有 JSON body 的 NextRequest
 */
function makeRequest(
    url: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>
): NextRequest {
    const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "X-UCP-Api-Key": "test-api-key",
        "X-UCP-Platform-Id": "google",
        ...(headers || {}),
    };
    const init: { method: string; headers: Record<string, string>; body?: string } = {
        method,
        headers: reqHeaders,
    };
    if (body) {
        init.body = JSON.stringify(body);
    }
    return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

// ============================================
// Test Suites
// ============================================

describe("UCP v1 — Kill Switch", () => {
    const originalEnv = process.env.UCP_ENABLED;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.UCP_ENABLED;
        } else {
            process.env.UCP_ENABLED = originalEnv;
        }
    });

    it("should return 503 when UCP_ENABLED=false on POST checkout-sessions", async () => {
        process.env.UCP_ENABLED = "false";
        // Re-import to pick up the env change — guard reads env at call time
        const { POST } = await import("@/app/api/ucp/v1/checkout-sessions/route");
        const req = makeRequest("/api/ucp/v1/checkout-sessions", "POST", { cart: {} });
        const res = await POST(req);
        expect(res.status).toBe(503);
        const json = await res.json();
        expect(json.error.code).toBe("SERVICE_UNAVAILABLE");
        expect(res.headers.get("Retry-After")).toBe("300");
    });

    it("should return 503 when UCP_ENABLED=false on GET orders", async () => {
        process.env.UCP_ENABLED = "false";
        const { GET } = await import("@/app/api/ucp/v1/orders/[orderId]/route");
        const req = makeRequest("/api/ucp/v1/orders/abc", "GET");
        const res = await GET(req, { params: Promise.resolve({ orderId: "abc" }) });
        expect(res.status).toBe(503);
    });

    it("should pass through when UCP_ENABLED is not false", async () => {
        process.env.UCP_ENABLED = "true";
        mockVerifyUcp.mockResolvedValue(AUTH_FAIL);
        const { POST } = await import("@/app/api/ucp/v1/checkout-sessions/route");
        const req = makeRequest("/api/ucp/v1/checkout-sessions", "POST", {
            merchantId: SHOP_ID,
            cart: { items: [], currency: "TWD" },
        });
        const res = await POST(req);
        // Should NOT be 503 — it might be 400 or 401, but not 503
        expect(res.status).not.toBe(503);
    });
});

describe("UCP v1 — Security", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
    });

    it("should return 401 for invalid API key on checkout-sessions POST", async () => {
        mockVerifyUcp.mockResolvedValue(AUTH_FAIL);
        const { POST } = await import("@/app/api/ucp/v1/checkout-sessions/route");
        const req = makeRequest("/api/ucp/v1/checkout-sessions", "POST", {
            merchantId: SHOP_ID,
            cart: {
                items: [{ offer: { offerId: PRODUCT_ID, price: { value: 50000, currency: "TWD" } }, quantity: 1 }],
                currency: "TWD",
            },
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("should return 401 for invalid API key on orders GET", async () => {
        mockVerifyUcp.mockResolvedValue(AUTH_FAIL);
        const { GET } = await import("@/app/api/ucp/v1/orders/[orderId]/route");
        const req = makeRequest("/api/ucp/v1/orders/abc", "GET");
        const res = await GET(req, { params: Promise.resolve({ orderId: "abc" }) });
        expect(res.status).toBe(401);
    });

    it("should return 401 for invalid API key on complete POST", async () => {
        mockVerifyUcp.mockResolvedValue(AUTH_FAIL);
        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: {} }
        );
        const res = await POST(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });
        expect(res.status).toBe(401);
    });

    it("should return 404 when accessing order from different tenant/merchant", async () => {
        const crossTenantAuth = {
            success: true,
            context: {
                tenantId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
                shopId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
                platformId: "google",
                merchantId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            },
        };
        mockVerifyUcp.mockResolvedValue(crossTenantAuth);
        mockDb.order.findFirst.mockResolvedValue(null); // Cross-tenant: order not found

        const { GET } = await import("@/app/api/ucp/v1/orders/[orderId]/route");
        const req = makeRequest(`/api/ucp/v1/orders/${ORDER_ID}`, "GET");
        const res = await GET(req, { params: Promise.resolve({ orderId: ORDER_ID }) });
        expect(res.status).toBe(404);
    });
});

describe("UCP v1 — E2E Happy Path (availability → checkout → update → complete → order)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
        mockVerifyUcp.mockResolvedValue(AUTH_OK);
        mockVerifyUcpPublic.mockResolvedValue(AUTH_OK);
    });

    it("Step 1: POST /products/availability — should return product stock", async () => {
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.product.findMany.mockResolvedValue([
            { ...MOCK_PRODUCT, stock: 10, price: { toNumber: () => 500 } },
        ]);

        const { POST } = await import("@/app/api/ucp/v1/products/availability/route");
        const req = makeRequest("/api/ucp/v1/products/availability", "POST", {
            merchantId: SHOP_ID,
            products: [{ offerId: PRODUCT_ID, quantity: 1 }],
            shippingAddress: {
                addressLines: ["123 Test St"],
                locality: "Taipei",
                postalCode: "100",
                regionCode: "TW",
            },
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.products).toBeDefined();
        expect(json.products.length).toBe(1);
        expect(json.products[0].availability).toBe("IN_STOCK");
    });

    it("Step 2: POST /checkout-sessions — should create session", async () => {
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.product.findMany.mockResolvedValue([
            {
                id: PRODUCT_ID,
                name: "Test Widget",
                price: { toNumber: () => 500 },
                stock: 10,
                tenantId: TENANT_ID,
            },
        ]);
        mockDb.paymentProvider.findMany.mockResolvedValue([]);
        mockDb.ucpCheckoutSession.create.mockResolvedValue({
            id: SESSION_ID,
            status: "PENDING",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const { POST } = await import("@/app/api/ucp/v1/checkout-sessions/route");
        const req = makeRequest("/api/ucp/v1/checkout-sessions", "POST", {
            merchantId: SHOP_ID,
            cart: {
                items: [
                    {
                        offer: {
                            offerId: PRODUCT_ID,
                            price: { value: 50000, currency: "TWD" },
                        },
                        quantity: 1,
                    },
                ],
                currency: "TWD",
            },
            buyerInfo: { email: "test@example.com" },
        });

        const res = await POST(req);
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.id).toBeDefined();
        expect(json.state).toBe("CREATED");
        expect(json.cart).toBeDefined();
        expect(json.cart.items.length).toBe(1);
    });

    it("Step 3: GET /checkout-sessions/{id} — should return session", async () => {
        const now = new Date();
        const expires = new Date(now.getTime() + 3600000);
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            tenantId: TENANT_ID,
            shopId: SHOP_ID,
            status: "PENDING",
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { value: 50000, currency: "TWD" } }],
                subtotal: { value: 50000, currency: "TWD" },
                shippingFee: { value: 6000, currency: "TWD" },
                total: { value: 56000, currency: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            paymentHandlers: [{ type: "CARD" }],
            buyerEmail: "test@example.com",
            expiresAt: expires,
            createdAt: now,
            updatedAt: now,
        });

        const { GET } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/route"
        );
        const req = makeRequest(`/api/ucp/v1/checkout-sessions/${SESSION_ID}`, "GET");
        const res = await GET(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.id).toBe(SESSION_ID);
        expect(json.state).toBe("CREATED");
    });

    it("Step 4: PUT /checkout-sessions/{id} — should update shipping address", async () => {
        const now = new Date();
        const expires = new Date(now.getTime() + 3600000);
        const existingSession = {
            id: SESSION_ID,
            tenantId: TENANT_ID,
            shopId: SHOP_ID,
            status: "PENDING",
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { value: 50000, currency: "TWD" } }],
                subtotal: { value: 50000, currency: "TWD" },
                shippingFee: { value: 6000, currency: "TWD" },
                total: { value: 56000, currency: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            paymentHandlers: [{ type: "CARD" }],
            buyerEmail: "test@example.com",
            metadata: null,
            expiresAt: expires,
            createdAt: now,
            updatedAt: now,
        };

        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue(existingSession);
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.ucpCheckoutSession.update.mockResolvedValue({
            ...existingSession,
            shippingAddress: {
                addressLines: ["456 New St"],
                locality: "Kaohsiung",
                postalCode: "800",
                regionCode: "TW",
            },
        });

        const { PUT } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}`,
            "PUT",
            {
                shippingAddress: {
                    addressLines: ["456 New St"],
                    locality: "Kaohsiung",
                    postalCode: "800",
                    regionCode: "TW",
                },
            }
        );
        const res = await PUT(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.id).toBe(SESSION_ID);
    });

    it("Step 5: POST /checkout-sessions/{id}/complete — should create order", async () => {
        const now = new Date();
        const expires = new Date(now.getTime() + 3600000);
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            tenantId: TENANT_ID,
            shopId: SHOP_ID,
            status: "PENDING",
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { value: 50000, currency: "TWD" } }],
                subtotal: { value: 50000, currency: "TWD" },
                shippingFee: { value: 6000, currency: "TWD" },
                total: { value: 56000, currency: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            paymentHandlers: [{ type: "CARD" }],
            buyerEmail: "test@example.com",
            expiresAt: expires,
            createdAt: now,
            updatedAt: now,
            orderId: null,
        });

        mockDb.product.findFirst.mockResolvedValue({
            name: "Test Widget",
            sku: "TW001",
        });

        const mockOrder = {
            id: ORDER_ID,
            orderNo: "UCP123ABC",
            status: "PENDING",
            createdAt: now,
            updatedAt: now,
            items: [
                { productId: PRODUCT_ID, quantity: 1, unitPrice: 500 },
            ],
        };

        mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                ucpCheckoutSession: {
                    updateMany: jest.fn().mockResolvedValue({ count: 1 }), // atomic claim
                },
                order: {
                    create: jest.fn().mockResolvedValue(mockOrder),
                },
                product: {
                    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                },
                address: {
                    create: jest.fn().mockResolvedValue({}),
                },
            };
            return fn(tx);
        });

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );
        const res = await POST(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.id).toBeDefined();
        expect(json.state).toBeDefined();
    });

    it("Step 6: GET /orders/{id} — should return order", async () => {
        const now = new Date();
        mockDb.order.findFirst.mockResolvedValue({
            id: ORDER_ID,
            shopId: SHOP_ID,
            orderNo: "UCP123ABC",
            status: "PAID",
            totalAmount: 56000,
            shippingFee: 6000,
            taxAmount: 0,
            discountAmount: 0,
            paymentStatus: "PAID",
            createdAt: now,
            updatedAt: now,
            items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 500 }],
            addresses: [],
            shop: { currency: "TWD" },
        });

        const { GET } = await import("@/app/api/ucp/v1/orders/[orderId]/route");
        const req = makeRequest(`/api/ucp/v1/orders/${ORDER_ID}`, "GET");
        const res = await GET(req, { params: Promise.resolve({ orderId: ORDER_ID }) });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.id).toBe(ORDER_ID);
        expect(json.state).toBeDefined();
    });
});

describe("UCP v1 — Replay Idempotency", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
        mockVerifyUcp.mockResolvedValue(AUTH_OK);
    });

    it("should return existing order when replaying complete on COMPLETED session", async () => {
        const now = new Date();
        const expires = new Date(now.getTime() + 3600000);
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        // Session 已完成且有 orderId
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            tenantId: TENANT_ID,
            shopId: SHOP_ID,
            status: "COMPLETED",
            orderId: ORDER_ID,
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { value: 50000, currency: "TWD" } }],
                subtotal: { value: 50000, currency: "TWD" },
                total: { value: 56000, currency: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            paymentHandlers: [{ type: "CARD" }],
            buyerEmail: "test@example.com",
            expiresAt: expires,
            createdAt: now,
            updatedAt: now,
        });
        // 既有訂單（含 currency）
        mockDb.order.findFirst.mockResolvedValue({
            id: ORDER_ID,
            shopId: SHOP_ID,
            orderNo: "UCP123ABC",
            status: "PAID",
            currency: "TWD",
            totalAmount: 56000,
            shippingFee: 6000,
            taxAmount: 0,
            paymentStatus: "PAID",
            createdAt: now,
            updatedAt: now,
            items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 500 }],
        });

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );
        const res = await POST(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });

        // Idempotent: 應回傳 201 且內含既有訂單，不建新單
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.id).toBe(ORDER_ID);

        // 不應呼叫 $transaction（不建新單）
        expect(mockDb.$transaction).not.toHaveBeenCalled();
    });

    it("should not duplicate stock decrement on replay", async () => {
        const now = new Date();
        const expires = new Date(now.getTime() + 3600000);
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            tenantId: TENANT_ID,
            shopId: SHOP_ID,
            status: "COMPLETED",
            orderId: ORDER_ID,
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { value: 50000, currency: "TWD" } }],
                subtotal: { value: 50000, currency: "TWD" },
                total: { value: 56000, currency: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            paymentHandlers: [{ type: "CARD" }],
            buyerEmail: "test@example.com",
            expiresAt: expires,
            createdAt: now,
            updatedAt: now,
        });
        mockDb.order.findFirst.mockResolvedValue({
            id: ORDER_ID,
            shopId: SHOP_ID,
            orderNo: "UCP123ABC",
            status: "PAID",
            currency: "TWD",
            totalAmount: 56000,
            shippingFee: 6000,
            taxAmount: 0,
            paymentStatus: "PAID",
            createdAt: now,
            updatedAt: now,
            items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 500 }],
        });

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        // 打兩次（各建立獨立 NextRequest 避免 clone() 型別問題）
        const req1 = makeRequest(`/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`, "POST", { paymentInfo: {} });
        const req2 = makeRequest(`/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`, "POST", { paymentInfo: {} });
        const res1 = await POST(req1, { params: Promise.resolve({ checkoutSessionId: SESSION_ID }) });
        const res2 = await POST(req2, { params: Promise.resolve({ checkoutSessionId: SESSION_ID }) });

        // 兩次都應回傳 201（idempotency），且為同一筆訂單
        expect(res1.status).toBe(201);
        expect(res2.status).toBe(201);
        const json1 = await res1.json();
        const json2 = await res2.json();
        expect(json1.id).toBe(json2.id);

        // $transaction 不應被呼叫（代表庫存未被重複扣減）
        expect(mockDb.$transaction).not.toHaveBeenCalled();
    });
});

describe("UCP v1 — Profile Discovery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
    });

    it("should return profile at /.well-known/merchant-api/ucp/profile.json", async () => {
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        const { GET } = await import(
            "@/app/.well-known/merchant-api/ucp/profile.json/route"
        );
        const req = makeRequest(
            `/.well-known/merchant-api/ucp/profile.json?merchantId=${SHOP_ID}`,
            "GET"
        );
        const res = await GET(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.provider).toBeDefined();
        expect(json.checkoutConfig).toBeDefined();
        expect(json.authentication).toBeDefined();
        expect(json.authentication.type).toBe("API_KEY");
        expect(json.authentication.apiRequestHeaders["X-UCP-Api-Key"]).toBe("{api_key}");
    });

    it("should return 404 when no domain match and no merchantId", async () => {
        mockDb.shop.findFirst.mockResolvedValue(null);
        const { GET } = await import(
            "@/app/.well-known/merchant-api/ucp/profile.json/route"
        );
        const req = makeRequest("/.well-known/merchant-api/ucp/profile.json", "GET");
        const res = await GET(req);
        expect(res.status).toBe(404);
    });

    it("should resolve merchant from Host header (Google discovery)", async () => {
        // 第一次呼叫（domain 反查）回傳 shop
        mockDb.shop.findFirst.mockResolvedValueOnce(MOCK_SHOP);
        const { GET } = await import(
            "@/app/.well-known/merchant-api/ucp/profile.json/route"
        );
        const req = makeRequest(
            "/.well-known/merchant-api/ucp/profile.json",
            "GET",
            undefined,
            { host: "myshop.example.com" }
        );
        const res = await GET(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.provider).toBeDefined();
    });

    it("should return 503 when UCP is disabled", async () => {
        process.env.UCP_ENABLED = "false";
        const { GET } = await import(
            "@/app/.well-known/merchant-api/ucp/profile.json/route"
        );
        const req = makeRequest(
            `/.well-known/merchant-api/ucp/profile.json?merchantId=${SHOP_ID}`,
            "GET"
        );
        const res = await GET(req);
        expect(res.status).toBe(503);
    });
});

// ============================================
// Duplicate API Key Hash — fail-closed
// ============================================

describe("UCP v1 — API Key Duplicate Hash", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
    });

    it("should reject when multiple shops share the same apiKeyHash", async () => {
        // 使用 jest.requireActual 取得真實 middleware（db 仍是 mock）
        const realMiddleware = jest.requireActual("@/lib/ucp/middleware") as {
            verifyUcpRequest: typeof import("@/lib/ucp/middleware").verifyUcpRequest;
        };

        // sha256("test-api-key") — makeRequest 預設的 API key
        const testKeyHash = "4c806362b613f7496abf284146efd31da90e4b16169fe001841ca17290f427c4";

        // 模擬 shop.findFirst 查不到（merchantId 路徑不走）
        mockDb.shop.findFirst.mockResolvedValue(null);
        // 模擬 shop.findMany 回傳兩間 apiKeyHash 相同的商店
        mockDb.shop.findMany.mockResolvedValue([
            {
                id: SHOP_ID,
                tenantId: TENANT_ID,
                config: { ucp: { enabled: true, apiKeyHash: testKeyHash } },
            },
            {
                id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
                tenantId: "11111111-1111-1111-1111-111111111111",
                config: { ucp: { enabled: true, apiKeyHash: testKeyHash } },
            },
        ]);

        const req = makeRequest("/api/ucp/v1/orders/some-id", "GET");
        const result = await realMiddleware.verifyUcpRequest(req);

        expect(result.success).toBe(false);
        expect(result.error).toContain("conflict");
    });
});

// ============================================
// Metrics Endpoint — closed-by-default
// ============================================

describe("UCP v1 — Metrics Security", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
        delete process.env.UCP_METRICS_TOKEN;
    });

    it("should return 403 when UCP_METRICS_TOKEN is not configured", async () => {
        delete process.env.UCP_METRICS_TOKEN;
        const { GET } = await import("@/app/api/ucp/v1/metrics/route");
        const req = makeRequest("/api/ucp/v1/metrics", "GET");
        const res = await GET(req);
        expect(res.status).toBe(403);
    });

    it("should return 403 when token header does not match", async () => {
        process.env.UCP_METRICS_TOKEN = "secret-metrics-token";
        const { GET } = await import("@/app/api/ucp/v1/metrics/route");
        const req = makeRequest("/api/ucp/v1/metrics", "GET", undefined, {
            "X-Internal-Token": "wrong-token",
        });
        const res = await GET(req);
        expect(res.status).toBe(403);
    });

    it("should return 200 when correct token is provided", async () => {
        process.env.UCP_METRICS_TOKEN = "secret-metrics-token";
        const { GET } = await import("@/app/api/ucp/v1/metrics/route");
        const req = makeRequest("/api/ucp/v1/metrics", "GET", undefined, {
            "X-Internal-Token": "secret-metrics-token",
        });
        const res = await GET(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.timestamp).toBeDefined();
        expect(json.routes).toBeDefined();
        expect(json.summary).toBeDefined();
    });
});

// ============================================
// TOCTOU — Session Expiry During Atomic Claim
// ============================================

describe("UCP v1 — TOCTOU Expiry Protection", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
        mockVerifyUcp.mockResolvedValue(AUTH_OK);
    });

    /**
     * 情境：session 在前置檢查時有效（expiresAt > now），
     * 但在原子 claim 時已過期（TOCTOU 窗口）。
     * 預期：410 SESSION_EXPIRED，不建單。
     */
    it("should return 410 when session expires between pre-check and atomic claim", async () => {
        const now = new Date();
        // expiresAt 設在「剛好過去 1 秒」— 前置檢查時 mock 回傳未過期的 session，
        // 但 atomic claim 的 expiresAt > now 條件會失敗
        const justExpired = new Date(Date.now() - 1000);

        // 前置檢查：findFirst 回傳 expiresAt 尚未到（模擬 TOCTOU 窗口）
        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            status: "PENDING",
            orderId: null,
            expiresAt: new Date(Date.now() + 60_000), // 前置檢查時仍有效
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { amountMillis: 500000, currencyCode: "TWD" } }],
                subtotal: { amountMillis: 500000, currencyCode: "TWD" },
                total: { amountMillis: 500000, currencyCode: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            buyerEmail: null,
            createdAt: now,
            updatedAt: now,
        });

        mockDb.product.findFirst.mockResolvedValue({ name: "Test Widget", sku: "TW001" });

        // $transaction 內：claim 回 count: 0（expiresAt 條件未通過），
        // re-query 回傳已過期 session
        mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                ucpCheckoutSession: {
                    updateMany: jest.fn().mockResolvedValue({ count: 0 }), // claim 失敗
                    findFirst: jest.fn().mockResolvedValue({
                        status: "PENDING",
                        orderId: null,
                        expiresAt: justExpired, // re-query: 已過期
                    }),
                },
                order: { create: jest.fn() },
                product: { updateMany: jest.fn() },
                address: { create: jest.fn() },
            };
            return fn(tx);
        });

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );
        const res = await POST(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });

        expect(res.status).toBe(410);
        const json = await res.json();
        expect(json.error.code).toBe("SESSION_EXPIRED");
    });

    /**
     * 情境：session 已在前置檢查時過期。
     * 預期：410 SESSION_EXPIRED（由 handler 直接回傳，不進 transaction）。
     */
    it("should return 410 when session is already expired at pre-check", async () => {
        const now = new Date();
        const expired = new Date(Date.now() - 60_000);

        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            status: "PENDING",
            orderId: null,
            expiresAt: expired, // 已過期
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { amountMillis: 500000, currencyCode: "TWD" } }],
                subtotal: { amountMillis: 500000, currencyCode: "TWD" },
                total: { amountMillis: 500000, currencyCode: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            buyerEmail: null,
            createdAt: now,
            updatedAt: now,
        });

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );
        const res = await POST(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });

        expect(res.status).toBe(410);
        const json = await res.json();
        expect(json.error.code).toBe("SESSION_EXPIRED");

        // 不應進入 $transaction
        expect(mockDb.$transaction).not.toHaveBeenCalled();
    });

    /**
     * 情境：claim 失敗但不是因為過期 → 另一請求搶先 claim。
     * 預期：409 CONFLICT。
     */
    it("should return 409 when another request claims the session concurrently", async () => {
        const now = new Date();
        const expires = new Date(Date.now() + 3600_000);

        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            status: "PENDING",
            orderId: null,
            expiresAt: expires,
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 1, price: { amountMillis: 500000, currencyCode: "TWD" } }],
                subtotal: { amountMillis: 500000, currencyCode: "TWD" },
                total: { amountMillis: 500000, currencyCode: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            buyerEmail: null,
            createdAt: now,
            updatedAt: now,
        });

        mockDb.product.findFirst.mockResolvedValue({ name: "Test Widget", sku: "TW001" });

        // $transaction 內：claim 回 count: 0（被搶先），
        // re-query 回傳已 COMPLETED 且仍在有效期內
        mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                ucpCheckoutSession: {
                    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                    findFirst: jest.fn().mockResolvedValue({
                        status: "COMPLETED",
                        orderId: ORDER_ID,
                        expiresAt: expires, // 仍有效，不是過期
                    }),
                },
                order: { create: jest.fn() },
                product: { updateMany: jest.fn() },
                address: { create: jest.fn() },
            };
            return fn(tx);
        });

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );
        const res = await POST(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.error.code).toBe("CONFLICT");
    });

    /**
     * 情境：兩個請求都在過期邊界 — 第一個成功建單，第二個走 idempotency 回傳既有訂單。
     * 驗證：不會重複建單。
     */
    it("should not duplicate orders when two requests race at expiry boundary", async () => {
        const now = new Date();
        const expires = new Date(Date.now() + 1000); // 即將過期

        const mockOrder = {
            id: ORDER_ID,
            shopId: SHOP_ID,
            orderNo: "UCPRACE1",
            status: "PENDING",
            currency: "TWD",
            totalAmount: 500,
            shippingFee: 0,
            taxAmount: 0,
            paymentStatus: "PENDING",
            createdAt: now,
            updatedAt: now,
            items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 500 }],
        };

        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.product.findFirst.mockResolvedValue({ name: "Test Widget", sku: "TW001" });

        // 第一次 findFirst：PENDING session
        // 第二次 findFirst：COMPLETED session（已被第一請求 claim）
        mockDb.ucpCheckoutSession.findFirst
            .mockResolvedValueOnce({
                id: SESSION_ID,
                shopId: SHOP_ID,
                tenantId: TENANT_ID,
                status: "PENDING",
                orderId: null,
                expiresAt: expires,
                cartData: {
                    items: [{ offerId: PRODUCT_ID, quantity: 1, price: { amountMillis: 500000, currencyCode: "TWD" } }],
                    subtotal: { amountMillis: 500000, currencyCode: "TWD" },
                    total: { amountMillis: 500000, currencyCode: "TWD" },
                },
                shippingAddress: null,
                billingAddress: null,
                buyerEmail: null,
                createdAt: now,
                updatedAt: now,
            })
            .mockResolvedValueOnce({
                id: SESSION_ID,
                shopId: SHOP_ID,
                tenantId: TENANT_ID,
                status: "COMPLETED",
                orderId: ORDER_ID,
                expiresAt: expires,
                cartData: {
                    items: [{ offerId: PRODUCT_ID, quantity: 1, price: { amountMillis: 500000, currencyCode: "TWD" } }],
                    subtotal: { amountMillis: 500000, currencyCode: "TWD" },
                    total: { amountMillis: 500000, currencyCode: "TWD" },
                },
                shippingAddress: null,
                billingAddress: null,
                buyerEmail: null,
                createdAt: now,
                updatedAt: now,
            });

        // 第一請求 $transaction 成功建單
        mockDb.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                ucpCheckoutSession: {
                    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                },
                order: { create: jest.fn().mockResolvedValue(mockOrder) },
                product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
                address: { create: jest.fn().mockResolvedValue({}) },
            };
            return fn(tx);
        });

        // 第二請求走 idempotency（不進 $transaction）
        mockDb.order.findFirst.mockResolvedValue(mockOrder);

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );

        const req1 = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );
        const req2 = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );

        const res1 = await POST(req1, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });
        const res2 = await POST(req2, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });

        // 兩個都應成功回傳 201（同一訂單）
        expect(res1.status).toBe(201);
        expect(res2.status).toBe(201);

        const json1 = await res1.json();
        const json2 = await res2.json();
        expect(json1.id).toBe(json2.id);

        // $transaction 只被呼叫一次（第二請求走 idempotency 不建單）
        expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    });
});

// ============================================
// Stock Oversell Prevention
// ============================================

describe("UCP v1 — Stock Oversell Prevention", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.UCP_ENABLED;
        mockVerifyUcp.mockResolvedValue(AUTH_OK);
    });

    it("should return 422 when stock is insufficient during complete", async () => {
        const now = new Date();
        const expires = new Date(Date.now() + 3600_000);

        mockDb.shop.findFirst.mockResolvedValue(MOCK_SHOP);
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            id: SESSION_ID,
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            status: "PENDING",
            orderId: null,
            expiresAt: expires,
            cartData: {
                items: [{ offerId: PRODUCT_ID, quantity: 100, price: { amountMillis: 500000, currencyCode: "TWD" } }],
                subtotal: { amountMillis: 50000000, currencyCode: "TWD" },
                total: { amountMillis: 50000000, currencyCode: "TWD" },
            },
            shippingAddress: null,
            billingAddress: null,
            buyerEmail: null,
            createdAt: now,
            updatedAt: now,
        });

        mockDb.product.findFirst.mockResolvedValue({ name: "Test Widget", sku: "TW001" });

        // $transaction 內 updateMany for stock returns count: 0 (insufficient)
        mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                ucpCheckoutSession: {
                    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                },
                order: {
                    create: jest.fn().mockResolvedValue({
                        id: ORDER_ID, orderNo: "UCP123", status: "PENDING",
                        createdAt: now, updatedAt: now,
                        items: [{ productId: PRODUCT_ID, quantity: 100, unitPrice: 500 }],
                    }),
                },
                product: {
                    // stock < quantity → count: 0
                    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                },
                address: { create: jest.fn().mockResolvedValue({}) },
            };
            return fn(tx);
        });

        const { POST } = await import(
            "@/app/api/ucp/v1/checkout-sessions/[checkoutSessionId]/complete/route"
        );
        const req = makeRequest(
            `/api/ucp/v1/checkout-sessions/${SESSION_ID}/complete`,
            "POST",
            { paymentInfo: { paymentMethodType: "CARD" } }
        );
        const res = await POST(req, {
            params: Promise.resolve({ checkoutSessionId: SESSION_ID }),
        });
        expect(res.status).toBe(422);
        const json = await res.json();
        expect(json.error.code).toBe("INVALID_CART");
        expect(json.error.message).toContain("Insufficient stock");
    });
});
