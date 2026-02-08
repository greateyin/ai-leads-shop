/**
 * @jest-environment node
 */

/**
 * UCP v1 Handler-level Tests
 *
 * 測試 Phase 2 新增的功能：
 * - 運費計算引擎 (shipping handler)
 * - Checkout session 建立與運費重算 (checkout handler)
 * - Order lifecycle callbacks (callback handler)
 * - Google adapter 轉換正確性
 *
 * @module tests/api/ucp-v1-handlers
 */

// ============================================
// Mocks — 必須在 import 前宣告
// ============================================

jest.mock("next/headers", () => ({
    headers: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
    db: {
        shop: { findFirst: jest.fn() },
        product: { findMany: jest.fn(), updateMany: jest.fn() },
        ucpCheckoutSession: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
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

// ============================================
// Imports
// ============================================

import {
    toUcpMoney,
    fromUcpMoney,
    type CreateSessionInput,
} from "@/lib/ucp/handlers/checkout";
import {
    toGoogleCheckoutResponse,
    fromGoogleCreateCheckout,
} from "@/lib/ucp/adapters/google";
import type { UcpCheckoutSession, UcpMoney } from "@/lib/ucp/types";
import { db } from "@/lib/db";

/** 取得已 mock 的 db 物件，方便在測試中設定回傳值 */
const mockDb = db as unknown as {
    shop: { findFirst: jest.Mock };
    product: { findMany: jest.Mock; updateMany: jest.Mock };
    ucpCheckoutSession: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    order: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    paymentProvider: { findMany: jest.Mock };
    $transaction: jest.Mock;
};

// ============================================
// Test Fixtures
// ============================================

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SHOP_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PRODUCT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SESSION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const AUTH_CTX = {
    tenantId: TENANT_ID,
    shopId: SHOP_ID,
    platformId: "google",
    merchantId: SHOP_ID,
};

const MOCK_PRODUCT = {
    id: PRODUCT_ID,
    name: "Test Product",
    price: 500,
    stock: 10,
};

const MOCK_ADDRESS = {
    name: "Test User",
    addressLines: ["123 Test St"],
    locality: "Taipei",
    administrativeArea: "TW",
    postalCode: "100",
    regionCode: "TW",
};

// ============================================
// 1. 金額轉換 (toUcpMoney / fromUcpMoney)
// ============================================

describe("UCP Money Utilities", () => {
    it("should convert amount to UCP minor units", () => {
        const money = toUcpMoney(100.5, "twd");
        expect(money.value).toBe(10050);
        expect(money.currency).toBe("TWD");
    });

    it("should convert UCP minor units back to amount", () => {
        const amount = fromUcpMoney({ value: 10050, currency: "TWD" });
        expect(amount).toBe(100.5);
    });

    it("should handle zero", () => {
        expect(toUcpMoney(0, "TWD")).toEqual({ value: 0, currency: "TWD" });
        expect(fromUcpMoney({ value: 0, currency: "TWD" })).toBe(0);
    });

    it("should round to nearest integer for minor units", () => {
        const money = toUcpMoney(33.335, "TWD");
        expect(money.value).toBe(3334); // Math.round(3333.5)
    });
});

// ============================================
// 2. Google Adapter 轉換
// ============================================

describe("Google Adapter", () => {
    describe("fromGoogleCreateCheckout", () => {
        it("should convert Google v1 create request to internal format", () => {
            const googleReq = {
                merchantId: SHOP_ID,
                cart: {
                    items: [
                        {
                            offer: {
                                offerId: PRODUCT_ID,
                                price: { value: 50000, currency: "TWD" },
                            },
                            quantity: 2,
                        },
                    ],
                    currency: "TWD",
                },
                shippingAddress: MOCK_ADDRESS,
                buyerInfo: {
                    email: "test@example.com",
                    phone: "+886912345678",
                },
                callbackUrl: "https://google.com/callback",
            };

            const internal = fromGoogleCreateCheckout(googleReq);
            expect(internal.merchantId).toBe(SHOP_ID);
            expect(internal.cart.items).toHaveLength(1);
            expect(internal.cart.items[0].offerId).toBe(PRODUCT_ID);
            expect(internal.cart.items[0].quantity).toBe(2);
            expect(internal.buyerEmail).toBe("test@example.com");
            expect(internal.shippingAddress).toEqual(MOCK_ADDRESS);
        });
    });

    describe("toGoogleCheckoutResponse", () => {
        const mockSession: UcpCheckoutSession = {
            id: SESSION_ID,
            merchantId: SHOP_ID,
            status: "PENDING",
            cart: {
                items: [
                    {
                        offerId: PRODUCT_ID,
                        quantity: 1,
                        price: { value: 50000, currency: "TWD" },
                    },
                ],
                subtotal: { value: 50000, currency: "TWD" },
                shippingFee: { value: 6000, currency: "TWD" },
                total: { value: 56000, currency: "TWD" },
            },
            paymentHandlers: [
                {
                    id: "stripe",
                    type: "CARD",
                    name: "Credit Card",
                    supportedNetworks: ["VISA", "MASTERCARD"],
                },
            ],
            expiresAt: "2026-02-08T12:00:00Z",
            createdAt: "2026-02-08T11:30:00Z",
            updatedAt: "2026-02-08T11:30:00Z",
        };

        it("should convert internal session to Google v1 response", () => {
            const response = toGoogleCheckoutResponse(mockSession);
            expect(response.id).toBe(SESSION_ID);
            expect(response.state).toBe("CREATED");
            expect(response.cart.subtotal.value).toBe(50000);
            expect(response.cart.shippingCost?.value).toBe(6000);
            expect(response.cart.total.value).toBe(56000);
            expect(response.availablePaymentMethods).toHaveLength(1);
        });

        it("should include delivery options when provided", () => {
            const deliveryOptions = [
                {
                    ref: "home",
                    name: "宅配到府",
                    shippingType: "HOME" as const,
                    cost: { value: 10000, currency: "TWD" },
                    estimatedDays: 3,
                },
                {
                    ref: "cvs-711",
                    name: "7-11 取貨",
                    shippingType: "CVS_711" as const,
                    cost: { value: 6000, currency: "TWD" },
                    estimatedDays: 3,
                },
            ];

            const response = toGoogleCheckoutResponse(mockSession, deliveryOptions);
            expect(response.availableDeliveryOptions).toHaveLength(2);
            expect(response.availableDeliveryOptions![0].ref).toBe("home");
            expect(response.availableDeliveryOptions![0].cost.value).toBe(10000);
            expect(response.availableDeliveryOptions![1].ref).toBe("cvs-711");
        });

        it("should omit delivery options when not provided", () => {
            const response = toGoogleCheckoutResponse(mockSession);
            expect(response.availableDeliveryOptions).toBeUndefined();
        });

        it("should map session status to Google state correctly", () => {
            const pending = toGoogleCheckoutResponse({
                ...mockSession,
                status: "PENDING",
            });
            expect(pending.state).toBe("CREATED");

            const completed = toGoogleCheckoutResponse({
                ...mockSession,
                status: "COMPLETED",
            });
            expect(completed.state).toBe("CLOSED");

            const expired = toGoogleCheckoutResponse({
                ...mockSession,
                status: "EXPIRED",
            });
            expect(expired.state).toBe("EXPIRED");
        });
    });
});

// ============================================
// 3. Shipping Engine
// ============================================

describe("Shipping Engine", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return delivery options for a shop", async () => {
        mockDb.shop.findFirst.mockResolvedValue({
            config: {
                shipping: {
                    enabledTypes: ["HOME", "CVS_711"],
                    freeShippingThreshold: 1000,
                },
            },
            currency: "TWD",
        });

        const { getAvailableDeliveryOptions } = await import(
            "@/lib/ucp/handlers/shipping"
        );

        const options = await getAvailableDeliveryOptions(SHOP_ID, 500);
        expect(options).toHaveLength(2);
        expect(options[0].ref).toBe("home");
        expect(options[0].cost.currency).toBe("TWD");
        expect(options[1].ref).toBe("cvs-711");
    });

    it("should return 0 fee when total exceeds free shipping threshold", async () => {
        mockDb.shop.findFirst.mockResolvedValue({
            config: {
                shipping: {
                    enabledTypes: ["HOME"],
                    freeShippingThreshold: 1000,
                },
            },
            currency: "TWD",
        });

        const { getAvailableDeliveryOptions } = await import(
            "@/lib/ucp/handlers/shipping"
        );

        const options = await getAvailableDeliveryOptions(SHOP_ID, 1500);
        expect(options[0].cost.value).toBe(0);
    });

    it("should calculate specific delivery fee by ref", async () => {
        mockDb.shop.findFirst.mockResolvedValue({
            config: {
                shipping: {
                    enabledTypes: ["HOME", "CVS_711"],
                    freeShippingThreshold: 1000,
                },
            },
            currency: "TWD",
        });

        const { calculateDeliveryFee } = await import(
            "@/lib/ucp/handlers/shipping"
        );

        const fee = await calculateDeliveryFee(SHOP_ID, "home", 500);
        expect(fee).not.toBeNull();
        expect(fee!.currency).toBe("TWD");
        expect(fee!.value).toBeGreaterThan(0);
    });

    it("should return null for unknown delivery ref", async () => {
        mockDb.shop.findFirst.mockResolvedValue({
            config: {
                shipping: {
                    enabledTypes: ["HOME"],
                    freeShippingThreshold: 1000,
                },
            },
            currency: "TWD",
        });

        const { calculateDeliveryFee } = await import(
            "@/lib/ucp/handlers/shipping"
        );

        const fee = await calculateDeliveryFee(SHOP_ID, "unknown-method", 500);
        expect(fee).toBeNull();
    });

    it("should fallback to defaults when shop has no shipping config", async () => {
        mockDb.shop.findFirst.mockResolvedValue({
            config: null,
            currency: "TWD",
        });

        const { getAvailableDeliveryOptions } = await import(
            "@/lib/ucp/handlers/shipping"
        );

        const options = await getAvailableDeliveryOptions(SHOP_ID, 500);
        // Should fallback to HOME, CVS_711, CVS_FAMI
        expect(options.length).toBeGreaterThanOrEqual(3);
    });
});

// ============================================
// 4. Callback Payload & Status Mapping
// ============================================

describe("Order Lifecycle Callbacks", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should skip callback for non-UCP orders", async () => {
        mockDb.order.findFirst.mockResolvedValue({
            id: "order-1",
            orderNo: "ORD-001",
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            shop: { config: { ucp: { callbackUrl: "https://example.com/cb" } } },
        });
        // No UCP session found → not a UCP order
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue(null);

        const fetchSpy = jest.spyOn(global, "fetch");

        const { sendOrderCallback } = await import(
            "@/lib/ucp/handlers/callbacks"
        );
        await sendOrderCallback("order-1", "PAID");

        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it("should skip callback when no callbackUrl configured", async () => {
        mockDb.order.findFirst.mockResolvedValue({
            id: "order-1",
            orderNo: "ORD-001",
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            shop: { config: {} },
        });
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            platformId: "google",
        });

        const fetchSpy = jest.spyOn(global, "fetch");

        const { sendOrderCallback } = await import(
            "@/lib/ucp/handlers/callbacks"
        );
        await sendOrderCallback("order-1", "PAID");

        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it("should send callback with correct payload for UCP order", async () => {
        mockDb.order.findFirst.mockResolvedValue({
            id: "order-1",
            orderNo: "ORD-001",
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            shop: {
                config: {
                    ucp: {
                        callbackUrl: "https://google.example.com/callback",
                    },
                },
            },
        });
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            platformId: "google",
        });

        const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ ok: true }), { status: 200 })
        );

        const { sendOrderCallback } = await import(
            "@/lib/ucp/handlers/callbacks"
        );
        await sendOrderCallback("order-1", "SHIPPED", "PROCESSING", {
            trackingNumber: "TRACK123",
            carrier: "BLACK_CAT",
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, options] = fetchSpy.mock.calls[0];
        expect(url).toBe("https://google.example.com/callback");
        expect(options?.method).toBe("POST");

        const body = JSON.parse(options?.body as string);
        expect(body.eventType).toBe("ORDER_STATUS_CHANGED");
        expect(body.orderId).toBe("order-1");
        expect(body.newState).toBe("IN_PROGRESS");
        expect(body.details.trackingNumber).toBe("TRACK123");

        fetchSpy.mockRestore();
    });

    it("should include HMAC signature when callbackSecret is configured", async () => {
        mockDb.order.findFirst.mockResolvedValue({
            id: "order-1",
            orderNo: "ORD-001",
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            shop: {
                config: {
                    ucp: {
                        callbackUrl: "https://google.example.com/callback",
                        callbackSecret: "my-secret-key",
                    },
                },
            },
        });
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            platformId: "google",
        });

        const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ ok: true }), { status: 200 })
        );

        const { sendOrderCallback } = await import(
            "@/lib/ucp/handlers/callbacks"
        );
        await sendOrderCallback("order-1", "COMPLETED");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [, options] = fetchSpy.mock.calls[0];
        const headers = options?.headers as Record<string, string>;
        expect(headers["X-UCP-Signature"]).toBeDefined();
        expect(headers["X-UCP-Signature"].length).toBeGreaterThan(0);

        fetchSpy.mockRestore();
    });

    it("should map internal statuses to Google states correctly", async () => {
        mockDb.order.findFirst.mockResolvedValue({
            id: "order-1",
            orderNo: "ORD-001",
            shopId: SHOP_ID,
            tenantId: TENANT_ID,
            shop: {
                config: {
                    ucp: { callbackUrl: "https://example.com/cb" },
                },
            },
        });
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValue({
            platformId: "google",
        });

        const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
            new Response("{}", { status: 200 })
        );

        const { sendOrderCallback } = await import(
            "@/lib/ucp/handlers/callbacks"
        );

        // CANCELLED → CANCELLED
        await sendOrderCallback("order-1", "CANCELLED");
        let body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
        expect(body.newState).toBe("CANCELLED");

        fetchSpy.mockClear();

        // COMPLETED → COMPLETED
        await sendOrderCallback("order-1", "COMPLETED");
        body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
        expect(body.newState).toBe("COMPLETED");

        fetchSpy.mockRestore();
    });
});

