# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-10

### Added

- **Blog API 完善**
  - 新增 `GET/POST /api/blog/categories` 分類 API
  - 新增 `GET/POST /api/blog/tags` 標籤 API
  - Blog 後台列表改用 `/api/blog/posts` API

- **OpenGraph 支援**
  - Blog 編輯頁新增 OG 欄位 (ogTitle/ogDescription/ogImageUrl)
  - Product 編輯頁新增 OG 欄位
  - 修正 `generateProductOpenGraph()` URL 路徑為 `/products/[slug]`

- **多租戶 Session 管理**
  - JWT 新增 `activeTenantId` / `activeTenantRole` 欄位
  - JWT callback 每次請求從 DB 讀取最新的 `isDefault` 租戶
  - `/api/auth/login` 現在會正確設定 session cookie
  - 支援 `AUTH_SECRET` 與 `NEXTAUTH_SECRET` 雙重變數
  - 新增 `COOKIE_DOMAIN` 環境變數支援跨子網域登入

- **環境變數**
  - 更新 `.env.example` 包含所有必要變數
  - 新增 `.env.local` 開發環境範本

### Changed

- **商品 API 改進**
  - `DELETE /api/products/[id]` 現在同時設定 `status=ARCHIVED` 與 `deletedAt`
  - `GET /api/products` 新增 `categoryId` 篩選參數

- **認證流程**
  - Dashboard 登出改用 Server Action + `signOut()`
  - `token.role` 預設值從 `"USER"` 改為 `"CUSTOMER"` (符合系統 enum)

- **追蹤腳本**
  - 移除 root layout 的環境變數追蹤腳本注入
  - 追蹤腳本統一由 `(public)/layout.tsx` 根據租戶設定動態載入

### Fixed

- 修正 `lib/auth.ts` PrismaAdapter 型別轉換
- 修正 `lib/logistics/newebpay-logistics.ts` 型別錯誤
- 修正 `lib/logistics/sf-express.ts` 型別錯誤
- 修正 Blog 後台連結從 `/dashboard/blog/{id}` 改為 `/dashboard/blog/[slug]/edit`

## [0.1.0] - 2026-01-01

### Added

- 初始專案架構
- Next.js 16 + App Router
- Auth.js v5 認證 (Google, Facebook, Credentials)
- Prisma ORM + PostgreSQL
- shadcn/ui 元件庫
- 商品管理 CRUD
- 訂單管理
- 金流整合 (ECPay, NewebPay, Stripe)
- 物流整合 (ECPay Logistics, SF Express)
- 部落格系統
- AI 商品描述生成
- 多租戶架構
- 儀表板與分析

---

[0.2.0]: https://github.com/user/light-weight-shop/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/user/light-weight-shop/releases/tag/v0.1.0
