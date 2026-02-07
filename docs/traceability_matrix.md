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
| ECPay 金流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ✅ Implemented | 含 notify webhook |
| NewebPay 金流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ✅ Implemented | 含 notify webhook |
| Stripe 金流 | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#3.3 | Payment Service | Payment Module | ✅ Implemented | 含 notify webhook |
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
| Analytics Dashboard | [01_PRD_Main.md](01_Product_Requirements/01_PRD_Main.md)#2.1 | Analytics Service | Analytics Module | ⚠️ Partial | 路由存在但 ClickHouse/BigQuery 尚未整合 |
| 背景排程 (Cron) | Spec#背景作業 | Cron Service | Background Jobs | ✅ Implemented | `/api/cron/hourly`, `/api/cron/daily` |
| **Agentic Commerce** | | | | | |
| UCP Discovery | SA#UCP | UCP Service | UCP Module | ✅ Implemented | `/api/ucp/discovery` |
| UCP Checkout | SA#UCP | UCP Service | UCP Module | ✅ Implemented | `/api/ucp/sessions` |
| **Foundation** | | | | | |
| File Management | SA#File | File Service | File Module | ✅ Implemented | `/api/files` (S3/R2/Blob) |

## File Mapping

| Phase | Original File | New Location |
| :--- | :--- | :--- |
| **PRD** | `PRD/小賣店AI賦能SaaS產品設計文件.md` | `docs/01_Product_Requirements/01_PRD_Main.md` |
| **PRD** | `PRD/小賣店線上商店 SaaS 可行性分析報告.md` | `docs/01_Product_Requirements/02_Feasibility_Analysis.md` |
| **SA** | `specs/system_spec_detailed.md` | `docs/02_System_Analysis/01_System_Architecture.md` |
| **SA** | `specs/report.md` | `docs/02_System_Analysis/04_Tech_Stack_Analysis.md` |
| **Specs** | `specs/program_spec.md` | `docs/03_Program_Specifications/01_Program_Specs.md` |

