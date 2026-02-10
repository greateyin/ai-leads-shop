# AIsell 系統架構書與資料庫設計（Next.js + shadcn/ui + Auth.js v5）

## 目錄

- [1 背景與目標](#1-背景與目標)
- [2 目錄結構與程式架構](#2-目錄結構與程式架構)
- [3 資料庫架構與 Schema](#3-資料庫架構與-schema)
  - [3.1 主要實體與欄位](#31-主要實體與欄位)
  - [3.2 關聯與索引設計](#32-關聯與索引設計)
  - [3.3 依金流提供商差異化的欄位](#33-依金流提供商差異化的欄位)
- [4 資料流程 (Data Flows)](#4-資料流程-data-flows)
  - [4.1 註冊與登入流程](#41-註冊與登入流程)
  - [4.2 商品建立與 AI 描述生成流程](#42-商品建立與-ai-描述生成流程)
  - [4.3 下單與付款流程](#43-下單與付款流程)
  - [4.4 物流與取件流程](#44-物流與取件流程)
  - [4.5 內容行銷與部落格流程](#45-內容行銷與部落格流程)
- [5 金流供應商差異分析](#5-金流供應商差異分析)
  - [5.1 最受歡迎的線上金流服務商分析](#51-最受歡迎的線上金流服務商分析)
- [6 模組規格與 API](#6-模組規格與-api)
  - [6.1 認證與使用者管理](#61-認證與使用者管理)
  - [6.2 租戶與店家管理](#62-租戶與店家管理)
  - [6.3 商品與庫存服務](#63-商品與庫存服務)
  - [6.4 訂單與支付服務](#64-訂單與支付服務)
  - [6.5 物流服務](#65-物流服務)
  - [6.6 內容／部落格服務](#66-內容部落格服務)
  - [6.7 AI 服務](#67-ai-服務)
  - [6.8 分析與報表](#68-分析與報表)
  - [6.9 API 回應與錯誤格式](#69-api-回應與錯誤格式)
  - [6.10 租戶計費與使用量](#610-租戶計費與使用量)
- [7 UI/UX 設計指南](#7-uiux-設計指南)
- [8 安全性與隱私](#8-安全性與隱私)
- [9 部署、擴展與維運](#9-部署擴展與維運)
- [10 結論](#10-結論)

## 1 背景與目標

AIsell 是一個面向微型零售商與創作者的 SaaS 服務。目標是讓不懂技術的店主能夠在數分鐘內建立線上商店，並透過生成式 AI 達成商品描述撰寫、導購及行銷文案生成。根據可行性分析報告，產品將分階段提供：

1. **MVP 階段** – 支援簡易商品上架、AI 描述生成、購物車、結帳、台灣本地金流與物流整合。透過社群分享與低月費方案吸引用戶。
2. **擴展階段** – 增加 AEO/GEO 友善部落格、AI 銷售預測與進階報表，並豐富金物流選項與訂閱制方案。
3. **國際化階段** – 引入多語言、多貨幣，整合 Stripe 等跨境金流與國際物流，並提供 API 擴充介面。

本文件以 Next.js 16、shadcn/ui 與 Auth.js v5 為技術基底，詳細描述目錄結構、資料庫 schema、資料流程、模組規格、UI/UX 指引及金流提供商差異。引用了官方文件與可靠來源的資料，並在必要處提供證據。

## 2 目錄結構與程式架構

### 2.1 Next.js 專案目錄

> **[Synced with codebase: 2026-02-10]**

採用 App Router 風格的目錄，以功能模組區分。以下為實際專案結構（僅列出核心部分）：

```
app/
  layout.tsx                # 根 layout，引入 SessionProvider、Tailwind/ThemeProviders
  page.tsx                  # 首頁 (Landing / 宣傳頁)

  (auth)/                   # 公共認證頁面（route group，不影響 URL）
    login/page.tsx
    register/page.tsx
    callback/route.ts       # OAuth callback route handler

  (public)/                 # 前台店面頁面（route group）
    products/
      [slug]/page.tsx       # 商品詳情頁（SEO slug）
    blog/
      [slug]/page.tsx       # 部落格文章頁
    cart/page.tsx            # 購物車頁
    checkout/
      page.tsx              # 結帳頁
      pay/
        page.tsx            # 付款頁（auto-submit form 到閘道）
        result/page.tsx     # 付款結果頁（輪詢 /api/orders/[id]/status）
    orders/
      lookup/page.tsx       # 訪客訂單查詢

  dashboard/                # 店家後台（受保護路由）
    layout.tsx
    page.tsx                # 儀表板首頁
    products/
      page.tsx              # 商品列表
      new/page.tsx          # 新建商品（含 AI 描述生成）
      [id]/page.tsx         # 編輯商品
    orders/
      page.tsx              # 訂單列表與搜尋
      [id]/page.tsx         # 訂單詳情與履約管理
    payments/page.tsx       # 金流設定及交易紀錄
    logistics/page.tsx      # 物流設定與配送狀態
    blog/
      page.tsx              # 文章列表
      new/page.tsx          # 新建文章 (MDX 編輯器)
      [slug]/page.tsx       # 編輯文章
    ai/interactions/page.tsx  # AI 使用紀錄
    analytics/page.tsx      # 統計與報表
    settings/
      page.tsx              # 商店設定
      tracking/page.tsx     # GA4/Meta Pixel 追蹤碼設定

  api/                      # API Route Handlers
    auth/
      [...nextauth]/route.ts  # Auth.js v5 handlers
      login/route.ts
      register/route.ts
      forgot/route.ts
      reset/route.ts
      verify/route.ts
      resend-verification/route.ts
    products/route.ts       # 商品 CRUD + 搜尋
    orders/
      route.ts              # 建立訂單、查詢訂單
      [id]/
        route.ts            # 單一訂單操作
        pay/route.ts        # 付款表單產生（tenant 邊界 + 身份驗證）
        status/route.ts     # 狀態輪詢（tenant 邊界 + 身份驗證）
      lookup/route.ts       # 訪客訂單查詢
    payments/
      route.ts              # 舊版付款端點
      [id]/refund/route.ts  # 退款
      ecpay/notify/route.ts
      newebpay/notify/route.ts
      stripe/notify/route.ts
      paypal/notify/route.ts
    carts/
      route.ts              # 購物車操作
      [id]/route.ts
      checkout/route.ts
    blog/
      posts/route.ts
      categories/route.ts
      tags/route.ts
    logistics/
      route.ts
      [id]/route.ts
      stores/route.ts       # 門市查詢
      webhook/route.ts
    ai/
      generate-description/route.ts
      chat/route.ts
      blog-summary/route.ts
    analytics/
      dashboard/route.ts
      event/route.ts
      ai-impact/route.ts
    files/
      upload/route.ts
      [id]/route.ts
    ucp/                    # UCP 舊路由（@deprecated, Sunset: 2026-05-31）
      profile/route.ts
      checkout-sessions/route.ts
      orders/route.ts
      products/route.ts
      availability/route.ts
      v1/                   # UCP v1 — 對齊 Google Merchant Shopping APIs
        checkout-sessions/
          route.ts
          [checkoutSessionId]/route.ts
        orders/
          route.ts
          [orderId]/route.ts
        products/availability/route.ts
        callbacks/orders/route.ts
        metrics/route.ts
    shops/route.ts          # 商店設定
    tenants/route.ts        # 租戶管理
    users/route.ts          # 使用者管理
    usage/route.ts          # 用量查詢
    cron/
      daily/route.ts
      hourly/route.ts

  .well-known/              # 標準化端點
    ucp/profile.json/route.ts            # UCP Profile (Google v1)
    merchant-api/ucp/profile.json/route.ts  # 備用路徑

lib/
  auth.ts                # Auth.js v5 設定檔
  auth-rate-limit.ts     # 認證速率限制
  db.ts                  # Prisma Client 初始化
  id.ts                  # UUIDv7 產生器
  utils.ts               # 共用工具函式
  stock.ts               # 庫存管理
  ai.ts                  # OpenAI / LLM 呼叫
  email.ts               # 郵件發送
  mdx.tsx                # MDX 渲染
  vector.ts              # 向量資料庫
  rate-limit.ts          # API 速率限制
  api/
    auth-helpers.ts      # authWithTenant() — 認證 + tenant 驗證
  middleware/
    withAuth.ts          # RBAC 中介函式
  tenant/
    resolve-tenant.ts    # resolveTenantFromRequest() — hostname → tenantId
  payment/
    index.ts             # getDefaultProvider()、PaymentFormData 型別
    ecpay.ts             # 綠界 API（createFormData, createTransaction, verifyNotification）
    newebpay.ts          # 藍新 API（createFormData, createTransaction, verifyNotification）
    stripe.ts            # Stripe API（createCheckoutSession, createPaymentIntent）
    paypal.ts            # PayPal API
  logistics/
    ecpay.ts             # 綠界物流
  storage/               # 檔案儲存（S3/R2/Blob）
  seo/                   # SEO 工具（JSON-LD、OpenGraph）
  jobs/                  # 背景任務
  actions/               # Server Actions
  ucp/
    types.ts             # UCP 型別定義
    middleware.ts        # UCP API Key 驗證、merchantId 解析
    guard.ts             # UCP 權限守衛
    deprecation.ts       # 舊路由 Deprecation/Sunset headers
    metrics.ts           # UCP 指標收集
    adapters/
      google.ts          # 內部 UCP ↔ Google v1 schema 轉換
    handlers/
      checkout.ts        # Checkout Session CRUD（含動態運費）
      orders.ts          # 訂單建立/查詢/狀態映射
      shipping.ts        # 運費計算引擎
      callbacks.ts       # 訂單回調（HMAC 簽名、指數退避重試）
      profile.ts         # UCP Profile 產生

components/
  ui/                    # shadcn/ui 元件
  layout/                # Layout 組件
  admin/                 # 後台專用元件
  product/               # 商品相關元件
  cart/                  # 購物車元件
  checkout/              # 結帳元件
  seo/                   # SEO 元件（JSON-LD、OpenGraph）
  tracking/              # 追蹤代碼注入

types/                   # TypeScript 型別定義 (DB 模型、DTO、API interface)
prisma/
  schema.prisma          # 資料庫 schema
  seed-payment-provider.ts  # 金流供應商種子腳本
tests/
  api/                   # API 整合/安全測試
  lib/                   # Lib 單元測試
    tenant/              # Tenant 解析測試
  components/            # 元件測試
e2e/                     # Playwright E2E 測試
middleware.ts            # 全域 Middleware（權限檢查與租戶解析）
```

### 2.2 程式架構概述

架構採用 **微服務 + BFF** 模式。前端 Next.js 應用透過內建的 Route Handlers 充當 BFF，轉發請求至後端微服務。核心服務包括：

1. **認證服務 (Auth Service)** – 基於 Auth.js v5，管理登入、註冊、第三方 OAuth，並以 `auth()` 函式於 Server Components 中取得 Session。
2. **商品服務 (Product Service)** – 提供商品 CRUD、類別、庫存管理 API，可使用 Node.js/Express 或 Nest.js 實現。產品資料儲存於 PostgreSQL。
3. **訂單服務 (Order Service)** – 管理訂單生命週期、訂單編號生成、金額計算與狀態變更。
4. **金流服務 (Payment Service)** – 封裝綠界 (ECPay)、藍新 (NewebPay)、Stripe 等金流供應商。提供統一介面建構交易、產生付款連結或表單、驗簽與 webhook 處理。
5. **物流服務 (Logistic Service)** – 整合台灣超商取件與宅配物流 (7-Eleven、全家、黑貓) 以及國際物流服務；負責建立寄件單與查詢追蹤號碼。
6. **內容/部落格服務 (Content Service)** – 管理 MDX 文章、分類與標籤；支援 AEO/GEO schema tag 生成。
7. **AI 服務 (AI Service)** – 包裝對 OpenAI 或自建 LLM 的呼叫，用於商品描述生成、FAQ 建議、導購問答等。可使用向量資料庫 (如 Supabase Vector) 儲存 embedding 用於檢索增強生成。
8. **分析服務 (Analytics Service)** – 監聽使用者事件，儲存於 ClickHouse 或 BigQuery，供儀表板與 AI 預測使用。

這些服務透過 gRPC 或 REST 介面與 BFF 通訊，BFF 層統一處理 Session 檢查與錯誤處理，前端僅需關心業務資料。

## 3 資料庫架構與 Schema

本系統採用 PostgreSQL 做為主資料庫，並支援多租戶 (multi‑tenant) 模式。所有表格均包含 `tenant_id` 欄位，利用 [Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) 或 ORM middleware 依 Session 中的 `tenant_id` 自動過濾資料。

### 3.1 主要實體與欄位

表格以粗體標註主鍵，資料型別以 PostgreSQL 語法呈現；`*` 為必填欄位。為簡潔起見，可自行根據需要新增索引與約束。

| 表格 | 主要欄位 | 描述 |
|---|---|---|
| **tenants** | **id** UUID*, name*, subdomain, plan (enum: seed, growth, pro), status (active, suspended), created_at timestamptz*, updated_at timestamptz* | 租戶／店家群組，對應一間商店或品牌。 |
| **users** | **id** UUID*, tenant_id*, name*, email* (unique), password_hash, provider (enum: credentials, google, facebook, line, apple), role (owner, admin, staff, customer), avatar_url, created_at*, updated_at* | 使用者基本資料與角色。若採用 OAuth 僅儲存 providerId。 |
| **shops** | **id** UUID*, tenant_id*, owner_user_id* (FK→users.id), name*, slug*, domain, description, logo_url, currency (e.g., TWD), timezone, locale, config JSONB, created_at*, updated_at* | 一個租戶可建立多個店面 (區分不同品牌或網域)，shop 設定如顏色、主題放在 config。 |
| **product_categories** | **id** UUID*, tenant_id*, parent_id (self FK), name*, slug*, description, sort_order, created_at*, updated_at* | 商品分類，可階層式。 |
| **products** | **id** UUID*, tenant_id*, shop_id*, name*, slug*, summary, description_md (Markdown)、description_html、price numeric(12,2)*、cost numeric(12,2)、stock integer、sku (unique per shop)、status (draft, published, archived)、cover_image_url、og_title, og_description, og_image_url、created_at*, updated_at* | 商品主表。描述欄位由 AI 生成前以 md 儲存；支援商品分享的 OpenGraph 欄位。 |
| **product_category_assignments** | **id** UUID*, product_id* (FK), category_id* (FK) | 多對多關係表。 |
| **product_variants** | **id** UUID*, product_id*, sku*, name, attributes JSONB (例如顏色/尺寸)、price numeric(12,2), stock integer, created_at*, updated_at* | 規格變體 (如尺寸、顏色)。 |
| **product_assets** | **id** UUID*, product_id*, type (image, video, pdf)、url*, alt_text, sort_order | 商品媒體。 |
| **carts** | **id** UUID*, tenant_id*, user_id (nullable，訪客時可留空並用 session_id)、items JSONB、total numeric(12,2)、currency、created_at*, updated_at* | 臨時購物車，亦可存於 Redis。 |
| **orders** | **id** UUID*, tenant_id*, shop_id*, user_id (nullable)、order_no* (唯一索引)、status (pending, paid, processing, shipped, completed, cancelled, refunding)、currency*, total_amount*, shipping_fee, discount_amount, tax_amount, payment_status (pending, paid, failed, refunded)、shipping_status (pending, preparing, delivering, delivered, returned)、created_at*, updated_at* | 訂單主表。 |
| **order_items** | **id** UUID*, order_id*, product_id*, variant_id (nullable)、name*, sku*, quantity*, unit_price numeric(12,2)*、discount numeric(12,2)、subtotal numeric(12,2), created_at* | 訂單明細。 |
| **addresses** | **id** UUID*, tenant_id*, user_id*、order_id (nullable)、type (billing, shipping, pickup, store)、contact_name*, phone*, country*, state, city*, postal_code*, address_line1*, address_line2, notes, created_at* | 用戶與訂單地址。 |
| **reset_tokens** | **id** UUID*, user_id* (FK→users.id), token* (varchar), expires_at timestamptz*, created_at* | 密碼重設令牌表，用於保存忘記密碼流程產生的驗證碼與到期時間。 |
| **payments** | **id** UUID*, tenant_id*, order_id*, provider (ecpay, newebpay, stripe, cash), method (credit_card, atm, cvs, line_pay, apple_pay, etc.)、amount numeric(12,2)*、currency*, status (initiated, pending, paid, failed, refunded)、transaction_no, provider_order_no, paid_at timestamptz、failure_reason, raw_response JSONB, created_at*, updated_at* | 付款紀錄。 |
| **payment_providers** | **id** UUID*, tenant_id*, type (ecpay, newebpay, stripe, ...)、name、config JSONB、is_default boolean, created_at*, updated_at* | 儲存每家店的金流配置。例如綠界需要 MerchantID/HashKey/HashIV，Stripe 需要 secret_key/publishable_key/webhook_secret。 |
| **payment_notifications** | **id** UUID*, payment_id*, provider*, payload JSONB*, received_at*, verified boolean | 金流供應商回傳的通知紀錄。 |
| **payment_refunds** | **id** UUID*, payment_id* (FK→payments.id), amount numeric(12,2)*, currency*, provider_refund_no, status (pending, refunded, failed), created_at*, updated_at* | 退款紀錄，紀錄每筆部分或全額退款的金額、幣別與供應商退款編號。 |
| **user_tenants** | **id** UUID*, user_id* (FK→users.id), tenant_id* (FK→tenants.id), role (owner, admin, staff, viewer), created_at*, updated_at* | 使用者與租戶之間的多對多關聯，用於管理不同店面的權限與角色。 |
| **tenant_billing_accounts** | **id** UUID*, tenant_id* (FK→tenants.id), plan (seed, growth, pro), billing_method (credit_card, bank_transfer, crypto), next_billing_date date, status (active, suspended, cancelled), created_at*, updated_at* | 記錄租戶的訂閱方案與結帳方式，協助月費與抽成的週期性結算。 |
| **tenant_invoices** | **id** UUID*, tenant_id* (FK→tenants.id), invoice_no varchar(32), period_start date*, period_end date*, amount numeric(12,2)*, currency*, status (draft, issued, paid, failed), issued_at timestamptz, paid_at timestamptz, created_at*, updated_at* | 儲存各租戶的發票資訊與付款狀態，支援月費與抽成帳務管理。 |
| **tenant_usage_metrics** | **id** UUID*, tenant_id* (FK→tenants.id), metric_type (ai_tokens, storage_mb, api_calls, orders_count), value numeric(20,2)*, period_start date*, period_end date*, created_at*, updated_at* | 用於計費或監控的租戶使用量統計，例如 AI token 用量、儲存空間、API 呼叫次數等。 |
| **ai_attributions** | **id** UUID*, tenant_id* (FK→tenants.id), ai_interaction_id* (FK→ai_interactions.id), order_id* (FK→orders.id), revenue numeric(12,2), created_at*, updated_at* | 記錄 AI 導購與訂單之間的歸因資料，用於計算 AI 抽成與生成貢獻報告。 |
| **tenant_api_limits** | **id** UUID*, tenant_id* (FK→tenants.id), metric (requests_per_minute, ai_tokens_per_month, storage_mb), limit_value numeric, created_at*, updated_at* | 用於設定各租戶 API/AI 使用上限，落實每個租戶的流量與配額限制。 |
| **tracking_settings** | **id** UUID*, tenant_id* (FK→tenants.id), ga4_measurement_id, meta_pixel_id, gtm_container_id, created_at*, updated_at* | 每個租戶的追蹤設定，用於 GA4/Meta Pixel/GTＭ 等第三方追蹤代碼。 |
| **shipping_providers** | **id** UUID*, tenant_id*, name*, code*, config JSONB、created_at*, updated_at* | 物流供應商，例如 7‑Eleven、全家、黑貓、DHL。包含 API key、店到店/宅配設定。 |
| **shipping_methods** | **id** UUID*, tenant_id*, provider_id*、name*, type (home, cvs, pickup)、base_fee numeric(12,2)、free_threshold numeric(12,2)、eta_days integer、created_at*, updated_at* | 店家可定義多種配送方式及費率。 |
| **shipping_orders** | **id** UUID*, tenant_id*, order_id*、provider_id*, method_id*, status (created, awaiting_pickup, in_transit, delivered, cancelled)、tracking_number, label_url, created_at*, updated_at* | 物流訂單。
| **blog_posts** | **id** UUID*, tenant_id*, author_id* (FK→users.id)、title*, slug*、content_mdx*, summary, cover_image_url, seo_title, seo_description, og_title, og_description, og_image_url, status (draft, published), published_at, created_at*, updated_at* | 部落格文章，支援 MDX/Markdown，並支援 OpenGraph 資訊。 |
| **blog_categories** | **id** UUID*, tenant_id*, name*, slug*, description, parent_id (self FK) | 文章分類。 |
| **blog_tags** | **id** UUID*, tenant_id*, name*, slug* | 文章標籤。 |
| **blog_tag_assignments** | **id** UUID*, post_id*, tag_id* | 多對多關係。 |
| **ai_interactions** | **id** UUID*, tenant_id*, user_id*, type (product_description, faq, blog_summary, chat)、prompt*, response*, model*, created_at* | AI 呼叫紀錄，用於追蹤成本與品質。 |
| **analytics_events** | **id** UUID*, tenant_id*, user_id (nullable)、session_id、event_name*, properties JSONB、created_at* | 使用者行為事件供分析使用，儲存於事件資料庫 (可延伸至 ClickHouse)。 |
| **audit_logs** | **id** UUID*, tenant_id*, user_id*, action*, resource_type*, resource_id*, before_data JSONB、after_data JSONB、created_at* | 系統稽核紀錄，用於追蹤操作歷史。 |
| **feature_flags** | **id** UUID*, tenant_id*, key*, value (JSONB)、active boolean、created_at* | 功能開關，便於 A/B 測試或分階段發布。 |

### 3.2 關聯與索引設計

1. **多租戶安全** – 所有查詢均需根據登入 Session 的 `tenant_id` 過濾資料。可以透過 Prisma、Drizzle 中間件或 DB RLS 實現。
2. **唯一索引** – `users.email`、`shops.slug`、`products.sku`、`orders.order_no` 等欄位需建立唯一索引。
3. **外鍵** – `orders.shop_id`、`orders.user_id`、`order_items.product_id` 等有 FK 約束；若採軟刪除請加上 `deleted_at`。
4. **時間索引** – 常查詢交易期間的 `payments.paid_at`、`orders.created_at` 建議建立 B‑Tree 索引以加速報表。
5. **JSONB 索引** – `payment_providers.config` 可使用 GIN 索引以快速查詢啟用的金流類型。

### 3.3 依金流提供商差異化的欄位

不同金流供應商需要儲存不同欄位，建議將通用欄位存放在 `payments` 表，將特定資訊放入 `payment_providers.config` 或 `payments.raw_response` 中。以下為示例：

| 供應商 | 需要的設定欄位 (存於 payment_providers.config) | 交易記錄欄位 (存於 payments/raw_response) | 支援的付款方式 |
|---|---|---|---|
| **ECPay** | `MerchantID`, `HashKey`, `HashIV`, `PlatformID`, `InvoiceAPIKey`, `LogisticsAPIKey` | 回傳的 `TradeNo`, `RtnCode`, `RtnMsg`, `PaymentType`, `TradeAmt`, `PaymentDate` 等 | 信用卡、分期、ATM、Web ATM、超商條碼、超商代碼、Apple Pay、TWQR、ATM轉帳、分期付款等【671184718537388†L19-L24】【671184718537388†L60-L80】；此外支援開立電子發票與物流服務。 |
| **NewebPay** | `MerchantID`, `HashKey`, `HashIV`, `RespondType`, `Version`, `NotifyURL`、`ReturnURL`、`CustomerURL` | 回傳的 `Status`, `TradeInfo`, `TradeSha` (AES/Hash資料)、`Amt`, `TradeNo`, `MerchantOrderNo`, `ExpireDate`, `PayTime` 等 | 信用卡、ATM、超商付款、Apple Pay、Google Pay、Samsung Pay、台灣 Pay、LINE Pay、玉山 Wallet 等【276130365608065†L21-L24】【276130365608065†L60-L79】。快速串接及內建物流服務。 |
| **Stripe** | `secret_key`, `publishable_key`, `webhook_secret`, `account_id`, `beta_features` | Payment Intent/Checkout Session 之 `id`, `client_secret`, `payment_method_types`, `status`, `charges`, `currency`, `amount`, `amount_received` 等 | 支援超過 100 種支付方式與 135+ 種貨幣【183933205365728†L129-L135】【183933205365728†L289-L296】；提供跨境多幣種結算、稅務自動計算、Fraud Radar 及可調式匯率鎖定【183933205365728†L289-L304】。 |

此表展示了為不同供應商設計資料庫欄位的思考。除基本欄位外，建議於 `payment_providers.config` 使用 JSON Schema 進行驗證，並在 UI 設定介面引導店家輸入需要的密鑰及回呼網址。

## 4 資料流程 (Data Flows)

### 4.1 註冊與登入流程

1. **店家註冊**：訪客於 `auth/register` 填寫電子郵件、密碼與商店名稱。Server Action 驗證格式後，呼叫 Auth.js v5 的 `signUp` 或自行註冊邏輯，建立 `users` 與 `tenants` 記錄。若使用 Google/LINE 等 OAuth，即導向供應商授權頁。
2. **Email 驗證**：寄送含 token 的驗證信；點擊後由 Route Handler 驗證 token，更新 `users` 表之 `email_verified_at`，並建立 Session。
3. **登入流程**：使用者於 `auth/login` 輸入帳密或選擇第三方登入，`auth()` 函式於 server 驗證憑證並回傳 JWT/session cookie。`users.role` 決定可進入的後台模組。
4. **Session 取得**：在需要保護的頁面使用 `auth()` 於 Server Component 或 Route Handler 取得 Session，並將 `tenant_id`、`user_id`、`role` 傳給資料存取層進行資料過濾。

### 4.2 商品建立與 AI 描述生成流程

1. **新增商品**：店家於後台點擊「新增商品」，輸入商品名稱、價格與基本屬性，並可選擇分類。使用 shadcn 的表單元件驗證欄位。
2. **AI 生成描述**：點擊「AI 生成描述」按鈕，前端透過 Server Action 呼叫 AI 服務 (`/api/ai/generate`) 傳入商品名稱與關鍵字。AI 服務使用 LLM API 生成 Markdown 描述與 FAQ，寫入暫存表 `ai_interactions`。
3. **保存商品**：在預覽與人工編輯後，點擊「儲存」。Server Action 將資料寫入 `products` 表，若有變體則批次寫入 `product_variants` 與 `product_assets`。此操作記錄於 `audit_logs`。
4. **前端展示**：商品列表頁使用 Next.js Server Component 讀取 `products` 表，利用 Cache Components 快取靜態區塊，而庫存數量以 `use()` 或 `swr` 再取得即時資料。

### 4.3 下單與付款流程

> **[Synced with codebase: 2026-02-10]** — 詳細架構圖與安全策略請參閱 [07_Payment_Flow_Architecture](07_Payment_Flow_Architecture.md)。

1. **購物車**：顧客於前台 `(public)/` 路由瀏覽商品，將商品加入購物車。購物車資料可存於瀏覽器 localStorage 並同步至伺服器端 `carts` 表。
2. **結帳**：在 `(public)/checkout/page.tsx` 輸入寄送地址與聯絡資訊（訪客需提供 email）。BFF 計算運費與總價並顯示訂單摘要。
3. **建立訂單**：點擊「確認訂單」，`POST /api/orders` 產生唯一 `order_no`（UUIDv7），寫入 `orders`、`order_items`、`addresses`；同時呼叫 `getDefaultProvider(tenantId)` 判斷是否有金流供應商：
   - **有供應商** → 建立 `Payment(status=INITIATED)`，回傳 `{ paymentRequired: true, paymentId }`
   - **無供應商** → 回傳 `{ paymentRequired: false }`，訂單直接成功
4. **付款表單產生** (`POST /api/orders/[id]/pay`)：前端導向 `(public)/checkout/pay/page.tsx`，呼叫此端點。端點先執行 **Tenant 邊界驗證** 與 **身份驗證**（登入用戶比對 session userId，訪客比對 email 與 `metadata.guestEmail`），再依供應商類型產生付款資料：
   - **ECPay/NewebPay** – 呼叫 `createFormData()`，回傳結構化 `{ actionUrl, fields }` 物件（非 raw HTML，防 XSS）。前端以 hidden `<form>` auto-submit 到閘道。
   - **Stripe** – 呼叫 `createCheckoutSession()`，回傳 `{ redirectUrl }`。前端直接 redirect。
5. **付款回調**：金流服務向 `POST /api/payments/{provider}/notify` 發送交易結果。Route Handler 驗證簽章後更新 `payments.status` 與 `orders.paymentStatus`。針對超商、ATM 付款，須等待實際付款後再更新狀態。
6. **狀態輪詢** (`GET /api/orders/[id]/status`)：付款結果頁 `(public)/checkout/pay/result/page.tsx` 每 2 秒輪詢此端點（最多 10 次）。端點同樣執行 Tenant 邊界 + 身份驗證，回傳 `{ status, paymentStatus }`。訪客需於 query param 帶上 `?email=xxx`。
7. **發票與對帳**：若開立電子發票（ECPay Invoice API），在收到付款成功通知後呼叫發票 API 建立發票。每天批次對帳並更新結算狀態。
8. **庫存更新**：當付款成功後，系統扣減 `products.stock` 或 `product_variants.stock`，若庫存低於安全值發送通知。
9. **通知顧客**：透過 Email 或 Line 通知顧客付款結果與物流資訊。

### 4.4 物流與取件流程

1. **選擇物流方式**：下單時顧客可選「宅配」或「超商取件」。系統依 `shipping_methods` 計算費用與預計到貨日。
2. **建立物流訂單**：當付款成功且需要配送時，BFF 呼叫 `logistics_service.createShipment()` 建立物流訂單並取得追蹤編號。若使用 ECPay 或 NewebPay 物流接口，須傳入店號、收件人資訊、貨件內容等。
3. **出貨與追蹤**：當賣家出貨後更新 `shipping_orders.status` 為 `awaiting_pickup`。物流供應商於包裹到店或配送完成時透過 API 通知，更新狀態與 `tracking_number`。
4. **取件完成**：顧客於超商取件或宅配完成後，系統將 `orders.shipping_status` 更新為 `delivered`，並發送滿意度調查。

### 4.5 內容行銷與部落格流程

1. **創建文章**：店家在後台「部落格」→「新增文章」輸入標題及內容，使用 MDX 編輯器撰寫，並可透過 AI 生成摘要或 FAQ。文章保存在 `blog_posts`。
2. **SEO/AEO 設定**：系統會根據文章內容自動產生 JSON-LD 結構化資料 (FAQPage / Article) 以利搜尋引擎。店家可手動調整 `seo_title`、`seo_description`。
3. **OpenGraph 設定**：文章可設定 `og_title`、`og_description`、`og_image_url`，分享時使用對應 OpenGraph metadata。
4. **發佈與預覽**：文章狀態改為 `published` 後在前端 `/blog/[slug]` 顯示。若店家啟用 GEO（Generative Engine Optimization），可將關鍵問答餵入 AI 向量資料庫供 AI 導購使用。

## 5 金流供應商差異分析

使用多金流供應商可擴大顧客支付選項並降低風險。以下比較三種主要供應商：

| 特性 | **ECPay (綠界)** | **NewebPay (藍新)** | **Stripe** |
|---|---|---|---|
| **定位與市場** | 台灣領先的金流平台，結合支付、物流與電子發票；適合本地電商。提供綜合性服務，簡化商家對接【671184718537388†L19-L24】。 | 另一大型台灣金流，重視快速串接與行動支付整合；提供 LINE Pay 等錢包【276130365608065†L21-L24】。 | 國際化支付平台，支援 100+ 支付方式與 135+ 幣別，具有強大 API 與全球合規工具【183933205365728†L129-L135】【183933205365728†L289-L296】。 |
| **付款方式** | 信用卡、分期、ATM、Web ATM、超商代碼/條碼、Apple Pay、TWQR 等【671184718537388†L60-L80】。 | 信用卡、ATM、超商付款、LINE Pay、Apple Pay、Google Pay、Samsung Pay、台灣 Pay 等【276130365608065†L21-L24】【276130365608065†L60-L79】。 | 信用卡、轉帳、ACH、各地區數位錢包 (Apple Pay、Google Pay)、即時銀行轉帳、Buy Now Pay Later 等超過 100 種支付方法【183933205365728†L289-L296】。 |
| **定期扣款與訂閱** | 支援固定金額與不定期扣款，需使用「定期定額功能」；開發上需自定排程檢查付款結果。 | 提供「授權付款」與「定期定額」機制，可自動化信用卡代扣。 | Stripe Billing 原生支援訂閱與用量計費，提供自動續約、試用、優惠券等功能。 |
| **結算與費率** | 費率約 2–2.75%，款項入帳約 2–3 工作日【671184718537388†L30-L38】。 | 費率約 2.5%，入帳 3–5 工作日【276130365608065†L30-L38】。 | 國際信用卡 2.9% + 固定費；跨境加收 1%～2%；支援 135+ 幣別結算。 |
| **物流與發票服務** | 提供物流 API（宅配與超商取件）與電子發票服務，適合需要整合一條龍服務的店家。 | 亦提供物流 API，但發票需另串電子發票平台。 | 不提供物流與發票，需自搭或串接第三方；但支援全球稅務計算與法規遵循，並具有 AI 風控與 fraud prevention【183933205365728†L289-L304】。 |
| **優勢** | 本地化深度、對接成本低、整合物流發票。 | 支援多錢包與行動支付、介面易整合、亦提供物流。 | 全球覆蓋、API 完整、可跨境快速擴張、多貨幣結算與稅務工具【183933205365728†L289-L296】。 |
| **劣勢** | 主要支援台幣與台灣客群；擴展海外需要其他方案。 | 同樣偏重本地市場，跨境功能有限。 | 手續費較高且需自行處理本地稅務與合規；開發較複雜。 |

透過此比較可知：MVP 階段可優先採用 ECPay 與 NewebPay 滿足台灣市場需求，隨著國際化目標推進，再加入 Stripe。資料庫設計與程式碼需預留 `provider` 欄位與對應設定，以便動態切換金流。

### 5.1 最受歡迎的線上金流服務商分析

除上述台灣本地供應商外，我們也調查了國際社群對線上金流服務商的偏好。以下排名及分析根據 2023–2026 年間 X 平台（原 Twitter）用戶討論，並輔以官方與可信資料來源。分析範疇涵蓋電商、加密貨幣與日常支付場景，著重於用戶評價「最喜歡」或「最佳」的原因。

#### 1. PayPal – 傳統支付首選

* **買家/賣家保護**：PayPal 的 Seller Protection 計畫協助商家減少爭議與退款，保護賣家免於詐欺或非授權交易【386611403270277†L109-L169】。用戶指出該計畫讓他們在網上交易更安心。
* **全球覆蓋**：PayPal 在 200 多個市場提供服務，支援 25 種貨幣轉換【386611403270277†L109-L169】。由於廣泛的接受度及「買現在付以後」等功能，許多人仍將它視為值得信賴的品牌。
* **缺點**：費用偏高且收款流程較繁瑣，但用戶認為可靠性與買家保護仍具吸引力。

#### 2. Stripe – 開發者與 SaaS 業者首選

* **開發者友好**：Stripe 以 API 為核心設計，早期即允許開發者透過少量程式碼整合信用卡支付；其 API 易於擴充並支援 Webhook、Webhook 驗證等功能【160343572599940†L86-L105】。
* **多幣別與多支付方式**：官方支援 100+ 種付款方式與超過 135 種貨幣【183933205365728†L129-L135】【183933205365728†L289-L296】。Stripe Billing 可處理訂閱與用量計費，且提供稅務工具與 fraud radar【183933205365728†L289-L304】。
* **優點**：費率相對合理、資金結算快速，並具備 PCI 合規與自訂化能力。缺點是某些地區尚未開通或偶有服務中斷。

#### 3. Bitget Wallet – 加密支付熱門

* **多支付與卡片整合**：Bitget 推出的 Card Payout 服務支援超過 140 種法定貨幣，使用者可透過 Visa/Mastercard 直接將加密資產轉換為法幣並即時入帳【797658995997481†L34-L45】。
* **P2P 交易與安全托管**：其 P2P 平台支援超過 100 種支付方式（銀行轉帳、電子錢包等）並提供託管保障，確保交易雙方安全【873784467890503†L117-L120】。Bitget 擁有逾一億使用者，服務覆蓋 150 多國【873784467890503†L135-L137】。
* **優點**：低費用、交易即時且自託管，使其在加密圈非常受歡迎；現金回饋與點數機制也提升用戶黏著度。

#### 4. Bybit P2P – 加密點對點交易

* **零手續費與龐大支付選項**：Bybit 的 P2P 交易平台提供零交易費，並支援逾 570 種付款方式與 60 多種法定貨幣【60294187016395†L562-L583】。官方也推 Verified Advertiser 計畫，提高廣告商交易額度與可信度【52718482560121†L42-L65】。
* **安全托管與用戶量**：平台透過嚴格的託管機制鎖定賣家加密貨幣直到交易完成，並鼓勵用戶回報可疑活動【60294187016395†L562-L596】。Bybit 為全球前十大加密交易所之一，擁有約 2000 萬使用者【60294187016395†L591-L596】。
* **受歡迎原因**：結算迅速（5–10 分鐘）、UI 友善且具有高成交率；許多用戶三年來持續使用。

#### 5. Razorpay – 印度市場霸主

* **本地化與高成功率**：Razorpay 提供快速 API 回應、多支付方式（UPI、信用卡、錢包）與高交易成功率，系統可靠且停機時間極低【268493044639119†L145-L218】。
* **優點**：面向印度商戶，費率約 2% 上下，支援國際交易；儀表板功能完善，適合訂閱與企業應用。缺點是主要服務印度市場，對全球商戶吸引力有限。

#### 6. useTria – 新興鏈抽象/自託管支付

* **鏈抽象與自託管卡**：useTria 是一個自託管 neobank 與鏈抽象平台，提供 Visa/Mastercard 卡，接受 150 多個國家，讓用戶可直接以加密資產支付並免除跨鏈橋與礦工費【601216373906275†L19-L45】。
* **BestPath AI 路由**：其「最佳路由層」透過 AI 計算最佳跨鏈支付路徑，支援免 Gas swap、跨鏈質押與 AI 交易【601216373906275†L19-L45】。卡片可獲最高 6% 現金回饋【601216373906275†L19-L45】。
* **優點**：界面簡潔、入門門檻低；提供 0% 手續費試用及 XP 獎勵機制，解決加密到法幣轉換的痛點。

#### 其他值得關注的服務商

* **Binance Pay** – Binance 的支付服務自 2021 年推出後增長迅速；到 2025 年，商家數量從 12,000 成長至逾 2,000 萬，B2C 交易中約 98% 為穩定幣【299176867621234†L164-L185】。總處理金額超過 2,500 億美元，合作商家包含 JW Marriott、KFC 等【299176867621234†L164-L185】。
* **Dodo Payments** – 提供全球 Merchant‑of‑Record 服務，協助商家從 150 多國收款，支援 80 多種貨幣與 30 多種付款方法；結帳頁支援 14 種語言並預先處理稅務合規【810359649666827†L74-L75】【810359649666827†L184-L220】。
* **Whop** – 聚焦創作者與數位商品銷售，採用支付協調 (Payment Orchestration) 演算法讓每筆交易路由至最可能成功的供應商，據稱可提升營收 6–11%【534265452283405†L49-L104】。其收費為 2.7% + $0.30／筆，支援 100+ 支付方式與 BNPL 以及 241 個地區的全球撥款【534265452283405†L49-L104】。
* **PayTM** – 在印度擁有龐大用戶基礎，提供電子錢包與支付網關；以現金回饋與低費用受到青睞。由於主營印度市場，本系統在國際化階段可視需求整合。
* **BTCPay Server** – 自託管的比特幣支付解決方案，適合強調隱私與去中心化的商戶。支援 Lightning Network，手續費極低但需自行管理基礎設施。

#### 總結洞察

* **傳統 vs. 加密** – 傳統供應商如 PayPal、Stripe 的優勢在於買家保護、易用性與全球接受度；加密服務如 Bitget、Bybit、useTria 則靠低費用、即時交易與自託管吸引用戶。隨著加密支付成熟，兩者可能逐步融合。
* **區域差異** – 印度偏好 Razorpay；歐美開發者習慣 Stripe；加密圈則流行 Bitget、Bybit 和 useTria。國際品牌進入台灣市場時，可根據客群需求提供不同付款選項。
* **關鍵驅動因素** – 易用的介面、低手續費、安全托管、快速結算與獎勵機制是吸引用戶的主要因素。用戶對高費用或複雜的整合流程抱怨，這也是新興服務突起的動力。

此分析可作為後續產品路線規劃的參考，協助決定國際金流或加密支付方案的接入順序與優先程度。

## 6 模組規格與 API

以下為各服務模組的功能概要與 API 設計。實作時可依需要微調。

### 6.1 認證與使用者管理

| 功能 | 描述 | 接口與實作 |
|---|---|---|
| 註冊/登入 | 支援 Email/密碼與第三方 OAuth (Google、Facebook、Line)。使用 Auth.js v5 的統一 API `auth()`；提供 `/api/auth/signIn`、`/api/auth/signOut` Route Handler。 | 在 `lib/auth.ts` 設定 providers；在 Middleware 中檢查 Session 是否存在，將 `tenant_id` 與 `role` 注入 context。 |
| 角色與權限 | 使用 `users.role` 欄位 (owner, admin, staff, customer)。在前端透過 HOC 或 middleware 控制路由存取；後端 API 檢查權限。 | 建立 `RBAC` 中介函式，在每個 Server Action/Route Handler 開頭驗證權限。 |
| 密碼重設 & 兩步驟驗證 | 提供忘記密碼流程，生成 token 儲存在 `reset_tokens` 表，寄送重設連結。支持 OTP 或 Email Code 兩步驗證。 | `/api/auth/forgot` 發送重設信；`/api/auth/reset` 驗證 token 並更新密碼。 |
| 多租戶切換 | 允許用戶在不同租戶間切換 (如代理商或擁有多家店)。Session 中將 `activeTenantId` 和 `role` 注入，並根據 `user_tenants` 表的關係決定用戶可切換的租戶列表。 | `POST /api/tenants/switch`：接受 `tenantId`，驗證該用戶是否為該租戶的成員（檢查 `user_tenants`），若合法則在 Session 更新 `activeTenantId`。 |

### 6.2 租戶與店家管理

| 功能 | 描述 | 接口 |
|---|---|---|
| 建立租戶/店家 | 管理員可建立新的 tenant 與對應 shop；設定方案、網址與 logo。 | POST `/api/tenants`：建立 tenant 與預設 shop；回傳 `tenant_id`、`shop_id`。 |
| 方案管理 | 變更訂閱方案 (Seed/Growth/Pro)，控制可用功能，如商品數量、AI 使用額度。 | PATCH `/api/tenants/{id}/plan`；驗證權限與收費邏輯。 |
| 商店設定 | 更新商店基本資訊、時區、貨幣、金流及物流設定 (寫入 `shop.config`、`payment_providers` 等)。 | GET/PUT `/api/shops/{id}`。 |
| 角色管理 | 擁有者可邀請員工 (staff)，設定權限範圍。 | POST `/api/users/invite`；PATCH `/api/users/{id}` 更新角色或停權。 |
| 追蹤設定 | 允許租戶設定 GA4/Meta Pixel/GTＭ 等追蹤代碼。 | GET `/api/tenants/{id}/tracking`；PUT `/api/tenants/{id}/tracking`。 |

### 6.3 商品與庫存服務

| 功能 | 描述 | 接口 |
|---|---|---|
| 商品 CRUD | 新增、編輯、刪除商品；支援批量操作與狀態管理 (draft/published)。 | GET `/api/products` 列出商品 (含搜尋、分頁)；POST `/api/products` 新增；PUT `/api/products/{id}` 更新；DELETE `/api/products/{id}` 軟刪除。 |
| 分類與標籤 | 管理商品分類與標籤；支援多層級分類。 | GET/POST `/api/categories`；PATCH `/api/categories/{id}`；DELETE `/api/categories/{id}`。 |
| 庫存管理 | 監控庫存量，設定安全庫存值，自動通知及補貨。 | 自動任務檢查 `products.stock`；提供 POST `/api/products/{id}/adjust-stock` 作庫存調整。 |
| AI 描述 | 封裝 AI 描述生成與 FAQ 建議；儲存於 `ai_interactions` 以供日後追蹤。 | POST `/api/ai/generate-description`，傳入商品名稱與要素，回傳 Markdown/FAQ；寫入 `ai_interactions`。 |
| OpenGraph | 商品頁與分享需帶入 OpenGraph metadata；可使用商品欄位覆寫預設值。 | `products` 儲存 `og_title`、`og_description`、`og_image_url`；渲染時優先使用商品設定。 |

### 6.4 訂單與支付服務

> **[Synced with codebase: 2026-02-10]** — 完整架構請參閱 [07_Payment_Flow_Architecture](07_Payment_Flow_Architecture.md)。

| 功能 | 描述 | 接口 |
|---|---|---|
| 購物車管理 | 管理購物車項目，支援新增、更新、刪除商品並即時計算總價與庫存。 | POST `/api/carts` 新增；PATCH `/api/carts/[id]` 更新；DELETE `/api/carts/[id]` 刪除；POST `/api/carts/checkout` 結帳。 |
| 建立訂單 | 由購物車產生訂單，計算價格、運費與折扣，生成 `order_no`（UUIDv7）。建單時呼叫 `getDefaultProvider(tenantId)` 決定是否需要付款。 | POST `/api/orders`：回傳 `{ paymentRequired, paymentId }`。 |
| 訂單查詢 | 店家/顧客可依狀態、日期篩選查詢；支援分頁與匯出。 | GET `/api/orders`；支援關鍵字搜尋 (order_no, email)。GET `/api/orders/lookup` 訪客訂單查詢。 |
| 狀態更新 | 更新訂單與付款狀態，如 `paid`、`cancelled`、`refunded`；產生發票與通知。 | PATCH `/api/orders/{id}`；保護此接口僅店家可呼叫。 |
| **付款表單產生** | Tenant 邊界 + 身份驗證後，依供應商產生結構化表單 `{ actionUrl, fields }` 或 Stripe `{ redirectUrl }`。防 XSS（不回傳 raw HTML）。 | POST `/api/orders/[id]/pay`：接收 `{ email?, returnUrl }`。認證：登入用戶 session userId / 訪客 email 比對 `metadata.guestEmail`。 |
| **狀態輪詢** | 輕量端點供付款結果頁輪詢。同樣執行 Tenant 邊界 + 身份驗證。 | GET `/api/orders/[id]/status?email=xxx`：回傳 `{ status, paymentStatus }`。 |
| 金流回調 | 各供應商 notify 端點；驗簽後更新 `payments.status` 與 `orders.paymentStatus`。Webhook 冪等處理。 | POST `/api/payments/{provider}/notify` (provider = ecpay / newebpay / stripe / paypal)。ECPay 回傳 `1\|OK` 純文字，其餘 JSON。 |
| 退款處理 | 支援全額與部分退款，呼叫相應金流 API。 | POST `/api/payments/{id}/refund`；更新狀態並建立退款紀錄。 |

### 6.5 物流服務

| 功能 | 描述 | 接口 |
|---|---|---|
| 建立物流訂單 | 根據顧客地址與物流方式，呼叫不同物流供應商 API 產生托運單，回傳追蹤號碼與標籤。 | POST `/api/logistics/create`，傳入 `order_id`、`shipping_method_id`；回傳 `shipping_order_id`、`tracking_number`。 |
| 追蹤與更新 | 定期查詢物流狀態或接收供應商回調，更新 `shipping_orders.status`。 | GET `/api/logistics/{shipping_order_id}` 查詢；Webhook `/api/logistics/webhook` 處理狀態變更。 |
| 取件店查詢 | 若為超商取件，提供 API 查詢附近門市資訊。 | GET `/api/logistics/stores?provider=ecpay&lat=…&lng=…` 回傳門市列表。 |

### 6.6 內容/部落格服務

| 功能 | 描述 | 接口 |
|---|---|---|
| 文章 CRUD | 新增、修改、刪除與查詢部落格文章；支援草稿、預約發佈。 | GET `/api/blog/posts`；POST `/api/blog/posts`；PUT `/api/blog/posts/{id}`；DELETE `/api/blog/posts/{id}`。 |
| 文章分類與標籤 | 管理文章分類與標籤；支援多層分類與多標籤關聯。 | GET/POST `/api/blog/categories`；GET/POST `/api/blog/tags`。 |
| AEO/GEO Schema | 系統根據文章內容自動生成結構化資料 (FAQPage/Article/HowTo)；也可呼叫 AI 生成常見問題。 | 在保存文章時背景產生 JSON‑LD，儲存於 `blog_posts` 的 `seo_json` 欄位。 |
| OpenGraph | 文章與分享頁面需帶入 OpenGraph metadata；優先使用文章欄位覆寫預設值。 | `blog_posts` 儲存 `og_title`、`og_description`、`og_image_url`。 |

### 6.7 AI 服務

| 功能 | 描述 | 接口 |
|---|---|---|
| 商品描述生成 | 透過 OpenAI 或自建模型產生商品介紹、賣點與 FAQ。 | POST `/api/ai/generate-description`。 |
| 導購聊天 | 建立嵌入式聊天元件，使用向量資料庫檢索與 RAG 模型回答顧客提問。 | WebSocket `/api/ai/chat` 或 HTTP SSE；將用戶問題向量化，檢索商品與文章資料庫後生成回答。 |
| 銷售預測 | 統計歷史訂單與行為資料，使用 ML 模型預測熱銷產品與需求。 | POST `/api/ai/sales-forecast`；回傳預測趨勢圖表資料。 |

### 6.8 分析與報表

| 功能 | 描述 | 接口 |
|---|---|---|
| 儀表板 | 顯示營收、客戶數、訂單狀態分布、熱門商品等 KPI。 | GET `/api/analytics/dashboard`；返回各指標數據，前端使用 Chart.js 或 shadcn 表格呈現。 |
| 事件追蹤 | 將顧客行為 (點擊、搜尋、加入購物車) 寫入 `analytics_events` 或外部事件系統；定期 ETL 至 ClickHouse。 | 使用前端埋點 SDK 發送事件到 `/api/analytics/event`。 |
| AI 貢獻報告 | 計算 AI 功能對銷售的影響，如使用 AI 描述後銷售提升百分比。 | GET `/api/analytics/ai-impact`；跨表分析 `ai_interactions` 與 `orders`。
| 追蹤設定 | 每個租戶可設定 GA4/Meta Pixel/GTＭ。 | GET `/api/tenants/{id}/tracking` 讀取；PUT `/api/tenants/{id}/tracking` 更新。 |

### 6.8.1 UCP Agentic Commerce 服務

> **[Synced with codebase: 2026-02-10]** — 完整改造計畫請參閱 [06_UCP_Google_Alignment_Plan](06_UCP_Google_Alignment_Plan.md)。

UCP (Universal Commerce Protocol) 實作 Agentic Commerce 協議，允許外部 AI Agent（如 Google Shopping Agent）直接發現商品並進行結帳。採用 **雙軌路由 + 共享 Handler** 架構。

| 功能 | 描述 | 接口 |
|---|---|---|
| UCP Profile | Google 標準化 Profile 端點，聲明支援的 capabilities。 | GET `/.well-known/ucp/profile.json`；GET `/.well-known/merchant-api/ucp/profile.json`（備用路徑）。 |
| Checkout Session | 建立/讀取/更新 Checkout Session；更新時自動重算動態運費。 | POST/GET `/api/ucp/v1/checkout-sessions`；GET/PUT `/api/ucp/v1/checkout-sessions/{id}`。 |
| 完成結帳 | 從 Session 建立實際訂單。 | POST `/api/ucp/v1/checkout-sessions/{id}/complete`。 |
| 訂單查詢 | 查詢 UCP 產生的訂單。 | GET `/api/ucp/v1/orders/{orderId}`。 |
| 商品庫存 | 批量查詢商品可用庫存。 | POST `/api/ucp/v1/products/availability`。 |
| 訂單回調 | 接收訂單生命週期動作（CANCEL, REFUND, RETURN）。使用 HMAC 簽名驗證，指數退避重試。 | POST `/api/ucp/v1/callbacks/orders`。 |
| UCP 指標 | UCP 服務指標收集。 | GET `/api/ucp/v1/metrics`。 |
| 舊路由 | `/api/ucp/profile`、`/api/ucp/checkout-sessions`、`/api/ucp/orders` 等。加 `Deprecation`/`Sunset`/`Link` headers；Sunset: 2026-05-31。 | 同路徑但不帶 `/v1/`。 |

核心模組位於 `lib/ucp/`：handlers（checkout、orders、shipping、callbacks、profile）、adapters/google.ts（schema 轉換）、middleware.ts（API Key 驗證）、deprecation.ts。

### 6.9 API 回應與錯誤格式

為統一前後端溝通格式，本系統所有 API 回傳皆採用統一的 JSON 物件。成功回應包含 `success` 旗標與資料區塊：

```json
{
  "success": true,
  "data": { /* object or array */ },
  "message": "" // 非必要，說明成功訊息
}
```

失敗回應則包含 `success=false` 與 `error` 物件：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT", // 錯誤代號
    "message": "名稱不得為空"
  }
}
```

常見錯誤代號與對應 HTTP 狀態如下：

| 錯誤代號 | HTTP 狀態 | 說明 |
|---|---|---|
| `INVALID_INPUT` | 400 | 請求欄位缺失或格式錯誤 |
| `TENANT_NOT_FOUND` | 400 | 無法從 request host 解析租戶 [Inferred from code] |
| `EMAIL_REQUIRED` | 400 | 訪客訂單付款需提供電子郵件 [Inferred from code] |
| `NO_PROVIDER` | 400 | 租戶未設定金流供應商 [Inferred from code] |
| `UNAUTHORIZED` | 401 | 未登入或 Session 過期 |
| `FORBIDDEN` | 403 | 權限不足（含跨租戶、userId 不匹配、email 不匹配）|
| `NOT_FOUND` | 404 | 資源不存在（含跨租戶查詢回傳 404 防止列舉）|
| `ALREADY_PAID` | 409 | 訂單已付款，不可重複付款 [Inferred from code] |
| `CONFLICT` | 409 | 資源衝突，例如 Email 已存在 |
| `RATE_LIMITED` | 429 | 呼叫頻率過高 |
| `INTERNAL_ERROR` | 500 | 伺服器內部錯誤 |

Webhook 端點由於供應商要求，成功回應應回傳純文字 `OK` 或 HTTP 200；失敗回應回傳 400。所有錯誤應寫入集中式日誌並在必要時通知開發人員。

### 6.10 租戶計費與使用量

為支援多租戶的訂閱、抽成與使用量管理，本系統提供專屬的計費與用量模組。相關資料表包括 `tenant_billing_accounts`、`tenant_invoices`、`tenant_usage_metrics` 以及 `tenant_api_limits`。這些資料表為計費與限制機制提供數據來源。功能與 API 如下：

| 功能 | 描述 | 接口 |
|---|---|---|
| **顯示租戶計費資訊** | 管理員可以查詢租戶目前方案、下一次帳單日、付款方式與收費紀錄。 | `GET /api/tenants/{id}/billing`：回傳計費方案、付款方式與下一次收費日期；`GET /api/tenants/{id}/invoices`：列出歷史發票與狀態。 |
| **變更方案與付款方式** | 店主可升級或降級方案，並更新信用卡或銀行帳戶。系統於變更時驗證功能限制與合約條款。 | `PATCH /api/tenants/{id}/billing`：接受 `plan`、`billingMethod` 等欄位，更新 `tenant_billing_accounts` 後返回新的計費週期與費率。 |
| **監控使用量** | 系統背景任務會定期收集 AI token 用量、儲存空間、API 呼叫次數與訂單數量等指標，寫入 `tenant_usage_metrics`；當超出配額時發送通知。 | `GET /api/tenants/{id}/usage?period=monthly`：查詢指定期間內的使用量統計；背景任務每天或每小時計算並更新資料。 |
| **設定 API/AI 限額** | 管理員可為不同方案設定最大 API 請求、AI token 或儲存空間配額。服務層於處理每個請求時檢查 `tenant_api_limits`，防止濫用。 | 管理介面更新 `tenant_api_limits`；當用量超過限額時，API 應返回 429 或自訂 `USAGE_LIMIT_EXCEEDED` 錯誤並引導使用者升級方案。 |
| **刪除租戶與資料保留** | 當商家退租或帳戶取消時，平台會軟刪除租戶並保留資料 90 天，以利帳務結算與法律遵循。過期後自動清理資料並吊銷金流憑證。 | `DELETE /api/tenants/{id}`：標記 `tenants.status = suspended` 並設定刪除計畫；背景排程於保留期後移除相關資料與憑證。 |

此模組需與金流服務、訂單服務與分析服務協同運作，以計算平台抽成與 AI 抽成。Rate limit 與配額檢查應於每個 API Route Handler 或 Service 層實作，若超出配額則返回 429 (TOO MANY REQUESTS) 或自定義錯誤碼。計費邏輯需跨表統計 `payments`、`orders`、`ai_attributions` 與 `tenant_usage_metrics`，確保帳單準確且對應抽成比例。
## 7 UI/UX 設計指南

本專案採用 **shadcn/ui** 作為基礎元件庫。其優點包含高度可定製與多種視覺風格【400228359130043†L131-L158】。設計重點如下：

1. **風格選擇** – 使用 CLI (`npx shadcn create`) 選擇與品牌相符的風格，例如 Nova (清爽)、Maia (圓潤)。五種風格提供不同間距與圓角【400228359130043†L145-L152】。
2. **行動優先** – 許多店家將透過手機管理商店，介面應支援響應式設計。Tailwind 配合 shadcn 可輕鬆實現斷點樣式。表單應簡潔，利用步驟導覽 (Stepper) 分段輸入。
3. **一致性與模組化** – 將常用元件抽離於 `components/ui`，避免跨模組重複。透過 `slots` 自訂樣式並留有可擴充空間。
4. **可取用性 (Accessibility)** – 使用 Radix 或 Base UI 支援的可取用功能，如鍵盤導航、ARIA 屬性。確保對比度充足、文字大小可調整。
5. **深色/淺色模式** – shadcn 支援主題切換，建議提供淺色與深色模式，且遵循系統設定自動切換。
6. **AI 互動介面** – AI 生成按鈕應有明顯提示，輸出區域採用 Markdown Viewer。聊天導購介面採泡泡式對話框，並提供評價機制收集使用者反饋。

## 8 安全性與隱私

* **HTTPS 與資料加密** – 所有傳輸皆使用 TLS；敏感資料 (金流密鑰、密碼) 加密儲存。Stripe/ECPay 密鑰放置於環境變數或密鑰管理服務。
* **CSRF/XSS/SQL 注入防護** – 採用 Next.js 的 `proxy.ts` 及內建 CSRF 保護機制。使用 ORM (Prisma/Drizzle) 並嚴格綁定查詢參數。前端表單輸入需透過內建 sanitizer 處理。
* **權限與最小授權** – 僅允許授權人員存取後台 API；對敏感操作（退款、刪除）進行二次驗證或審批。使用 `audit_logs` 記錄所有變更。
* **GDPR/個資法遵循** – 顧客資料 (姓名、地址、電話) 僅用於履約，不得向未授權第三方揭露；提供帳號刪除與資料匯出功能。對於國際用戶應遵守當地隱私法規。
* **Webhook 驗證** – 收到金流或物流供應商的 webhook 時，需驗證簽章或 token，並建立重試與冪等機制，確保訂單狀態不會重複更新。

## 9 部署、擴展與維運

* **部署策略** – 前端與 BFF 可以部署於 Vercel 或 Fly.io，利用 Next.js Edge Functions 縮短延遲。後端微服務部署於 AWS ECS/Fargate 或 Google Cloud Run，支援自動擴展。
* **CI/CD** – 使用 GitHub Actions 執行測試、型別檢查與自動部署。配置 `.env.production` 於 CI 期間注入金流密鑰與資料庫連線字串。
* **日誌與監控** – 整合集中式日誌 (Axiom、Grafana Loki) 與監控 (Prometheus)。Next.js DevTools MCP 可提供快取與渲染狀態，用於排查效能瓶頸。設置各微服務的健康檢查與警報。
* **資料備份與災難復原** – PostgreSQL 使用雲端供應商的備份機制，定期備份並測試還原流程。物件儲存 (如 R2) 亦需版本化與備份。
* **擴展性考量** – 設計 API 時保留版本號 (/api/v1/…)，當新增國際金流或新功能時可不影響現有客戶。功能旗標 (feature_flags) 能讓您控制逐步開啟。

## 10 結論

本系統架構書與資料庫設計旨在協助 AIsell 建立一套可擴充、易維護且符合商業目標的 SaaS 平台。Next.js 16 的部分預渲染 (Cache Components) 與 Turbopack 帶來卓越效能；shadcn/ui 提供高度可定製的介面，能因應不同品牌風格【400228359130043†L131-L158】【400228359130043†L145-L152】；Auth.js v5 統一了認證接口並支援 App Router【621711268477576†L214-L229】。透過細緻的資料庫設計、多租戶安全機制與模組化服務，我們能在 MVP 階段快速推出產品，並預留日後國際化與 AI 深度整合的空間。台灣本地金流 (ECPay、NewebPay) 與國際金流 (Stripe) 的差異也已納入設計，確保隨著業務擴張能靈活切換。隨著市場與技術進步，建議持續關注 Next.js 及金流供應商的更新並調整架構，以維持競爭力。
