# AIsell 測試計畫

## 目錄

1. [目標與範圍](#目標與範圍)
2. [測試類型](#測試類型)
3. [測試環境](#測試環境)
4. [測試策略與方法](#測試策略與方法)
5. [模組測試計畫](#模組測試計畫)
6. [測試資料與基礎設置](#測試資料與基礎設置)
7. [缺陷管理與品質指標](#缺陷管理與品質指標)
8. [交付物與里程碑](#交付物與里程碑)

## 目標與範圍

此測試計畫旨在確保 AIsell 於功能、性能、安全與使用者體驗各方面達到上市標準，涵蓋所有 MVP 與後續擴展功能。測試對象包括：前端介面、後端 API、第三方金流/物流集成、AI 功能、資料庫操作與背景作業。

本計畫不涵蓋第三方服務本身的功能正確性（如 Stripe 的付款流程），但會驗證與之整合的邏輯與資料處理。

## 測試類型

1. **單元測試 (Unit)** – 驗證單一函式或元件的正確性，涵蓋常用路徑、錯誤路徑與邊界條件。
2. **整合測試 (Integration)** – 驗證不同模組之間的交互，如金流與訂單狀態同步、AI 服務調用與資料庫寫入。
3. **端到端測試 (E2E)** – 模擬實際使用者流程，從登入到下單、付款、出貨、查看報表；使用瀏覽器自動化工具運行。
4. **回歸測試 (Regression)** – 在每次迭代後重新執行關鍵測試，確保新增功能未破壞既有功能。
5. **安全測試** – 包括 OWASP Top 10 測試、CSRF/XSS 等漏洞掃描與滲透測試；驗證權限控制與敏感資料保護。
6. **性能測試** – 包括負載測試、壓力測試與穩定性測試，評估系統在高併發與大量資料下的表現。
7. **可用性測試** – 針對 UI/UX 進行用戶測試，評估介面易用性、無障礙性及行動裝置友好度。

## 測試環境

測試環境分為以下幾類：

* **開發環境** – 開發者本地環境，用於執行單元測試。
* **整合環境 (Staging)** – 仿真與生產環境相同的配置，包含資料庫、副本、金流與物流測試帳號；用於整合與 E2E 測試。
* **性能環境** – 部署與生產一致，獨立用於負載/壓力測試，以免影響其他測試。

環境配置信息（例如資料庫版本、金流測試帳號）需紀錄於專案維運文檔中。

## 測試策略與方法

* **測試早期介入**：SA、QA 與 Programmer 在需求評審階段即參與，理解使用者故事並撰寫驗收標準。
* **自動化優先**：單元測試與整合測試採用 Jest、Vitest、supertest 等執行；E2E 測試採用 Playwright 並與 CI/CD 整合，自動在每次合併後運行。
* **端點覆蓋率分析**：採用 Istanbul/Coveralls 分析測試覆蓋率，目標單元覆蓋率 ≥ 80%。
* **數據隔離**：測試使用獨立資料庫或資料庫 schema；測試完成後重置資料，避免污染。
* **可重複性**：測試腳本獨立，不依賴外部狀態，確保每次執行結果一致。

## 模組測試計畫

### 認證與使用者模組

* **US01 註冊流程測試**：
  - 驗證合法輸入能成功註冊並收到驗證信。
  - 驗證重複 email/不符合格式會返回適當錯誤。
  - 驗證註冊後資料表 `users`, `tenants`, `shops` 正確寫入。
* **登入與 Session 測試**：
  - 正確帳號密碼登入成功，返回 session cookie；錯誤密碼返回 401。
  - OAuth provider 登入能在 callback 處建立用戶並載入 session。
  - Session 過期後訪問受保護頁面應返回 401，未授權角色訪問應返回 403。
* **忘記/重設密碼**：
  - 提交存在 email 應發送重設信；不存在 email 返回 404。
  - 提交正確 token 能更新密碼；錯誤或過期 token 返回 400。

### 商品管理模組

* **CRUD 測試**：
  - 建立商品時必填欄位缺失應 400；合法時應在 `products` 與相關表建立記錄。
  - 更新商品時只允許修改可編輯欄位；若修改受限制欄位應返回 403 或 422。
  - 刪除商品應僅軟刪除，資料仍在 DB。列表 API 不應返回已刪除商品。
* **AI 描述生成測試**：
  - 呼叫 `POST /api/ai/generate-description` 傳入商品名稱應返回 Markdown 描述與 FAQ；檢查 `ai_interactions` 表是否存有 prompt/response。
  - 模擬 AI 服務故障應返回 500 並呈現友好錯誤訊息。

### 訂單與購物車模組

* **購物車行為**：
  - 新增商品到購物車，若庫存不足應阻止；若存在同商品則累加數量。
  - 更新或刪除購物車項目後，總額計算應正確；空購物車不應生成訂單。
* **建立訂單**：
  - 正常流程應建立 `orders`, `order_items`, `addresses` 記錄；訂單編號唯一且格式正確。
  - 測試不同配送與付款方式下訂單金額的計算（運費、稅費、折扣）。
* **狀態流轉**：
  - 通過 webhook 更新付款狀態後，訂單狀態應從 `pending` → `paid`；金流回調多次不得重複扣款。
  - 測試取消訂單流程是否退回庫存。

### 金流模組

* **動態供應商選擇** [Inferred from code]：
  - 呼叫 `getDefaultProvider(tenantId)` 應優先回傳 `isDefault=true` 的供應商；無供應商時回傳 `null`。
  - `POST /api/orders` 無供應商時應回傳 `paymentRequired: false`。

* **付款表單產生 (`POST /api/orders/[id]/pay`)** [Inferred from code]：
  - ECPay/NewebPay 應回傳 `{ actionUrl, fields }` 結構化表單資料（非 raw HTML）。
  - Stripe 應回傳 `{ redirectUrl }`。
  - 已付款訂單應回傳 409 `ALREADY_PAID`。

* **安全端點測試** [Inferred from code]（`tests/api/payment-endpoints.test.ts`, 17 tests）：
  - Tenant 邊界：無法解析 tenant → 400；跨租戶訂單 → 404。
  - 訪客驗證：缺少 email → 400；email 不匹配 → 403；email 匹配 → 200（大小寫不敏感）。
  - 登入用戶驗證：userId 不匹配 → 403；userId 匹配 → 200；未登入 → 403。
  - 無法辨識身份的訂單 → 403。

* **供應商參數驗證**：錯誤的參數應返回錯誤；成功建立交易後檢查回傳資料格式。
* **webhook 驗證**：模擬供應商送出簽名錯誤的通知應被拒絕；成功的通知應更新 `payments.status` 與 `orders.paymentStatus`。
* **退款流程**：部分或全額退款後應記錄於 `payments`，並更新訂單狀態為 `refunded`。

### 租戶與計費模組

隨著系統轉向多租戶架構，需驗證帳務與配額機制運行正確：

* **Tenant 切換與資料隔離測試**：
  - 登入具有多租戶權限的使用者，呼叫 `POST /api/tenants/switch` 切換至其他租戶，確認 Session 中 `activeTenantId` 更新，且後續 API 查詢僅回傳該租戶資料。
  - 嘗試切換至未授權的租戶應返回 403；傳入不存在的租戶 ID 應返回 404。
  - 切換後應保留原角色權限 (owner/admin/staff)，並驗證不同角色的存取權限。

* **計費資訊查詢測試**：
  - 建立範例 `tenant_billing_accounts`、`tenant_invoices` 與 `tenant_usage_metrics` 資料；呼叫 `GET /api/tenants/{id}/billing` 應返回正確方案名稱、付款方式與下一帳單日；`GET /api/tenants/{id}/invoices` 應按日期排序返回發票清單。
  - 測試不同方案 (Seed/Growth/Pro) 的功能限制是否正確傳回，例如商品數量限制或 AI token 額度。

* **方案變更與限額測試**：
  - 呼叫 `PATCH /api/tenants/{id}/billing` 變更方案；升級應立即更新配額限制並產生新的發票；降級時若資料超出限制 (如商品數、AI token 用量) 應返回 422。
  - 模擬大量 API 呼叫與 AI 生成請求，當超出 `tenant_api_limits` 配額時相關 API 應返回 429 或自定義 `USAGE_LIMIT_EXCEEDED`；`tenant_usage_metrics` 應記錄實際用量。
  - 變更付款方式時驗證欄位格式正確；若金流平台回報失敗，API 應返回 400 或 500 並記錄錯誤。

* **租戶刪除流程測試**：
  - 呼叫 `DELETE /api/tenants/{id}` 應將租戶狀態標記為 suspended 並停止金流憑證；再次查詢該租戶資料應返回 404 或 410。
  - 模擬保留期間結束後的背景任務，應移除該租戶關聯資料 (訂單、商品、使用量紀錄等) 並撤銷金流憑證；確認資料庫無殘留且無法再進行請求。


* **供應商參數驗證**：錯誤的參數應返回錯誤；成功建立交易後檢查回傳資料格式。
* **webhook 驗證**：模擬供應商送出簽名錯誤的通知應被拒絕；成功的通知應更新 `payments.status` 與 `orders.paymentStatus`。
* **退款流程**：部分或全額退款後應記錄於 `payments`，並更新訂單狀態為 `refunded`。

### 物流模組

* **建立物流單**：建立宅配/取件訂單後應回傳追蹤號碼；若資料不完整 (缺地址) 應錯誤。
* **狀態回調**：模擬物流供應商更新狀態；系統應對應狀態流轉並通知使用者。

### 內容/部落格模組

* **文章 CRUD**：新增/編輯/刪除文章；檢查 `blog_posts` 的 `status` 與 `published_at` 正確；Draft 不應出現在前台。
* **SEO 產生**：發佈文章後應自動生成 JSON‑LD；檢查 `seo_json` 是否包含正確的 `@type`、`headline`、`mainEntity` 等欄位。
* **OpenGraph**：文章頁與分享預覽需包含 `og:title`、`og:description`、`og:image`；若文章有 `og_*` 欄位則優先使用。
* **OpenGraph (商品)**：商品頁與分享預覽需包含 `og:title`、`og:description`、`og:image`；若商品有 `og_*` 欄位則優先使用。

### AI 服務模組

* **導購聊天**：模擬多輪對話；確認回答引用正確產品與部落格內容，並對不相關問題返回適當提示。
* **預測模型**：測試預測 API 回傳的資料格式與範圍；檢查輸入錯誤處理。

### 分析與報表模組

* **事件追蹤**：前端觸發事件應寫入 `analytics_events`；檢查資料完整性 (sessionId, eventName)。
* **追蹤設定**：租戶可設定 GA4/Meta Pixel；切換不同租戶時不得使用到其他租戶的追蹤 ID。
* **儀表板 API**：傳入不同日期區間應返回正確的營收、訂單數、熱門商品列表；邊界條件（無資料）應返回 0 或空陣列。

## 測試資料與基礎設置

* **測試帳號**：建立多個租戶與不同角色（owner, admin, staff, customer）的帳號，以便測試權限。
* **金流測試金鑰**：使用各供應商提供的 Sandbox Key/ID；請勿在測試環境使用正式金鑰。
* **預設商品/文章**：建立幾個商品和文章用於測試搜尋與關聯。
* **模擬外部服務**：對金流、物流、AI 服務使用 mock server 或 stub，控制回應內容與失敗情況。

測試資料應隨測試腳本自動生成並於結束後清理。

## 缺陷管理與品質指標

* **缺陷提交**：所有測試缺陷透過 Jira 或 Bug Tracker 提交，需包含重現步驟、期望結果與實際結果、截圖/日誌。
* **優先級分類**：按嚴重度分為 Critical、High、Medium、Low；團隊在 Sprint Planning 中決定修復優先級。
* **品質指標**：
  - 測試覆蓋率目標 ≥ 80% (單元與整合)。
  - 迭代後 Critical/High 缺陷需在下個迭代前修復。
  - 平均回歸缺陷率 < 10%。
  - 性能測試：在 95 百分位下 API 平均響應時間 < 300 ms；頁面 First Contentful Paint < 2 秒。

## 交付物與里程碑

* **測試計畫**：本文件，於專案啟動後完稿。
* **測試案例庫**：包含詳細 Test Cases、Test Scripts，用於自動化測試。
* **測試報告**：每個 Sprint 結束後提交測試執行報告，包含通過率、缺陷統計與改進建議。
* **最終驗收報告**：系統上線前，整合所有測試結果並出具簽核檔。

## 已實作測試套件 [Inferred from code]

> 截至 2026-02-10，專案共有 **94+ 測試案例**，分布於 **8 個測試套件**。

| 測試套件 | 檔案路徑 | 測試數 | 類型 | 涵蓋範圍 |
|---|---|---|---|---|
| **Payment Endpoints** | `tests/api/payment-endpoints.test.ts` | 17 | 整合/安全 | pay/status 端點：tenant 邊界、跨租戶、guest email 驗證、session userId、重複付款、orphan orders |
| **UCP v1 Handlers** | `tests/api/ucp-v1-handlers.test.ts` | 23 | 單元 | Money utils、Google adapter 轉換、shipping engine、callback HMAC 簽名/重試、checkout session 更新 |
| **UCP v1 E2E** | `tests/api/ucp-v1-e2e.test.ts` | — | E2E | UCP 完整結帳流程（create session → update → complete → get order） |
| **Single Shop Enforcement** | `tests/api/single-shop-enforcement.test.ts` | — | 整合 | 單店制 DB 約束（`@@unique([tenantId])`）、API 路由行為 |
| **Single Shop Handlers** | `tests/api/single-shop-handlers.test.ts` | — | 單元 | 單店制 handler 邏輯（checkout 不傳 shopId、order lookup 由 tenant 推導） |
| **Tenant Isolation** | `tests/api/tenant-isolation.test.ts` | — | 整合 | 跨租戶資料隔離驗證 |
| **Tenant Resolver** | `tests/lib/tenant/resolve-tenant.test.ts` | — | 單元 | hostname → tenant 解析（custom domain、subdomain、localhost fallback） |
| **Utils** | `tests/lib/utils.test.ts` | — | 單元 | 公用工具函式（formatCurrency、slugify 等） |

### 測試執行指令

```bash
# 執行所有測試
yarn test

# 執行 UCP 相關測試
yarn test:ucp

# 執行單一套件
npx jest tests/api/payment-endpoints.test.ts
```

此測試計畫旨在提供完整的測試策略與實作指引，確保 AIsell 在功能與品質上達到預期標準。實際測試案例及腳本需依需求調整，並與開發進度同步更新。
