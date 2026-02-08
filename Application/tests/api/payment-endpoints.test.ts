/**
 * @jest-environment node
 */

/**
 * Payment Endpoints Security Tests
 *
 * 測試 pay / status 端點的安全策略：
 * - Tenant 邊界驗證（跨租戶不可存取）
 * - 訪客身份驗證（email 必填 + 必須匹配）
 * - 登入用戶驗證（session userId 必須匹配 order.userId）
 * - 已付款訂單不可重複付款
 *
 * @module tests/api/payment-endpoints
 */

// ============================================
// Mocks — 必須在 import 前宣告
// ============================================

/** 模擬 tenant 解析結果 */
const mockResolveTenantFromRequest = jest.fn();
jest.mock("@/lib/tenant/resolve-tenant", () => ({
  resolveTenantFromRequest: (...args: unknown[]) =>
    mockResolveTenantFromRequest(...args),
}));

/** 模擬 auth 結果 */
const mockAuthWithTenant = jest.fn();
jest.mock("@/lib/api/auth-helpers", () => ({
  authWithTenant: (...args: unknown[]) => mockAuthWithTenant(...args),
}));

/** 模擬 DB */
const mockDb = {
  order: { findFirst: jest.fn() },
  payment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  paymentProvider: { findFirst: jest.fn() },
};
jest.mock("@/lib/db", () => ({ db: mockDb }));

jest.mock("@/lib/id", () => ({
  generateId: jest.fn(() => "pay-00000000-0000-0000-0000-000000000001"),
}));

jest.mock("@/lib/payment", () => ({
  getDefaultProvider: jest.fn(),
  PaymentFormData: {},
}));

// ============================================
// Imports
// ============================================

import { NextRequest } from "next/server";

// ============================================
// Test Fixtures
// ============================================

const TENANT_A = {
  tenantId: "tenant-aaa-0001",
  subdomain: "shop-a",
  tenantName: "Shop A",
  shopId: "shop-aaa-0001",
  shopSlug: "shop-a",
  shopName: "Shop A",
  matchedBy: "localhost" as const,
};

const TENANT_B = {
  tenantId: "tenant-bbb-0002",
  subdomain: "shop-b",
  tenantName: "Shop B",
  shopId: "shop-bbb-0002",
  shopSlug: "shop-b",
  shopName: "Shop B",
  matchedBy: "subdomain" as const,
};

/** 訪客訂單 */
const GUEST_ORDER = {
  id: "order-guest-001",
  orderNo: "ORD-GUEST001",
  tenantId: TENANT_A.tenantId,
  totalAmount: 450,
  currency: "TWD",
  status: "PENDING",
  paymentStatus: "PENDING",
  userId: null,
  metadata: { guestEmail: "guest@example.com", guestName: "Guest" },
};

/** 登入用戶訂單 */
const USER_ORDER = {
  id: "order-user-001",
  orderNo: "ORD-USER001",
  tenantId: TENANT_A.tenantId,
  totalAmount: 2990,
  currency: "TWD",
  status: "PENDING",
  paymentStatus: "PENDING",
  userId: "user-aaa-0001",
  metadata: {},
};

/** 已付款訂單 */
const PAID_ORDER = {
  ...GUEST_ORDER,
  id: "order-paid-001",
  orderNo: "ORD-PAID001",
  paymentStatus: "PAID",
};

// ============================================
// Helpers
// ============================================

/**
 * 建立 NextRequest 物件
 */