// ============================================
// 5. Checkout Session Update with Shipping Recalc
// ============================================

describe("Checkout Session Update (shipping recalc)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should recalculate shipping when address changes", async () => {
        // DB session with existing cart data
        const cartData = {
            items: [
                { offerId: PRODUCT_ID, quantity: 2, price: { value: 50000, currency: "TWD" } },
            ],
            subtotal: { value: 100000, currency: "TWD" },
            shippingFee: { value: 6000, currency: "TWD" },
            total: { value: 106000, currency: "TWD" },
        };

        mockDb.ucpCheckoutSession.findFirst
            // First call: for update
            .mockResolvedValueOnce({
                id: SESSION_ID,
                tenantId: TENANT_ID,
                shopId: SHOP_ID,
                status: "PENDING",
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                cartData,
                shippingAddress: null,
                billingAddress: null,
                paymentHandlers: [],
            })
            // Second call: for getCheckoutSession after update
            .mockResolvedValueOnce({
                id: SESSION_ID,
                tenantId: TENANT_ID,
                shopId: SHOP_ID,
                platformId: "google",
                status: "PENDING",
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                cartData: {
                    ...cartData,
                    // After recalc, total may differ
                    total: { value: 110000, currency: "TWD" },
                    shippingFee: { value: 10000, currency: "TWD" },
                },
                shippingAddress: MOCK_ADDRESS,
                billingAddress: null,
                paymentHandlers: [],
                orderId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        // Shop config for shipping fee calculation
        mockDb.shop.findFirst.mockResolvedValue({
            config: {
                shipping: {
                    enabledTypes: ["HOME"],
                    freeShippingThreshold: 2000,
                },
            },
            currency: "TWD",
        });

        mockDb.ucpCheckoutSession.update.mockResolvedValue({});

        const { updateCheckoutSession } = await import(
            "@/lib/ucp/handlers/checkout"
        );

        const result = await updateCheckoutSession(SESSION_ID, TENANT_ID, {
            shippingAddress: MOCK_ADDRESS,
        });

        expect(result.success).toBe(true);

        // Verify that update was called with cartData containing recalculated values
        expect(mockDb.ucpCheckoutSession.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: SESSION_ID },
                data: expect.objectContaining({
                    shippingAddress: expect.any(Object),
                    cartData: expect.any(Object),
                }),
            })
        );
    });

    it("should return error for expired session", async () => {
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValueOnce({
            id: SESSION_ID,
            tenantId: TENANT_ID,
            shopId: SHOP_ID,
            status: "PENDING",
            expiresAt: new Date(Date.now() - 1000), // expired
            cartData: {},
            shippingAddress: null,
        });

        const { updateCheckoutSession } = await import(
            "@/lib/ucp/handlers/checkout"
        );

        const result = await updateCheckoutSession(SESSION_ID, TENANT_ID, {
            shippingAddress: MOCK_ADDRESS,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.code).toBe("SESSION_EXPIRED");
            expect(result.status).toBe(400);
        }
    });

    it("should return error for completed session", async () => {
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValueOnce({
            id: SESSION_ID,
            tenantId: TENANT_ID,
            shopId: SHOP_ID,
            status: "COMPLETED",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            cartData: {},
            shippingAddress: null,
        });

        const { updateCheckoutSession } = await import(
            "@/lib/ucp/handlers/checkout"
        );

        const result = await updateCheckoutSession(SESSION_ID, TENANT_ID, {
            shippingAddress: MOCK_ADDRESS,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.code).toBe("CONFLICT");
            expect(result.status).toBe(409);
        }
    });

    it("should return NOT_FOUND for nonexistent session", async () => {
        mockDb.ucpCheckoutSession.findFirst.mockResolvedValueOnce(null);

        const { updateCheckoutSession } = await import(
            "@/lib/ucp/handlers/checkout"
        );

        const result = await updateCheckoutSession(SESSION_ID, TENANT_ID, {
            shippingAddress: MOCK_ADDRESS,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.code).toBe("NOT_FOUND");
            expect(result.status).toBe(404);
        }
    });
});
