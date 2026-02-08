# ADR: Single Tenant = Single Shop 不可變規則

> **狀態**: 已決定  
> **日期**: 2026-02-08  
> **決策者**: 架構團隊

## 決策

**每個 Tenant 只能擁有 1 個 Shop。** 所有訂單、商品、結帳、查詢流程一律由 tenant 推導 shop，不信任 client 傳入的 `shopId` 或 `shopSlug`。

## 背景

多租戶電商平台在早期設計允許「一租戶多商店」的可能性（方案配額 SEED=1, GROWTH=3, PRO=10）。但實務上：

1. 目前所有 tenant 只使用 1 個 shop
2. 多店邏輯增加了大量安全邊界判斷（跨店/跨租戶）
3. 審計發現多個 API 未正確驗證 `shopId` 歸屬，造成跨租戶關聯汙染風險
4. 簡化為單店制可大幅減少攻擊面

## 強制約束

### DB 層
- `Shop` 模型加 `@@unique([tenantId])` — DB 層面杜絕第二家店
- `Product` 唯一鍵從 `@@unique([shopId, slug])` 改為 `@@unique([tenantId, slug])`
- `Product` SKU 唯一鍵從 `@@unique([shopId, sku])` 改為 `@@unique([tenantId, sku])`

### API 層
- `POST /api/shops` — 最多建 1 店，不依方案給配額
- `POST /api/carts/checkout` — 移除 request `shopId`，改由 tenant 推導唯一 shop
- `POST /api/orders` — guest checkout 由 request host 解析 tenant，再推導 shop
- `POST /api/orders/lookup` — 由 request host 解析 tenant，不信任 `shopSlug`
- `planLimits` — 移除 `shops` 維度

### 前端
- checkout 頁面不再傳 `shopSlug` 到訂單建立 API
- 訂單查詢頁面不再傳 `shopSlug` 到 lookup API

## 資料遷移策略（上線前必做）

1. **盤點**: 查詢 `SELECT "tenantId", COUNT(*) FROM shops GROUP BY "tenantId" HAVING COUNT(*) > 1`
2. **挑選主店**: 以 `createdAt ASC` 最早建立的為主店
3. **搬遷關聯**: 將次店的 Product、Order、UcpCheckoutSession 的 `shopId` 更新為主店 ID
4. **刪除次店**: 確認無殘留關聯後刪除次要 Shop 記錄
5. **上約束**: 執行 migration 加 `@@unique([tenantId])` 到 Shop

## 上線順序

1. 資料盤點與搬遷 → 2. DB unique 約束 → 3. API/前端收斂部署 → 4. Smoke test（建店、下單、查單、付款 webhook）
