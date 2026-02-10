# AIsell 程式規格書

## 目錄

1. [文件目的與範圍](#文件目的與範圍)
2. [設計原則與開發環境](#設計原則與開發環境)
3. [系統結構與目錄詳細](#系統結構與目錄詳細)
4. [模組與元件規格](#模組與元件規格)
   1. [認證與使用者模組](#認證與使用者模組)
   2. [店家與租戶管理模組](#店家與租戶管理模組)
   3. [商品管理模組](#商品管理模組)
   4. [訂單與購物車模組](#訂單與購物車模組)
   5. [金流整合模組](#金流整合模組)
   6. [物流模組](#物流模組)
   7. [內容與部落格模組](#內容與部落格模組)
   8. [AI 服務模組](#ai-服務模組)
   9. [分析與報表模組](#分析與報表模組)
   10. [公用函式與工具](#公用函式與工具)
5. [資料傳輸物件 (DTO) 與型別定義](#資料傳輸物件-dto-與型別定義)
6. [錯誤處理與返回格式](#錯誤處理與返回格式)
7. [背景作業與排程任務](#背景作業與排程任務)
8. [日誌、監控與追蹤](#日誌監控與追蹤)
9. [安全設計重點](#安全設計重點)

## 文件目的與範圍

本程式規格書是建立在系統架構書與資料庫設計之上，提供開發團隊實作程式時的具體指南。內容涵蓋模組劃分、接口規格、函式簽名、資料傳輸格式、錯誤處理及安全考量。此文檔將協助程式設計師理解每個模組的行為，並確保各模組協同運作。

## 設計原則與開發環境

* **語言與框架**：前端採用 Next.js 16 (App Router) 搭配 TypeScript；後端路由使用 Next.js Route Handlers 作為 BFF 層，部分服務可採 Node.js + Express/Nest.js 微服務。金流與物流 API 封裝於 `lib/payment` 和 `lib/logistics`。
* **程式風格**：使用 ESLint、Prettier 統一程式碼格式；採用 Functional Programming 與單一責任原則，讓函式易於測試與重用。
* **型別安全**：全面使用 TypeScript 定義 DTO 及資料庫模型，避免型別不一致。
* **依賴管理**：使用 pnpm 管理套件；版本號採語義化版本控制，並透過 Renovate 自動更新依賴。
* **測試框架**：Jest + Testing Library 測試 React/Next 元件，supertest 用於 API 測試，Playwright 用於端到端測試。

## 系統結構與目錄詳細

專案結構遵循 Next.js App Router 的 conventions，並且根據業務功能劃分目錄。以下提供更詳細說明：

```
app/
  layout.tsx             # 根 Layout；初始化 SessionProvider、ThemeProvider 等
  page.tsx               # 首頁（宣傳頁）；載入公共組件與行銷內容
  (auth)/                # 認證相關頁面（括號表示路由群組）
    login/page.tsx       # 登入介面；調用 signIn() 方法
    register/page.tsx    # 註冊介面；調用 signUp() API
    callback/route.ts    # OAuth 回呼；使用 auth.js 處理
  dashboard/             # 登入後後台區域
    layout.tsx           # 儀表板 Layout；包含側邊選單、BreadCrumbs
    page.tsx             # 儀表板首頁；顯示關鍵指標
    products/            # 商品管理
      page.tsx           # 列表/篩選/搜尋
      new/page.tsx       # 新建商品表單；呼叫 AI 服務產生描述
      [id]/edit/page.tsx # 編輯商品，動態路由
    orders/              # 訂單管理
      page.tsx           # 訂單列表
      [id]/page.tsx      # 訂單詳情
    payments/
      page.tsx           # 金流設定與交易紀錄；表格列出 payment_providers 與 payments
    logistics/
      page.tsx           # 物流設定與寄件單管理
    blog/
      page.tsx           # 文章列表
      new/page.tsx       # 新建文章（MDX 編輯器）
      [slug]/edit/page.tsx
    ai/
      interactions/page.tsx # AI 使用歷史查詢
    analytics/
      page.tsx           # 儀表板報表
    settings/
      page.tsx           # 商店與帳號設定
    api/                 # Route Handlers 作為 BFF
      auth/[...]/route.ts       # 認證相關 endpoints
      products/route.ts         # 商品 CRUD
      orders/route.ts           # 訂單 API
      payments/route.ts         # 金流 API
      logistics/route.ts        # 物流 API
      blog/route.ts             # 文章 API
      ai/route.ts               # AI 服務 proxy
      ucp/route.ts              # Universal Commerce Protocol (Agentic Commerce)
      files/route.ts            # 檔案上傳與管理
      cron/route.ts             # 排程任務
lib/
  auth.ts                # Auth.js 設定 providers、callbacks
  db.ts                  # 資料庫初始化、RLS middleware
  payment/
    ecpay.ts             # 綠界 SDK 封裝 (createOrder, verifyNotify)
    newebpay.ts          # 藍新 SDK 封裝
    stripe.ts            # Stripe SDK 封裝
  logistics/
    ecpay.ts             # 綠界物流包裝 (createShippingOrder, query)
    newebpay.ts          # 藍新物流
  ai.ts                  # AI 服務呼叫 (LLM proxy)
  utils.ts               # 共用工具 (校驗、格式化)
components/
  ui/                    # shadcn/ui 元件封裝
  forms/                 # 表單相關 HOC
  modals/                # Modal 彈窗
  charts/                # Chart.js 封裝
types/                   # 全域型別與 DTO 定義
middleware.ts            # 全域 Middleware (RLS 檢查、權限驗證)
```

## 模組與元件規格

以下各節詳細說明主要模組的功能、核心函式或 API 端點、輸入/輸出格式以及相依關係。對於微服務形式實作，仍可沿用相同接口，但需透過 gRPC/REST 進行調用。

### 認證與使用者模組

| 功能 | 路由/函式 | 輸入 | 輸出 | 錯誤與例外 |
|---|---|---|---|---|
| **註冊新用戶** | `POST /api/auth/register` | `email`, `password`, `shopName` | 返回 `{userId, tenantId, shopId}`，並發送驗證信 | 400 – 欄位格式錯誤；409 – Email 已存在；500 – 發信失敗 |
| **登入** | `POST /api/auth/login` | `email`, `password` | 返回 session cookie 或 JWT | 401 – 認證失敗；429 – 太多失敗嘗試 |
| **第三方登入** | `GET /api/auth/signIn?provider=google` | OAuth provider 名稱 | 重導至第三方授權頁；callback 由 `api/auth/[...]/route.ts` 處理 | 500 – provider 設定錯誤 |
| **取得 Session** | `auth()` (伺服端函式) | 無 | 返回 `{userId, tenantId, role}` 或 `null` | 無效或過期會返回 `null` |
| **忘記密碼** | `POST /api/auth/forgot` | `email` | 發送重設信；返回 204 | 404 – 無此帳號；500 – 寄件失敗 |
| **重設密碼** | `POST /api/auth/reset` | `token`, `newPassword` | 返回 204 | 400 – token 無效或過期 |
| **權限中介** | `withAuth(handler, roles)` | `handler`: Next.js Route Handler | 若 session 不存在或角色不符則返回 403 | 403 – 未授權 |
| **切換租戶** | `POST /api/tenants/switch` | `tenantId` | 返回 204；更新當前 Session 的 `activeTenantId`；使用 `user_tenants` 表檢查用戶是否屬於該租戶 | 403 – 權限不足；404 – 租戶不存在；400 – 參數錯誤 |

核心邏輯：利用 Auth.js v5 `auth()` 函式取得當前 session 於 server components；在 Route Handler 設定 callbacks 決定新註冊帳號預設角色；使用 Prisma/Drizzle ORM 在 `users` 表建立記錄。中介函式 `withAuth` 用來包裝 API，使未授權者無法存取保護路由。

**`withAuth` 遷移指引**：所有需要認證的 API Route Handler 應逐步遷移至 `withAuth` / `withAdminAuth` / `withStaffAuth` 包裝模式，取代手動 `auth()` + 條件判斷。已完成遷移的路由包含：`products`（GET: withAuth, POST: withStaffAuth）、`orders`（GET: withStaffAuth）、`payments/[id]/refund`（POST: withAdminAuth）。例外：支援訪客操作的端點（如 `POST /api/orders` 訪客結帳）不使用 withAuth。

### 店家與租戶管理模組

| 功能 | 路由/函式 | 描述 | 錯誤處理 |
|---|---|---|---|
| 建立租戶/店家 | `POST /api/tenants` | 檢查目前使用者是否有 `admin` 或 `owner` 角色；建立 `tenants` 與 `shops` 記錄；設定預設方案與子域名 | 400 – 缺少必要欄位；403 – 權限不足 |
| 更新商店設定 | `PUT /api/shops/{id}` | 接收 JSON，其中包含 `name`, `logoUrl`, `currency`, `timezone` 等；更新 `shops` 表和 `payment_providers` | 404 – 店家不存在；403 – 權限不足 |
| 方案升級/降級 | `PATCH /api/tenants/{id}/plan` | 更新 `plan` 欄位；若降級，需驗證功能限制 (例如商品數上限) | 403 – 權限不足；422 – 超出降級限制 |
| 邀請員工/角色管理 | `POST /api/users/invite` | 傳入被邀請者 email、角色；系統發送邀請信並建立暫存帳號 | 400 – 格式錯誤；409 – 已存在；403 – 權限不足 |

| **查詢計費與使用量** | `GET /api/tenants/{id}/billing`, `GET /api/tenants/{id}/invoices`, `GET /api/tenants/{id}/usage` | 取得租戶方案、下一次帳單日、歷史發票以及指定期間內的使用量統計。須驗證呼叫者具有 `owner` 或 `admin` 權限。 | 403 – 權限不足；404 – 租戶不存在 |
| **變更方案與付款方式** | `PATCH /api/tenants/{id}/billing` | 傳入 `plan`, `billingMethod` 等欄位更新租戶計費帳戶。系統在變更時檢查功能限制與合約條款並更新 `tenant_billing_accounts`。 | 403 – 權限不足；422 – 超出降級限制 |
| **追蹤設定** | `GET /api/tenants/{id}/tracking`, `PUT /api/tenants/{id}/tracking` | 讀取與更新 GA4/Meta Pixel/GTＭ 等追蹤設定，儲存於 `tracking_settings`。 | 403 – 權限不足；404 – 租戶不存在 |

### 商品管理模組

| 功能 | 路由/函式 | 輸入/輸出 | 說明 |
|---|---|---|---|
| 列出商品 | `GET /api/products` | Query: `search`, `categoryId`, `status`, `page`, `limit` | 回傳商品陣列與分頁資訊；支援全文搜尋與分類過濾 |
| 建立商品 | `POST /api/products` | `name`, `price`, `summary`, `descriptionMd`, `categoryIds[]`, `images[]`, `variants[]` | 在 `products` 建立紀錄，並建立多對多關聯與變體；使用 `db.transaction()` 保證一致性 |
| 更新商品 | `PUT /api/products/{id}` | 相同於建立，但僅更新變動欄位 | 若商品為已發布狀態，只允許特定欄位可編輯 (如價格、庫存) |
| 刪除商品 | `DELETE /api/products/{id}` | 無 (path 參數) | 軟刪除：更新 `status=archived` 並記錄 `deletedAt` |
| AI 描述生成 | `POST /api/ai/generate-description` | `productName`, `keywords[]` | 返回 `{descriptionMd, faq[]}`；並在 `ai_interactions` 記錄 prompt/response |
| OpenGraph | `PUT /api/products/{id}` | `ogTitle`, `ogDescription`, `ogImageUrl` | 商品分享時可覆寫 OpenGraph metadata |

商品管理模組需注意圖片上傳採用第三方物件儲存 (如 R2)，透過預簽名 URL 直接上傳；顏色/尺寸等屬性存入 `product_variants.attributes` 的 JSON。

### 訂單與購物車模組

| 功能 | 路由/函式 | 行為 | 驗證 |
|---|---|---|---|
| 建立購物車/新增商品 | `POST /api/carts` | Body: `{productId, variantId?, quantity}`；以 session 取得購物車；加入商品/變體並更新 `items`, `total`；若庫存不足返回 400 | 檢查 `products.stock` 或 `product_variants.stock` |
| 更新購物車項目 | `PATCH /api/carts/items/{id}` | 更新數量；重新計算總額 | 同上 |
| 刪除購物車項目 | `DELETE /api/carts/items/{id}` | 刪除某項；重新計算總額 | 同上 |
| 清空購物車 | `DELETE /api/carts` | 刪除當前使用者購物車所有項目並重設總額 | 需登入 |
| 結帳生成訂單 | `POST /api/orders` | 輸入收貨地址、配送方式、付款方式；生成 `orders`, `order_items`, `addresses` 記錄 | 檢查庫存與計算運費；建立 `paymentIntent` 或第三方交易資料；返回 `{orderId, paymentData}` |
| 查詢訂單 | `GET /api/orders` | Query: `status`, `dateFrom`, `dateTo`, `search` | 返回訂單列表及分頁 |
| 更新訂單狀態 | `PATCH /api/orders/{id}` | 更新 `status`、`paymentStatus`、`shippingStatus` | 僅允許店家角色；驗證狀態流轉是否合法 (不可逆) |

此模組與金流、物流緊密耦合，因此在創建訂單時會調用 PaymentService; 在付款成功後修改庫存與出貨。

### 金流整合模組

金流模組封裝所有付款提供者，對外提供統一的 `createTransaction()`、`createFormData()`、`verifyNotification()` 和 `refund()` 等函式。每筆交易應包含一個 idempotency key，確保同一訂單與供應商重試時不會產生重複交易；Webhook 需具備冪等性並映射供應商回傳狀態至內部狀態。

> 詳細架構圖與安全策略請參閱 [07_Payment_Flow_Architecture](../02_System_Analysis/07_Payment_Flow_Architecture.md)。

#### 動態供應商選擇 [Inferred from code]

每個 tenant 在 `payment_providers` 表設定金流供應商。建單時透過 `getDefaultProvider(tenantId)` 自動判斷：

```ts
// lib/payment/index.ts
export async function getDefaultProvider(tenantId: string) {
  return db.paymentProvider.findFirst({ where: { tenantId, isDefault: true } })
    ?? db.paymentProvider.findFirst({ where: { tenantId } });
}
```

若無供應商 → `paymentRequired: false`，訂單直接成功不進入付款流程。

#### 結構化表單資料 [Inferred from code]

Form-based 閘道（ECPay、NewebPay）使用 `createFormData()` 回傳結構化物件取代 raw HTML，防止 XSS：

```ts
// lib/payment/ecpay.ts | newebpay.ts
export async function createFormData(config, order): Promise<{
  actionUrl: string;
  fields: Record<string, string>;
  merchantTradeNo: string; // or merchantOrderNo
}>;
```

前端以 hidden `<form>` auto-submit 到閘道，不注入任何 HTML 字串。

#### 金流 API 端點

| 路由 | 方法 | 描述 | 認證 |
|---|---|---|---|
| `/api/orders/[id]/pay` | POST | **主要付款端點** [Inferred from code]：接收 `email?`、`returnUrl`；依 tenant 供應商產生加密表單或 Stripe redirect。 | Tenant 邊界 + 身份驗證（登入用戶 userId / 訪客 email） |
| `/api/orders/[id]/status` | GET | **狀態輪詢端點** [Inferred from code]：輕量查詢付款狀態，供結果頁輪詢。Query: `?email=xxx`。 | Tenant 邊界 + 身份驗證 |
| `/api/payments` | POST | 舊版付款端點：接收 `orderId`、`provider`，需登入。 | `authWithTenant()` |
| `/api/payments/{provider}/notify` | POST | 金流回調 (provider = `ecpay` / `newebpay` / `stripe` / `paypal`)；驗簽 → 更新 `payments`、`orders`。ECPay 回傳 `1|OK` 純文字，其餘 JSON。 | 無（server-to-server） |
| `/api/payments/{id}/refund` | POST | 部分或全額退款；需要 `withAdminAuth`。 | `withAdminAuth` |

#### 安全策略 [Inferred from code]

pay/status 端點實作三層防護：

1. **Tenant 邊界**：`resolveTenantFromRequest(request)` 解析 host → `db.order.findFirst({ where: { id, tenantId } })`
2. **登入用戶**：`authWithTenant()` 取 session → `session.user.id === order.userId`
3. **訪客用戶**：`email` 必填 → `metadata.guestEmail` 大小寫不敏感比對

#### Payment 狀態流轉

```
INITIATED → PENDING → PAID / FAILED → REFUNDED
```

此模組需實作重試機制與冪等處理，確保 webhook 重複送達時不會重複結帳。

### 物流模組

物流模組與金流相似，封裝不同配送服務的 API。提供函式：

* `createShippingOrder(order: Order, methodId: string): Promise<ShippingResult>` – 依照配送方式呼叫不同物流 API，回傳追蹤號碼與標籤 URL。
* `queryShipment(trackingNumber: string): Promise<Status>` – 查詢貨運狀態。
* `cancelShipment()` – 取消出貨。
* `listStores(provider: string, location: {lat, lng}): Promise<Store[]>` – 查詢超商取件店點。

Route Handlers:

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/logistics` | POST | 由訂單建立物流單；傳入 `orderId` 與 `shippingMethodId`；回傳 `shippingOrderId`, `trackingNumber`, `labelUrl` |
| `/api/logistics/webhook` | POST | 接收物流系統回調，更新 `shipping_orders.status`。ECPay 物流需回傳 `1|OK` 純文字；通用格式回傳 JSON `{success: true}`。 |
| `/api/logistics/stores` | GET | 取得可取件店列表；Query: `provider`, `lat`, `lng` |

物流資料需儲存在 `shipping_orders`，並與 `orders` 連結。

### 內容與部落格模組

部落格模組支援文章的 CRUD、分類、標籤以及 SEO/OpenGraph metadata。MDX 內容經由前端 Editor 儲存於 `blog_posts.content_mdx`，預渲染時轉成 HTML。AEO schema 於保存時產生並儲存於 `seo_json`；OpenGraph 使用 `og_title`、`og_description`、`og_image_url` 覆寫預設分享資訊。主要接口：

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/blog/posts` | GET | 分頁查詢文章；支援關鍵字與分類搜尋 |
| `/api/blog/posts` | POST | 新建文章；傳入 `title`, `contentMdx`, `tags[]`, `status` |
| `/api/blog/posts/{id}` | PUT | 更新文章；可修改內容、SEO/OG 設定、發佈狀態 |
| `/api/blog/posts/{id}` | DELETE | 軟刪除文章 |
| `/api/blog/categories` | GET/POST/PUT/DELETE | 管理文章分類 |
| `/api/blog/tags` | GET/POST | 管理標籤 |

此模組應對外提供 public endpoints 於商店前台顯示文章（例如 `/blog/[slug]`），並且使用 ISR 或增量靜態生成來提升效能。

### AI 服務模組

AI 模組負責呼叫外部 LLM 生成描述、FAQ、摘要與導購對話。基於 RAG 架構，先在向量資料庫檢索相關商品與文章，再將結果與問題送入模型生成。主要函式：

* `generateDescription(productName: string, keywords: string[]): Promise<{md: string, faq: FaqItem[]}>` – 使用 OpenAI GPT 模型生成 Markdown 描述與 FAQ。
* `chat(query: string, context: ChatContext): Promise<ChatResponse>` – 導購聊天；透過向量化檢索並調用 LLM。
* `generateBlogSummary(content: string): Promise<{summary: string, faq: string[]}>` – 文章摘要。

API 端點：

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/ai/generate-description` | POST | 呼叫 `generateDescription`；回傳描述與 FAQ |
| `/api/ai/chat` | POST/WS | 建立聊天連線；返回串流回覆 |
| `/api/ai/sales-forecast` | POST | 根據歷史訂單資料預測銷售趨勢；回傳時間序列資料 |

### Universal Commerce Protocol (UCP) 模組

UCP 模組實作了 "Agentic Commerce" 協議，允許外部 AI Agent (如 Google Shopping Agent) 直接發現商品並進行結帳。

> 詳細改造計畫請參閱 [06_UCP_Google_Alignment_Plan](../02_System_Analysis/06_UCP_Google_Alignment_Plan.md)。

#### 架構 [Inferred from code]

採用 **雙軌路由 + 共享 Handler** 架構：

- **v1 路由** (`app/api/ucp/v1/`)：對齊 Google Merchant Shopping APIs v1 規範
- **舊路由** (`app/api/ucp/`)：保留但標記 `@deprecated`（Sunset: 2026-05-31）
- **共享邏輯** (`lib/ucp/handlers/`)：checkout、orders、shipping、callbacks、profile
- **Google 轉接器** (`lib/ucp/adapters/google.ts`)：雙向 schema 轉換

核心模組：

| 模組 | 路徑 | 功能 |
|---|---|---|
| **Handlers** | `lib/ucp/handlers/checkout.ts` | 建立/讀取/更新 Checkout Session（含動態運費重算） |
| **Handlers** | `lib/ucp/handlers/orders.ts` | 從 Session 建立訂單、查詢訂單、狀態映射 |
| **Handlers** | `lib/ucp/handlers/shipping.ts` | 運費計算引擎（包裝 `lib/logistics`） |
| **Handlers** | `lib/ucp/handlers/callbacks.ts` | 訂單生命週期回調（HMAC 簽名、指數退避重試） |
| **Adapter** | `lib/ucp/adapters/google.ts` | 內部 UCP ↔ Google v1 schema 轉換 |
| **Middleware** | `lib/ucp/middleware.ts` | UCP API Key 驗證、merchantId 解析 |
| **Deprecation** | `lib/ucp/deprecation.ts` | 舊路由加 Deprecation/Sunset/Link headers |

#### API 端點（v1 Google 相容）[Inferred from code]

| 路由 | 方法 | 功能 |
|---|---|---|
| `/.well-known/ucp/profile.json` | GET | Google UCP Profile 端點 |
| `/api/ucp/v1/checkout-sessions` | POST | 建立 Checkout Session |
| `/api/ucp/v1/checkout-sessions/{id}` | GET | 讀取 Session |
| `/api/ucp/v1/checkout-sessions/{id}` | PUT | 更新 Session（含運費重算） |
| `/api/ucp/v1/checkout-sessions/{id}/complete` | POST | 完成結帳 → 建立訂單 |
| `/api/ucp/v1/orders/{orderId}` | GET | 查詢訂單 |
| `/api/ucp/v1/products/availability` | POST | 商品庫存查詢 |
| `/api/ucp/v1/callbacks/orders` | POST | 接收訂單動作（CANCEL, REFUND, RETURN） |
| `/api/ucp/v1/metrics` | GET | UCP 指標 |

#### 舊路由（Deprecated）

| 路由 | 方法 | 說明 |
|---|---|---|
| `/api/ucp/profile` | GET | 舊 Profile（加 Deprecation header） |
| `/api/ucp/checkout-sessions` | POST/GET | 舊 Session 端點 |
| `/api/ucp/orders` | POST/GET | 舊訂單端點 |
| `/api/ucp/availability` | POST | 舊庫存查詢 |
| `/api/ucp/products` | GET | 商品列表（保留） |

#### 測試覆蓋 [Inferred from code]

- `tests/api/ucp-v1-handlers.test.ts` — 23 個單元測試（money utils、Google adapter、shipping engine、callback HMAC/retry、checkout 更新）
- `tests/api/ucp-v1-e2e.test.ts` — E2E 流程測試

### 檔案管理模組 (File Management)

檔案模組提供統一的檔案上傳與管理介面，支援多種儲存後端 (S3/R2/Blob)。

核心邏輯：
*   **Upload**: 支援 Multipart upload 或 Presigned URL。
*   **Polymorphic Association**: 使用 `entityType` + `entityId` 將檔案關聯至任意資源。

API 端點：

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/files/upload` | POST | 上傳檔案；支援 `multipart/form-data` |
| `/api/files/{id}` | GET | 獲取檔案資訊或下載連結 |
| `/api/files/{id}` | DELETE | 刪除檔案 |

### 排程任務模組 (Cron)

使用 Vercel Cron 或外部觸發器執行的定期任務。

API 端點：

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/cron/daily` | GET | 每日任務：彙整報表、清理過期 Session |
| `/api/cron/hourly` | GET | 每小時任務：更新匯率、檢查庫存預警 |

### 分析與報表模組

分析模組整合了事件追蹤與報表生成功能，使用 ClickHouse/BigQuery 儲存事件資料，並提供 API 給前端報表使用。

* `POST /api/analytics/event` – 接收前端事件，寫入 `analytics_events` 表或流量管道。
* `GET /api/analytics/dashboard` – 返回營收、訪問量、熱門商品等 KPI；可傳入日期區間。
* `GET /api/analytics/ai-impact` – 計算使用 AI 服務對銷售提升的影響。

### 公用函式與工具

| 函式 | 位置 | 功能 |
|---|---|---|
| `formatCurrency(value: number, currency: string): string` | `lib/utils.ts` | 將數字格式化為特定幣別字串 |
| `slugify(text: string): string` | `lib/utils.ts` | 生成 URL-friendly slug |
| `isValidEmail(email: string): boolean` | `lib/utils.ts` | 驗證 email 格式 |
| `hashPassword(password: string): Promise<string>` | `lib/auth.ts` | 使用 bcrypt 或 argon2 雜湊密碼 |
| `verifyPassword(password, hash)` | `lib/auth.ts` | 驗證密碼 |
| `withAuth(handler, roles?)` | `lib/middleware/withAuth.ts` | 檢查 session 與權限 |
| `generateId(): string` | `lib/id.ts` | 產生 UUIDv7（時間排序、全域唯一）[Inferred from code] |
| `resolveTenantFromRequest(req): Promise<TenantInfo>` | `lib/tenant/resolve-tenant.ts` | 從 request host 解析 tenant（支援 custom domain、subdomain、localhost）[Inferred from code] |
| `resolveTenant(hostname): Promise<TenantInfo>` | `lib/tenant/resolve-tenant.ts` | 從 hostname 解析 tenant [Inferred from code] |
| `authWithTenant(opts): Promise<{session, tenant}>` | `lib/api/auth-helpers.ts` | 認證 + tenant 驗證一體化函式（查 session + DB 確認角色/租戶關聯）[Inferred from code] |
| `getDefaultProvider(tenantId): Promise<PaymentProvider>` | `lib/payment/index.ts` | 取得 tenant 預設金流供應商 [Inferred from code] |

這些工具函式提高重用性並使程式保持乾淨。

## 資料傳輸物件 (DTO) 與型別定義

為確保前後端傳遞的資料結構一致，定義一系列 TypeScript interface：

```ts
// types/user.ts
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'staff' | 'customer';
}

// types/product.ts
export interface ProductDTO {
  id: string;
  name: string;
  slug: string;
  summary: string;
  descriptionMd: string;
  price: number;
  currency: string;
  stock: number;
  categories: CategoryDTO[];
  variants: VariantDTO[];
  images: AssetDTO[];
}

// types/order.ts
export interface OrderDTO {
  id: string;
  orderNo: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'completed' | 'cancelled' | 'refunding';
  totalAmount: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  shippingStatus: 'pending' | 'preparing' | 'delivering' | 'delivered' | 'returned';
  items: OrderItemDTO[];
  addresses: AddressDTO[];
}

// 其餘 DTO 省略，可於 types 資料夾定義
```

DTO 應對應到資料庫欄位 (但不要包含敏感欄位，如 `password_hash`)。

## 錯誤處理與返回格式

API 返回格式統一採用 JSON：

```json
{
  "success": true,
  "data": { /* object or array */ },
  "message": ""
}
```

若發生錯誤：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT", // 自定義錯誤碼
    "message": "名稱不得為空"
  }
}
```

常見錯誤碼：

| 錯誤碼 | HTTP 狀態 | 說明 |
|---|---|---|
| `INVALID_INPUT` | 400 | 請求欄位缺失或格式錯誤 |
| `TENANT_NOT_FOUND` | 400 | 無法從 request host 解析租戶 [Inferred from code] |
| `UNAUTHORIZED` | 401 | 未登入或 session 過期 |
| `FORBIDDEN` | 403 | 權限不足（含跨租戶、userId 不匹配、email 不匹配） |
| `EMAIL_REQUIRED` | 400 | 訪客訂單付款需提供電子郵件 [Inferred from code] |
| `NOT_FOUND` | 404 | 資源不存在（含跨租戶查詢） |
| `ALREADY_PAID` | 409 | 訂單已付款，不可重複付款 [Inferred from code] |
| `NO_PROVIDER` | 400 | 租戶未設定金流供應商 [Inferred from code] |
| `CONFLICT` | 409 | 資源衝突，如 Email 已存在 |
| `RATE_LIMITED` | 429 | 超出呼叫頻率限制 |
| `INTERNAL_ERROR` | 500 | 伺服器內部錯誤 |

對於 webhook/notify 端點，回傳格式依供應商規範而有例外：

| 供應商 | 成功回傳 | 失敗回傳 | 說明 |
|---|---|---|---|
| **ECPay (金流/物流)** | `1|OK` (純文字, 200) | `0|ErrorMsg` (純文字, 400) | ECPay 強制要求純文字格式 |
| **NewebPay** | `{"success": true}` (JSON, 200) | `{"success": false}` (JSON, 400) | 統一 JSON |
| **Stripe** | `{"received": true}` (JSON, 200) | `{"error": "..."}` (JSON, 400) | Stripe 標準格式 |
| **PayPal** | `{"received": true}` (JSON, 200) | `{"error": "..."}` (JSON, 400) | PayPal 標準格式 |

其餘所有 API 端點一律使用上述統一 JSON 格式。所有錯誤皆應記錄於中央日誌。

## 背景作業與排程任務

某些業務需在背景執行或定時觸發：

1. **訂單逾時取消**：如果訂單在 30 分鐘內未完成付款，自動標記為 `cancelled`，釋放庫存。
2. **定期同步金流狀態**：對於 ATM 或超商付款，每隔 15 分鐘同步一次付款狀態直至成功或逾期。
3. **報表生成**：每晚透過 Cron 任務彙整每日營收與 AI 使用量，寫入報表資料表。
4. **清理舊資料**：定期刪除過期 Session、暫存檔案與軟刪除逾期資料。

背景作業可以使用 Node Cron、BullMQ 或外部任務平台 (如 Cloud Tasks) 實現。務必處理冪等性與錯誤重試。

## 日誌、監控與追蹤

* **日誌**：統一使用 `pino` 或 `winston`；在 Route Handler 中記錄請求 ID、使用者 ID、處理時間與錯誤訊息。金流與 AI 請求應記錄完整 payload。
* **監控**：透過 Prometheus 收集 API 延遲、錯誤率、事件流量；Grafana 或 Axiom 用於儀表盤視覺化。
* **追蹤**：採用 OpenTelemetry 於微服務之間傳遞 Trace ID，方便根因分析。

## 安全設計重點

1. **認證授權**：所有保護 API 需檢查 session 與角色。敏感操作 (退款、刪除資料) 需要二次驗證或 MFA。
2. **敏感資料保護**：密碼使用 bcrypt/argon2 雜湊；金流密鑰儲存在環境變數或 Vault；不得將卡號儲存在資料庫。
3. **輸入驗證**：統一使用 Zod/Validator 驗證 API 請求；防止 XSS/SQL 注入；對於外部輸入 (如金流回傳值) 需嚴格驗簽。
4. **跨站請求防護**：Next.js 預設開啟 CSRF 保護；對於非 GET 請求需附帶 CSRF token。
5. **依賴管理**：定期更新依賴並檢查 CVE；使用 Dependabot/OSV。推動安全程式碼審查與靜態檢測。

透過本程式規格書，開發人員可基於系統架構書中的功能定義實作具體程式，確保各模組介面一致、資料結構正確並符合安全要求。
