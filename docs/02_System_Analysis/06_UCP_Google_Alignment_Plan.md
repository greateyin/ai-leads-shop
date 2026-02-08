# UCP 對齊 Google Merchant Shopping APIs — 最小改造清單

> **狀態**: Phase 1–3 已完成 ✅  
> **日期**: 2026-02-08  
> **嚴重度**: 介面契約層級不相容，非小修即可上線

## 結論

現有 UCP 實作基於 `ucp.dev` 規範風格，**與 Google Merchant Center Shopping APIs v1 在路由路徑、Profile 結構、Checkout/Order payload、認證宣告等方面不相容**。以下列出差異並給出最小改造方案。

---

## 1. 路由路徑對齊

### 1.1 路由 Mapping

| # | Google 官方 (Shopping APIs v1)                              | 現有路徑                                      | 差異 | 改造 |
|---|-------------------------------------------------------------|-----------------------------------------------|------|------|
| R1 | `GET  /.well-known/ucp/profile.json`                       | `GET /api/ucp/profile?merchantId=xxx`          | 路徑 + 取參方式 | 新增 `.well-known` route |
| R2 | `POST /checkout-sessions`                                   | `POST /api/ucp/checkout-sessions`              | 前綴 `/api/ucp` | 加 v1 路由別名 |
| R3 | `GET  /checkout-sessions/{checkoutSessionId}`               | `GET /api/ucp/checkout-sessions?sessionId=xxx` | path param → query | 新增 dynamic route |
| R4 | `PUT  /checkout-sessions/{checkoutSessionId}`               | ❌ 不存在                                       | 缺失 | 新增（更新 session） |
| R5 | `POST /checkout-sessions/{checkoutSessionId}/complete`      | `POST /api/ucp/orders`（含 checkoutSessionId） | 路徑 + 語義 | 新增 complete subroute |
| R6 | `GET  /orders/{orderId}`                                    | `GET /api/ucp/orders?orderId=xxx`              | path param → query | 新增 dynamic route |
| R7 | `POST /products/availability`                               | `POST /api/ucp/availability`                   | 路徑 | 新增別名 route |

### 1.2 改造策略：雙軌路由

```
app/api/ucp/
├── v1/                                    ← Google 相容路由（新增）
│   ├── checkout-sessions/
│   │   ├── route.ts                       → R2: POST (create)
│   │   └── [checkoutSessionId]/
│   │       ├── route.ts                   → R3: GET, R4: PUT
│   │       └── complete/
│   │           └── route.ts               → R5: POST (complete → create order)
│   ├── orders/
│   │   └── [orderId]/
│   │       └── route.ts                   → R6: GET
│   └── products/
│       └── availability/
│           └── route.ts                   → R7: POST
├── checkout-sessions/route.ts             ← 舊路由保留（deprecated）
├── orders/route.ts                        ← 舊路由保留（deprecated）
├── availability/route.ts                  ← 舊路由保留（deprecated）
├── products/route.ts                      ← 保留（非 Google 契約必要）
└── profile/route.ts                       ← 保留但 schema 需改
```

```
app/.well-known/ucp/
└── profile.json/
    └── route.ts                           → R1: 靜態 profile 端點
```

### 1.3 向後相容

- 舊 `/api/ucp/*` 路由**保留但標記 `@deprecated`**，回應加 `Deprecation` header
- 新 v1 路由與舊路由共享核心邏輯（抽至 `lib/ucp/handlers/`）
- 遷移期間兩套路由並行，待確認 Google 端對接成功後再移除舊路由

---

## 2. Profile 結構對齊

### 2.1 現有 vs. Google 規範

**現有** (`/api/ucp/profile`):
```json
{
  "version": "2026-01-11",
  "profile": {
    "id": "shop-id",
    "name": "Shop Name",
    "homepage": "https://...",
    "services": {
      "shopping": {
        "version": "1.0",
        "rest": {
          "schema": "https://ucp.dev/services/shopping/rest.openapi.json",
          "endpoint": "https://.../api/ucp"
        }
      }
    },
    "capabilities": ["dev.ucp.shopping.checkout", ...]
  }
}
```

