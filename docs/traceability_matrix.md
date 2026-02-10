# Traceability Matrix

## Overview
This matrix maps User Stories and Requirements from the PRD to Technical Components in the System Analysis and Modules in the Program Specs.

| User Story / Requirement | PRD Reference | SA Component | Program Spec Module | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Store Management** | | | | | |
| Quick Product Listing | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | `products` table | Product Module | ✅ Implemented | CRUD + variants + assets + categories |
| AI Product Description | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | AI Service | AI Service Module | ✅ Implemented | `POST /api/ai/generate-description` |
| Order Management | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | `orders` table | Order Module | ✅ Implemented | 含訪客結帳 (Guest Checkout) |
| Shopping Cart | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | `carts` table | Order Module | ✅ Implemented | GET/POST/DELETE |
| **Operations** | | | | | |
| AI Shopping Assistant | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.2 | AI Service (Chat) | AI Service Module | ✅ Implemented | `POST /api/ai/chat` |
| AI Sales Forecast | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.2 | AI Service | AI Service Module | ❌ Not Started | 規格定義 `POST /api/ai/sales-forecast`，路由尚未建立 |
| **Marketing** | | | | | |
| Social Sharing | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.3 | OpenGraph Support | Content Module | ⚠️ Partial | OG 欄位存在但前台渲染未完整 |
| AEO Blog | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.3 | Blog Service | Content Module | ✅ Implemented | Posts CRUD + Categories CRUD + Tags |
| **Payment & Logistics** | | | | | |
| 動態金流選擇 | [07_Payment_Flow](02_System_Analysis/07_Payment_Flow_Architecture.md) | Payment Service | Payment Module | ✅ Implemented | `getDefaultProvider()` 依 tenant 自動選用預設供應商 |
| 訪客付款流程 | [07_Payment_Flow](02_System_Analysis/07_Payment_Flow_Architecture.md)#4 | Payment Service | Payment Module | ✅ Implemented | email 驗證 + tenant 邊界；17 個安全測試 |
| 付款表單產生 | [07_Payment_Flow](02_System_Analysis/07_Payment_Flow_Architecture.md)#6 | Payment Service | Payment Module | ✅ Implemented | `POST /api/orders/[id]/pay` — 結構化 `{actionUrl, fields}` |
| 付款狀態輪詢 | [07_Payment_Flow](02_System_Analysis/07_Payment_Flow_Architecture.md)#6 | Payment Service | Payment Module | ✅ Implemented | `GET /api/orders/[id]/status` — tenant + 身份驗證 |
| ECPay 金流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ✅ Implemented | `createFormData()` + notify webhook |
| NewebPay 金流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ✅ Implemented | `createFormData()` + notify webhook |
| Stripe 金流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ✅ Implemented | Checkout Session + notify webhook |
| PayPal 金流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ✅ Implemented | 含 notify webhook |
| 退款 (非 Stripe) | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ⚠️ Partial | 路由存在但供應商 API 呼叫為 TODO |
| ECPay 物流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | Logistics Service | Logistics Module | ✅ Implemented | 含 webhook |
| 物流門市選擇回寫 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | Logistics Service | Logistics Module | ⚠️ Partial | 路由存在但 session 回寫為 TODO |
| **Billing** | | | | | |
| Freemium Pricing | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.1 | Tenant Billing | Tenant Module | ✅ Implemented | Seed/Growth/Pro 定價已統一 (0/500/1500 NTD) |
| AI Commission (CPS) | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.2 | `ai_attributions` | Analytics Module | ⚠️ Partial | Schema 存在，歸因邏輯未完整 |
| 發票對帳自動化 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Invoice Service | Tenant Module | ⚠️ Partial | `invoice-reconciliation.ts` 大量 TODO |
| **Infrastructure** | | | | | |
| withAuth RBAC | Spec#認證 | Auth Middleware | Auth Module | ⚠️ Partial | 已遷移 products/orders/refund，其餘路由待遷移 |
| Tenant 解析 | [05_Single_Tenant](02_System_Analysis/05_Single_Tenant_Single_Shop.md) | Tenant Resolver | Auth Module | ✅ Implemented | `resolveTenantFromRequest()` — hostname/subdomain/custom domain |
| Single Tenant Single Shop | [05_Single_Tenant](02_System_Analysis/05_Single_Tenant_Single_Shop.md) | DB `@@unique([tenantId])` | Auth Module | ✅ Implemented | ADR 已執行；含 8 個 enforcement 測試 |
| Analytics Dashboard | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | Analytics Service | Analytics Module | ⚠️ Partial | 路由存在但 ClickHouse/BigQuery 尚未整合 |
| 背景排程 (Cron) | Spec#背景作業 | Cron Service | Background Jobs | ✅ Implemented | `/api/cron/hourly`, `/api/cron/daily` |
| **Agentic Commerce (UCP)** | | | | | |
| UCP Profile (Google v1) | [06_UCP_Plan](02_System_Analysis/06_UCP_Google_Alignment_Plan.md) | UCP Service | UCP Module | ✅ Implemented | `/.well-known/ucp/profile.json` |
| UCP Checkout (Google v1) | [06_UCP_Plan](02_System_Analysis/06_UCP_Google_Alignment_Plan.md) | UCP Service | UCP Module | ✅ Implemented | `/api/ucp/v1/checkout-sessions` CRUD + complete |
| UCP Orders (Google v1) | [06_UCP_Plan](02_System_Analysis/06_UCP_Google_Alignment_Plan.md) | UCP Service | UCP Module | ✅ Implemented | `/api/ucp/v1/orders/[orderId]` |
| UCP Shipping Engine | [06_UCP_Plan](02_System_Analysis/06_UCP_Google_Alignment_Plan.md) | UCP Handlers | UCP Module | ✅ Implemented | 動態運費計算 via `lib/ucp/handlers/shipping.ts` |
| UCP Callbacks | [06_UCP_Plan](02_System_Analysis/06_UCP_Google_Alignment_Plan.md) | UCP Handlers | UCP Module | ✅ Implemented | HMAC 簽名、指數退避重試 |
| UCP 舊路由 Deprecation | [06_UCP_Plan](02_System_Analysis/06_UCP_Google_Alignment_Plan.md) | UCP Service | UCP Module | ✅ Implemented | Sunset: 2026-05-31 |
| **Foundation** | | | | | |
| File Management | SA#File | File Service | File Module | ✅ Implemented | `/api/files` (S3/R2/Blob) |

