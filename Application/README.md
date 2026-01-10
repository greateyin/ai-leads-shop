# Manus AI Shop

AI 驅動的輕量級電商 SaaS 平台，讓微型零售商與創作者能在幾分鐘內建立專業線上商店。

## 功能特色

- 🤖 **AI 智能賦能** - 自動生成商品描述、FAQ、導購對話
- 🛒 **極簡商店管理** - 10 分鐘內完成商店設定
- 💳 **多金流整合** - 支援綠界、藍新、Stripe
- 🚚 **物流串接** - 超商取件、宅配一鍵設定
- 📊 **數據分析** - 即時儀表板與銷售預測
- 📝 **內容行銷** - 支援 SEO/AEO 的部落格系統

## 技術棧

- **框架**: Next.js 15+ (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **認證**: Auth.js v5
- **資料庫**: PostgreSQL + Prisma ORM 6.2+
- **語言**: TypeScript

## 開始使用

### 環境需求

- Node.js 18+
- PostgreSQL 17+
- Yarn

### 安裝步驟

1. **安裝依賴**

```bash
cd Application
yarn install
```

2. **設定環境變數**

```bash
cp .env.example .env
# 編輯 .env 填入必要的設定
```

3. **初始化資料庫**

```bash
yarn db:generate
yarn db:push
```

4. **啟動開發伺服器**

```bash
yarn dev
```

5. 開啟瀏覽器訪問 [http://localhost:3000](http://localhost:3000)

## 專案結構

```
Application/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 認證頁面 (登入、註冊)
│   ├── dashboard/         # 後台管理頁面
│   └── api/               # API Route Handlers
├── components/            # React 元件
│   ├── ui/               # shadcn/ui 基礎元件
│   └── ...               # 業務元件
├── lib/                   # 核心函式庫
│   ├── auth.ts           # Auth.js 配置
│   ├── db.ts             # Prisma Client
│   ├── payment/          # 金流 SDK
│   └── utils.ts          # 工具函式
├── prisma/               # Prisma Schema
├── types/                # TypeScript 型別定義
└── middleware.ts         # 全域 Middleware
```

## 開發指令

| 指令 | 說明 |
|------|------|
| `yarn dev` | 啟動開發伺服器 |
| `yarn build` | 建置生產版本 |
| `yarn start` | 啟動生產伺服器 |
| `yarn lint` | 執行 ESLint 檢查 |
| `yarn db:generate` | 生成 Prisma Client |
| `yarn db:push` | 同步資料庫 Schema |
| `yarn db:migrate` | 執行資料庫遷移 |
| `yarn db:studio` | 開啟 Prisma Studio |

## 環境變數

詳見 `.env.example` 檔案，主要配置包括：

- `DATABASE_URL` - PostgreSQL 連線字串
- `AUTH_SECRET` - Auth.js 加密金鑰
- `AUTH_*` - OAuth 提供者設定
- `ECPAY_*` / `NEWEBPAY_*` / `STRIPE_*` - 金流設定
- `OPENAI_API_KEY` - AI 服務金鑰

## 授權

MIT License
