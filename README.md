# AIsell - 多租戶電商 SaaS 平台

輕量級多租戶電商解決方案，支援 AI 導購、多金流、多物流整合。

## ✨ 特色功能

- **多租戶架構** - 單一部署支援多個商家，資料完全隔離
- **AI 導購** - RAG 向量搜尋 + 智慧客服對話
- **多金流** - ECPay、NewebPay、Stripe 整合
- **多物流** - 超商取貨、宅配、順豐速運
- **部落格 CMS** - SEO 優化、分類標籤、OpenGraph
- **儀表板分析** - 銷售報表、AI 歸因分析

## 🛠️ 技術棧

- **Framework**: Next.js 16 (App Router)
- **Auth**: Auth.js v5 (Google, Facebook, Credentials)
- **Database**: PostgreSQL + Prisma ORM + pgvector
- **UI**: shadcn/ui + Tailwind CSS
- **AI**: OpenAI API (GPT-4o-mini, Embeddings)

## 🚀 快速開始

```bash
cd Application
pnpm install
cp .env.example .env.local
# 編輯 .env.local 填入必要設定
pnpm run dev
```

## 📁 專案結構

```
Application/
├── app/                 # Next.js App Router
│   ├── api/             # API Routes
│   ├── dashboard/       # 後台管理
│   └── (public)/        # 前台頁面
├── lib/                 # 共用函式庫
│   ├── auth.ts          # 認證設定
│   ├── db.ts            # Prisma 客戶端
│   ├── email.ts         # 郵件服務
│   ├── vector.ts        # 向量搜尋服務
│   ├── payment/         # 金流整合
│   ├── logistics/       # 物流整合
│   └── jobs/            # 背景排程任務
├── prisma/              # 資料庫 Schema
└── components/          # React 元件
```

## 🔐 安全特性

- **Tenant 隔離** - 所有 API 強制 tenantId 過濾
- **Webhook 驗證** - ECPay/Stripe 簽章驗證
- **Token 雜湊** - 重設密碼 token 使用 SHA-256
- **Rate Limiting** - 登入/忘記密碼 API 限速
- **審計日誌** - 關鍵操作自動記錄

## 📚 文件

- [系統規格書](specs/system_spec_detailed.md)
- [更新日誌](Application/CHANGELOG.md)

## 📄 License

MIT
