# AIsell

AI 驅動的輕量級電商 SaaS 平台，讓微型零售商與創作者能在幾分鐘內建立專業線上商店。

## 功能特色

- 🤖 **AI 智能賦能** - 自動生成商品描述、FAQ、導購對話
- 🛒 **極簡商店管理** - 10 分鐘內完成商店設定
- 💳 **多金流整合** - 支援綠界、藍新、Stripe
- 🚚 **物流串接** - 超商取件、宅配一鍵設定
- 📊 **數據分析** - 即時儀表板與銷售預測
- 📝 **內容行銷** - 支援 SEO/AEO 的部落格系統
- 🏢 **多租戶架構** - 支援跨子網域登入與租戶切換
- 🔐 **完整認證** - Email/密碼、Google、Facebook OAuth

## 技術棧

- **框架**: Next.js 16+ (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **認證**: Auth.js v5 (JWT Session)
- **資料庫**: PostgreSQL + Prisma ORM 6.2+
- **語言**: TypeScript
- **部署**: Vercel / Netlify

## 開始使用

### 環境需求

- Node.js 18+
- PostgreSQL 17+ (或 Neon)
- pnpm / Yarn

### 安裝步驟

1. **安裝依賴**

```bash
cd Application
pnpm install
```

2. **設定環境變數**

```bash
cp .env.example .env.local
# 編輯 .env.local 填入必要的設定
```

3. **初始化資料庫**

```bash
pnpm db:generate
pnpm db:push
```

4. **啟動開發伺服器**

```bash
pnpm dev
```

5. 開啟瀏覽器訪問 [http://localhost:3000](http://localhost:3000)

## 專案結構

```
Application/
├── app/                    # Next.js App Router
│   ├── (public)/          # 公開頁面 (商店前台)
│   ├── dashboard/         # 後台管理頁面
│   └── api/               # API Route Handlers
│       ├── auth/          # 認證 API
│       ├── products/      # 商品 API
│       ├── orders/        # 訂單 API
│       ├── blog/          # 部落格 API
│       └── tenants/       # 租戶管理 API
├── components/            # React 元件
│   ├── ui/               # shadcn/ui 基礎元件
│   ├── seo/              # SEO/OpenGraph 元件
│   └── ...               # 業務元件
├── lib/                   # 核心函式庫
│   ├── auth.ts           # Auth.js 配置
│   ├── db.ts             # Prisma Client
│   ├── payment/          # 金流 SDK
│   ├── logistics/        # 物流 SDK
│   └── utils.ts          # 工具函式
├── prisma/               # Prisma Schema
├── types/                # TypeScript 型別定義
└── middleware.ts         # 全域 Middleware
```

## 開發指令

| 指令 | 說明 |
|------|------|
| `pnpm dev` | 啟動開發伺服器 |
| `pnpm build` | 建置生產版本 |
| `pnpm start` | 啟動生產伺服器 |
| `pnpm lint` | 執行 ESLint 檢查 |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:push` | 同步資料庫 Schema |
| `pnpm db:migrate` | 執行資料庫遷移 |
| `pnpm db:studio` | 開啟 Prisma Studio |

## 環境變數

詳見 `.env.example` 檔案，主要配置包括：

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL / Neon 連線字串 |
| `AUTH_SECRET` | Auth.js 加密金鑰 (至少 32 字元) |
| `NEXTAUTH_URL` | 應用程式 URL |
| `AUTH_GOOGLE_*` | Google OAuth 設定 |
| `AUTH_FACEBOOK_*` | Facebook OAuth 設定 |
| `ECPAY_*` | 綠界金流/物流設定 |
| `NEWEBPAY_*` | 藍新金流/物流設定 |
| `STRIPE_*` | Stripe 國際金流設定 |
| `OPENAI_API_KEY` | OpenAI API 金鑰 |
| `COOKIE_DOMAIN` | 跨子網域 Cookie 設定 |

## API 端點

### 認證
- `POST /api/auth/login` - 登入並設定 session
- `POST /api/auth/register` - 註冊新用戶
- `GET /api/auth/[...nextauth]` - Auth.js 處理器

### 商品
- `GET /api/products` - 商品列表 (支援 categoryId 篩選)
- `POST /api/products` - 建立商品
- `PUT /api/products/[id]` - 更新商品
- `DELETE /api/products/[id]` - 軟刪除商品

### 部落格
- `GET /api/blog/posts` - 文章列表
- `GET /api/blog/categories` - 分類列表
- `GET /api/blog/tags` - 標籤列表

### 租戶
- `POST /api/tenants/switch` - 切換活動租戶

## 授權

MIT License