## Test Coverage Mapping

| Test Suite | 路徑 | 測試數 | 涵蓋範圍 |
| :--- | :--- | :--- | :--- |
| Payment Endpoints | `tests/api/payment-endpoints.test.ts` | 17 | pay/status 端點安全（tenant 邊界、跨租戶、guest email、session userId、重複付款） |
| UCP v1 Handlers | `tests/api/ucp-v1-handlers.test.ts` | 23 | Money utils、Google adapter、shipping engine、callback HMAC/retry、checkout 更新 |
| UCP v1 E2E | `tests/api/ucp-v1-e2e.test.ts` | — | UCP 端到端流程 |
| Single Shop Enforcement | `tests/api/single-shop-enforcement.test.ts` | — | 單店制 DB/API 約束 |
| Single Shop Handlers | `tests/api/single-shop-handlers.test.ts` | — | 單店制 handler 邏輯 |
| Tenant Isolation | `tests/api/tenant-isolation.test.ts` | — | 多租戶隔離 |
| Tenant Resolver | `tests/lib/tenant/resolve-tenant.test.ts` | — | hostname → tenant 解析邏輯 |
| Utils | `tests/lib/utils.test.ts` | — | 公用工具函式 |

> **總測試數**: 94+ tests across 8 suites（截至 2026-02-10）

## File Mapping

| Phase | Original File | New Location |
| :--- | :--- | :--- |
| **PRD** | `PRD/小賣店AI賦能SaaS產品設計文件.md` | `docs/01_Product_Requirements/01_PRD_Main.md` |
| **PRD** | `PRD/小賣店線上商店 SaaS 可行性分析報告.md` | `docs/01_Product_Requirements/02_Feasibility_Analysis.md` |
| **SA** | `specs/system_spec_detailed.md` | `docs/02_System_Analysis/01_System_Architecture.md` |
| **SA** | `specs/report.md` | `docs/02_System_Analysis/04_Tech_Stack_Analysis.md` |
| **SA** | (ADR) | `docs/02_System_Analysis/05_Single_Tenant_Single_Shop.md` |
| **SA** | (新增) | `docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md` |
| **SA** | (新增) [Inferred from code] | `docs/02_System_Analysis/07_Payment_Flow_Architecture.md` |
| **Specs** | `specs/program_spec.md` | `docs/03_Program_Specifications/01_Program_Specs.md` |

