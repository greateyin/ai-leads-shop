-- Migration: Single Tenant = Single Shop
-- ADR: docs/02_System_Analysis/05_Single_Tenant_Single_Shop.md
--
-- 前置條件（必須在此 migration 前完成）：
--   1. 確認無 tenant 擁有超過 1 家 shop：
--      SELECT "tenantId", COUNT(*) FROM shops GROUP BY "tenantId" HAVING COUNT(*) > 1;
--   2. 若有多店 tenant，先執行資料搬遷（見 ADR 文件）
--   3. 確認無 tenant 內有重複的 product slug 或 sku：
--      SELECT "tenantId", slug, COUNT(*) FROM products WHERE "deletedAt" IS NULL
--        GROUP BY "tenantId", slug HAVING COUNT(*) > 1;
--      SELECT "tenantId", sku, COUNT(*) FROM products WHERE sku IS NOT NULL AND "deletedAt" IS NULL
--        GROUP BY "tenantId", sku HAVING COUNT(*) > 1;

-- ============================================================
-- Step 1: Shop — 加 tenantId unique 約束（單店制核心）
-- ============================================================

-- 移除原本的 tenantId 普通索引（被 unique 取代）
DROP INDEX IF EXISTS shops_tenant_id_idx;

-- 加入 unique 約束
ALTER TABLE shops
  ADD CONSTRAINT shops_tenant_id_key UNIQUE ("tenantId");

-- ============================================================
-- Step 2: Product — unique key 從 shopId scope 改為 tenantId scope
-- ============================================================

-- 2a. 移除舊的 shopId-scoped unique 約束
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_shop_id_slug_key;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_shop_id_sku_key;

-- 2b. 加入新的 tenantId-scoped unique 約束
ALTER TABLE products
  ADD CONSTRAINT products_tenant_id_slug_key UNIQUE ("tenantId", slug);

ALTER TABLE products
  ADD CONSTRAINT products_tenant_id_sku_key UNIQUE ("tenantId", sku);