**Google 規範** (`/.well-known/ucp/profile.json`):
```json
{
  "provider": "AIsell",
  "title": "Shop Name",
  "urlPattern": "https://{domain}/api/ucp/v1",
  "checkoutConfig": {
    "type": "NATIVE",
    "supportedPaymentMethods": ["CARD", "WALLET"],
    "supportedShippingCountries": ["TW"]
  },
  "orderManagement": {
    "callbackUrl": "https://{domain}/api/ucp/v1/callbacks/orders",
    "supportedActions": ["CANCEL", "REFUND"]
  },
  "authentication": {
    "type": "API_KEY",
    "apiRequestHeaders": {
      "X-UCP-Api-Key": "{api_key}"
    }
  }
}
```

### 2.2 改造項目

| 欄位 | 動作 |
|------|------|
| `provider` | 新增，值為 `"AIsell"` 或 tenant name |
| `title` | 對應現有 `profile.name` |
| `urlPattern` | 改為 v1 endpoint pattern |
| `checkoutConfig.type` | 新增 `"NATIVE"` |
| `checkoutConfig.supportedPaymentMethods` | 從 `paymentHandlers` 映射 |
| `checkoutConfig.supportedShippingCountries` | 從 shop locale/config 映射 |
| `orderManagement.callbackUrl` | **新增**（見第 6 節 callback） |
| `orderManagement.supportedActions` | 新增，根據商家能力回傳 |
| `authentication.type` | 新增 `"API_KEY"` |
| `authentication.apiRequestHeaders` | **新增** — 宣告 `X-UCP-Api-Key`（修復認證缺口） |
| 舊 `version/services/capabilities` | 僅在舊 `/api/ucp/profile` 保留 |

### 2.3 新增類型

```typescript
/** Google Merchant UCP Profile (Shopping APIs v1) */
export interface GoogleUcpProfile {
  provider: string;
  title: string;
  urlPattern: string;
  checkoutConfig: {
    type: "NATIVE" | "REDIRECT";
    supportedPaymentMethods: string[];
    supportedShippingCountries: string[];
    checkoutUrl?: string;
  };
  orderManagement: {
    callbackUrl: string;
    supportedActions: ("CANCEL" | "REFUND" | "RETURN")[];
  };
  authentication: {
    type: "API_KEY" | "OAUTH2" | "HMAC";
    apiRequestHeaders?: Record<string, string>;
    oauth2Config?: Record<string, string>;
  };
}
```

---

## 3. Checkout Session 契約對齊

### 3.1 Create (POST)

| Google 欄位 | 現有對應 | 動作 |
|------------|---------|------|
| `checkoutOptions.requestedProcessingType` | ❌ | 新增（`"CHECKOUT_AND_PAY"` / `"CHECKOUT_ONLY"`） |
| `cart.items[].offer.offerId` | `cart.items[].offerId` | 結構層級不同，需包裝 |
| `cart.items[].offer.price` | `cart.items[].price` | 同上 |
| `paymentMethods` | `paymentHandlers`（response 中） | 欄位名重新映射 |
| `selectedDeliveryOptionRef` | ❌ | 新增（運送選項引用） |
| `merchantId` | ✅ 已有 | 保留 |
| `buyerInfo.email` | `buyerEmail` | 重新映射 |

### 3.2 Update (PUT) — 新增

Google 要求 `PUT /checkout-sessions/{id}` 用於：
- 更新運送地址（觸發運費重算）
- 更新選擇的運送方式
- 更新付款方式

現有完全缺失。需新增 handler。

### 3.3 Complete (POST .../complete) — 重構

| Google 欄位 | 現有對應 | 動作 |
|------------|---------|------|
| `paymentInfo.paymentProcessorToken` | `paymentToken` | 重新映射 |
| `paymentInfo.paymentMethodType` | `paymentHandlerId` | 重新映射 |
| 回傳 `order` 物件 | ✅ 已有（`UcpOrder`） | 結構微調 |

### 3.4 改造策略

- v1 handler 接收 Google schema，內部轉換為現有資料結構
- 建立 `lib/ucp/adapters/google.ts` 做 request/response 轉換
- 核心邏輯（庫存驗證、Session 建立、訂單建立）不動

---

## 4. Order 契約對齊

### 4.1 GET /orders/{orderId}