function createRequest(
  url: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const { method = "GET", body } = options;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", host: "localhost:3000" },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

// ============================================
// Tests: POST /api/orders/[id]/pay
// ============================================

describe("POST /api/orders/[id]/pay", () => {
  let payHandler: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import(
      "@/app/api/orders/[id]/pay/route"
    );
    payHandler = mod.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveTenantFromRequest.mockResolvedValue(TENANT_A);
  });

  /**
   * 建立 pay handler context
   */
  function callPay(orderId: string, body: unknown) {
    const req = createRequest(`/api/orders/${orderId}/pay`, {
      method: "POST",
      body,
    });
    return payHandler(req, { params: Promise.resolve({ id: orderId }) });
  }

  // ── Tenant 邊界 ──

  it("應拒絕無法解析 tenant 的請求", async () => {
    mockResolveTenantFromRequest.mockResolvedValue(null);

    const res = await callPay(GUEST_ORDER.id, {
      email: "guest@example.com",
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("TENANT_NOT_FOUND");
  });

  it("跨租戶訂單應回傳 404（tenant B 查 tenant A 的訂單）", async () => {
    mockResolveTenantFromRequest.mockResolvedValue(TENANT_B);
    // findFirst with tenantId=TENANT_B won't match GUEST_ORDER.tenantId=TENANT_A
    mockDb.order.findFirst.mockResolvedValue(null);

    const res = await callPay(GUEST_ORDER.id, {
      email: "guest@example.com",
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // ── 訪客身份驗證 ──

  it("訪客訂單缺少 email 應回傳 400", async () => {
    mockDb.order.findFirst.mockResolvedValue(GUEST_ORDER);

    const res = await callPay(GUEST_ORDER.id, {
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("EMAIL_REQUIRED");
  });

  it("訪客訂單 email 不匹配應回傳 403", async () => {
    mockDb.order.findFirst.mockResolvedValue(GUEST_ORDER);

    const res = await callPay(GUEST_ORDER.id, {
      email: "wrong@example.com",
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  // ── 登入用戶驗證 ──

  it("登入用戶 userId 不匹配應回傳 403", async () => {
    mockDb.order.findFirst.mockResolvedValue(USER_ORDER);
    mockAuthWithTenant.mockResolvedValue({
      session: { user: { id: "other-user-999", tenantId: TENANT_A.tenantId } },
      tenantId: TENANT_A.tenantId,
    });

    const res = await callPay(USER_ORDER.id, {
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("未登入使用者嘗試付款登入用戶訂單應回傳 403", async () => {
    mockDb.order.findFirst.mockResolvedValue(USER_ORDER);
    mockAuthWithTenant.mockResolvedValue({ session: null, tenantId: "" });

    const res = await callPay(USER_ORDER.id, {
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  // ── 重複付款 ──

  it("已付款訂單應回傳 409", async () => {
    mockDb.order.findFirst.mockResolvedValue(PAID_ORDER);

    const res = await callPay(PAID_ORDER.id, {
      email: "guest@example.com",
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("ALREADY_PAID");
  });

  // ── 無 userId 也無 guestEmail ──

  it("無法驗證身份的訂單應回傳 403", async () => {
    const orphanOrder = { ...USER_ORDER, userId: null, metadata: {} };
    mockDb.order.findFirst.mockResolvedValue(orphanOrder);

    const res = await callPay(orphanOrder.id, {
      returnUrl: "http://localhost:3000/result",
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });
});

// ============================================
// Tests: GET /api/orders/[id]/status
// ============================================

describe("GET /api/orders/[id]/status", () => {
  let statusHandler: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import(
      "@/app/api/orders/[id]/status/route"
    );
    statusHandler = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveTenantFromRequest.mockResolvedValue(TENANT_A);
  });

  /**
   * 建立 status handler context
   */
  function callStatus(orderId: string, queryEmail?: string) {
    const url = queryEmail
      ? `/api/orders/${orderId}/status?email=${encodeURIComponent(queryEmail)}`
      : `/api/orders/${orderId}/status`;
    const req = createRequest(url);
    return statusHandler(req, { params: Promise.resolve({ id: orderId }) });
  }

  // ── Tenant 邊界 ──

  it("應拒絕無法解析 tenant 的請求", async () => {
    mockResolveTenantFromRequest.mockResolvedValue(null);

    const res = await callStatus(GUEST_ORDER.id, "guest@example.com");
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("TENANT_NOT_FOUND");
  });

  it("跨租戶訂單應回傳 404", async () => {
    mockResolveTenantFromRequest.mockResolvedValue(TENANT_B);
    mockDb.order.findFirst.mockResolvedValue(null);

    const res = await callStatus(GUEST_ORDER.id, "guest@example.com");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // ── 訪客身份驗證 ──

  it("訪客訂單缺少 email 應回傳 403", async () => {
    mockDb.order.findFirst.mockResolvedValue(GUEST_ORDER);

    const res = await callStatus(GUEST_ORDER.id);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("訪客訂單 email 不匹配應回傳 403", async () => {
    mockDb.order.findFirst.mockResolvedValue(GUEST_ORDER);

    const res = await callStatus(GUEST_ORDER.id, "wrong@example.com");
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("訪客訂單 email 匹配應回傳成功", async () => {
    mockDb.order.findFirst.mockResolvedValue(GUEST_ORDER);

    const res = await callStatus(GUEST_ORDER.id, "guest@example.com");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.orderNo).toBe(GUEST_ORDER.orderNo);
    expect(json.data.paymentStatus).toBe("PENDING");
  });

  it("訪客 email 驗證應不區分大小寫", async () => {
    mockDb.order.findFirst.mockResolvedValue(GUEST_ORDER);

    const res = await callStatus(GUEST_ORDER.id, "Guest@Example.COM");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  // ── 登入用戶驗證 ──

  it("登入用戶 userId 不匹配應回傳 403", async () => {
    mockDb.order.findFirst.mockResolvedValue(USER_ORDER);
    mockAuthWithTenant.mockResolvedValue({
      session: { user: { id: "other-user-999", tenantId: TENANT_A.tenantId } },
      tenantId: TENANT_A.tenantId,
    });

    const res = await callStatus(USER_ORDER.id);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("登入用戶 userId 匹配應回傳成功", async () => {
    mockDb.order.findFirst.mockResolvedValue(USER_ORDER);
    mockAuthWithTenant.mockResolvedValue({
      session: {
        user: { id: USER_ORDER.userId, tenantId: TENANT_A.tenantId },
      },
      tenantId: TENANT_A.tenantId,
    });

    const res = await callStatus(USER_ORDER.id);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.orderNo).toBe(USER_ORDER.orderNo);
  });

  // ── 無法驗證身份 ──

  it("無 userId 也無 guestEmail 的訂單應回傳 403", async () => {
    const orphanOrder = { ...USER_ORDER, userId: null, metadata: {} };
    mockDb.order.findFirst.mockResolvedValue(orphanOrder);

    const res = await callStatus(orphanOrder.id);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });
});