| Google 欄位 | 現有對應 | 動作 |
|------------|---------|------|
| path param `orderId` | query param `orderId` | 改為 dynamic route |
| `order.state` | `status` mapping | 值域對齊（Google 用 `CREATED`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`） |
| `order.lineItems` | `cart.items` | 結構重新映射 |
| `order.paymentSummary` | `payment` | 結構差異 |
| `order.deliveryDetails` | `shippingAddress` + 缺失 tracking | 補充 tracking 欄位 |

### 4.2 改造策略

- 新增 `app/api/ucp/v1/orders/[orderId]/route.ts`
- 內部查詢邏輯複用現有 `db.order.findFirst`
- Response 經 adapter 轉換為 Google schema

---

## 5. 認證宣告修復

### 5.1 問題

後端 `middleware.ts` 強制要求 `X-UCP-Api-Key` header，但 profile 回應中沒有 `authentication.apiRequestHeaders` 宣告。Google 平台無法得知需要帶什麼 header。

### 5.2 修復

1. Profile 加入 `authentication` 區塊（見第 2 節）
2. Middleware 中的認證邏輯保持不變
3. 若未來需支援 HMAC/OAuth2，在 `authentication.type` 擴展

---

## 6. Order Lifecycle Callback（新增）

### 6.1 問題

Google 指南要求商家在訂單狀態變更時主動通知平台（callback），但現有實作無任何對外 callback 發送邏輯。

### 6.2 改造

```
lib/ucp/callbacks/
├── order-callback.ts      ← 發送訂單狀態變更通知
└── types.ts               ← Callback payload 類型
```

```typescript
/** 在訂單狀態變更時呼叫 */
async function notifyOrderUpdate(
  orderId: string,
  newState: string,
  callbackUrl: string
): Promise<void> {
  // POST to platform's callback URL
  // Include order state, tracking info, etc.
}
```

**觸發時機**：
- 訂單確認（CONFIRMED）
- 出貨（SHIPPED + tracking number）
- 送達（DELIVERED）
- 取消（CANCELLED）
- 退款（REFUNDED）

**儲存 callbackUrl**：在 `UcpCheckoutSession` 建立時從 platform request 取得並存入。

---

## 7. 改造優先順序

### Phase 1 — 最小可對接 ✅ 完成

| # | 任務 | 影響範圍 | 狀態 |
|---|------|---------|------|
| 1 | 新增 `/.well-known/ucp/profile.json` route（Google profile schema） | 新檔案 | ✅ |
| 2 | 新增 `GoogleUcpProfile` 型別 + adapter | `lib/ucp/types.ts` | ✅ |
| 3 | 新增 v1 checkout-sessions dynamic routes（POST, GET, PUT, complete） | 4 個新 route 檔 | ✅ |
| 4 | 新增 v1 orders dynamic route（GET） | 1 個新 route 檔 | ✅ |
| 5 | 新增 v1 products/availability route | 1 個新 route 檔 | ✅ |
| 6 | Profile 加入 `authentication.apiRequestHeaders` 宣告 | profile route | ✅ |
| 7 | 建立 `lib/ucp/adapters/google.ts` 做 request/response 轉換 | 新檔案 | ✅ |
| 7b | 舊路由加 Deprecation / Sunset / Link headers | 舊 route 檔 | ✅ |

### Phase 2 — 完整生命週期 ✅ 完成

| # | 任務 | 影響範圍 | 狀態 |
|---|------|---------|------|
| 8 | middleware 支援 v1 路由（merchantId from body/API-key reverse lookup） | `lib/ucp/middleware.ts` | ✅ |
| 9 | 運費計算引擎 + PUT session 動態運費重算 | `lib/ucp/handlers/shipping.ts` + checkout handler | ✅ |
| 10 | Order lifecycle callback 發送邏輯 + inbound action route | `lib/ucp/handlers/callbacks.ts` + `v1/callbacks/orders/route.ts` | ✅ |
| 11 | Google adapter 補上 `availableDeliveryOptions` | `lib/ucp/adapters/google.ts` | ✅ |

### Phase 3 — 測試 ✅ 完成

| # | 任務 | 影響範圍 | 狀態 |
|---|------|---------|------|
| 12 | UCP v1 handler-level 單元測試（23 tests） | `tests/api/ucp-v1-handlers.test.ts` | ✅ |
| 13 | Google Merchant Center sandbox 實際對接測試 | 外部整合 | ⏳ 待執行 |

### Phase 4 — 保護層 + 可觀測性 ✅ 完成

| # | 任務 | 影響範圍 | 狀態 |
|---|------|---------|------|
| 14 | UCP Kill Switch（`UCP_ENABLED=false` → 503） | 全部 12 個 UCP route + `.well-known` | ✅ |
| 15 | Google 官方 profile 路徑 `/.well-known/merchant-api/ucp/profile.json` | 新 route + 共用 handler | ✅ |
| 16 | Idempotency：`orderId @unique` + complete 重送回傳既有訂單 | Prisma schema + orders handler | ✅ |
| 17 | E2E + Security 測試（18 tests: kill switch, auth, cross-tenant, happy path, replay） | `tests/api/ucp-v1-e2e.test.ts` | ✅ |
| 18 | CI 整合：`npm run test:ucp` / `test:ucp:unit` / `test:ucp:e2e` | `package.json` | ✅ |
| 19 | 可觀測性：metrics module + `/api/ucp/v1/metrics` endpoint | `lib/ucp/metrics.ts` + route | ✅ |

---

## 8. 新目錄結構總覽

```
app/
├── .well-known/
│   ├── merchant-api/ucp/profile.json/
│   │   └── route.ts                      ← Google 官方 profile 路徑
│   └── ucp/profile.json/
│       └── route.ts                      ← 相容別名
├── api/ucp/
│   ├── v1/                               ← Google 相容路由（全部含 kill switch guard）
│   │   ├── checkout-sessions/
│   │   │   ├── route.ts                  ← POST create（含 metrics 計量）
│   │   │   └── [checkoutSessionId]/
│   │   │       ├── route.ts              ← GET read, PUT update (含運費重算)
│   │   │       └── complete/
│   │   │           └── route.ts          ← POST complete (idempotent)
│   │   ├── orders/
│   │   │   └── [orderId]/
│   │   │       └── route.ts              ← GET read
│   │   ├── callbacks/
│   │   │   └── orders/
│   │   │       └── route.ts              ← POST inbound order actions
│   │   ├── metrics/
│   │   │   └── route.ts                  ← GET 可觀測性指標（內部用）
│   │   └── products/
│   │       └── availability/
│   │           └── route.ts              ← POST check
│   ├── checkout-sessions/route.ts        ← 舊路由 (deprecated, Sunset: 2026-05-31)
│   ├── orders/route.ts                   ← 舊路由 (deprecated)
│   ├── availability/route.ts             ← 舊路由 (deprecated)
│   ├── products/route.ts                 ← 保留
│   └── profile/route.ts                  ← 舊路由 (deprecated)
lib/ucp/
├── adapters/
│   └── google.ts                         ← 雙向 schema 轉換 + delivery options
├── handlers/
│   ├── checkout.ts                       ← 共用 session 邏輯 (含運費重算)
│   ├── orders.ts                         ← 共用 order 邏輯 + callback 觸發 + idempotent complete
│   ├── profile.ts                        ← 共用 profile 邏輯 (兩個 .well-known 路徑共用)
│   ├── shipping.ts                       ← 運費計算引擎 (整合 lib/logistics)
│   └── callbacks.ts                      ← Callback 發送 + HMAC 簽章 + 重試
├── guard.ts                              ← Kill Switch (UCP_ENABLED env)
├── metrics.ts                            ← 請求計量 + withUcpMetrics wrapper
├── deprecation.ts                        ← Deprecation/Sunset/Link header 工具
├── middleware.ts                          ← 擴充支援 v1 merchantId 解析
└── types.ts                              ← 擴充 Google v1 型別
tests/api/
├── ucp-v1-handlers.test.ts               ← 23 單元測試
└── ucp-v1-e2e.test.ts                    ← 18 測試 (kill switch + security + E2E + idempotency)
```

---

## 9. 風險與注意事項

| 風險 | 緩解 |
|------|------|
| Google OpenAPI spec 版本可能更新 | adapter 層隔離，核心邏輯不直接耦合 Google schema |
| 舊路由有外部使用者 | deprecation header + 雙軌並行至少 3 個月 |
| Callback URL 需 HTTPS + 穩定 | 加入重試邏輯 + dead letter queue |
| PUT checkout-sessions 需運費動態計算 | Phase 2 實作，Phase 1 可先回傳固定運費 |
| `merchantId` 在 Google 側可能是 Merchant Center ID 而非 shopId | adapter 層做 ID 映射 |

---

## 10. 不改的部分

- **核心業務邏輯**：庫存驗證、Session 建立、訂單建立、付款處理 — 不動
- **Prisma schema**：`UcpCheckoutSession` 表結構足夠，`callbackUrl` 存在 `shop.config.ucp` JSON 中
- **認證機制**：`X-UCP-Api-Key` + SHA256 hash 驗證，已擴充支援 v1 merchantId 解析策略
- **Tenant 隔離**：已完善，v1 路由繼續使用 `verifyUcpRequest`
