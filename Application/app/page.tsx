import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 首頁（宣傳頁）
 * 展示平台特色與行銷內容
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      {/* 導航列 */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-xl font-bold text-transparent">
              AIsell
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="hover:bg-primary/5">登入</Button>
            </Link>
            <Link href="/register">
              <Button variant="gradient" size="pill">免費開店</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* 主要內容區 */}
      <main className="flex-1">
        {/* Hero 區塊 */}
        <section className="relative overflow-hidden pb-16 pt-24 md:pb-32 md:pt-40">
          {/* 背景裝飾 */}
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-background" />
          <div className="absolute -top-40 left-0 right-0 h-96 bg-primary/10 blur-[100px]" />

          <div className="container flex flex-col items-center justify-center gap-6 text-center">
            <div className="animate-fade-in-up opacity-0 [animation-delay:200ms]">
              <h1 className="text-4xl font-bold leading-tight tracking-tighter md:text-7xl lg:leading-[1.1]">
                AI 驅動的
                <br />
                <span className="bg-gradient-to-r from-primary via-blue-500 to-accent bg-clip-text text-transparent">
                  輕量級電商平台
                </span>
              </h1>
            </div>

            <p className="max-w-[750px] animate-fade-in-up text-lg text-muted-foreground opacity-0 [animation-delay:400ms] sm:text-xl">
              讓您在 10 分鐘內建立專業線上商店。AI 自動生成商品描述、智能導購、銷售預測，讓經營更輕鬆。
            </p>

            <div className="flex animate-fade-in-up gap-4 opacity-0 [animation-delay:600ms]">
              <Link href="/register">
                <Button size="lg" variant="gradient" className="h-14 px-8 text-lg shadow-xl shadow-primary/20">
                  立即開始
                </Button>
              </Link>
              <Link href="#features">
                <Button variant="outline" size="lg" className="h-14 rounded-full border-2 px-8 text-lg hover:bg-secondary/50">
                  了解更多
                </Button>
              </Link>
            </div>

            {/* 浮動元素裝飾 */}
            <div className="pointer-events-none absolute left-10 top-1/4 hidden animate-float md:block text-9xl opacity-5">
              🛍️
            </div>
            <div className="pointer-events-none absolute bottom-1/4 right-10 hidden animate-pulse-slow md:block text-9xl opacity-5">
              🚀
            </div>
          </div>
        </section>

        {/* 功能特色區塊 */}
        <section id="features" className="container py-24 md:py-32">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">核心功能</h2>
            <p className="mt-4 text-muted-foreground">專為現代電商設計的全方位解決方案</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard
              title="AI 商品描述"
              description="輸入商品名稱，AI 自動生成吸引人的商品描述與 FAQ，提升轉換率。"
              icon="✨"
              delay="0"
            />
            <FeatureCard
              title="智能導購"
              description="AI 客服 24 小時為顧客解答問題、推薦商品，不錯過任何商機。"
              icon="🤖"
              delay="100ms"
            />
            <FeatureCard
              title="多金流整合"
              description="支援綠界、藍新、Stripe 等多種金流，一鍵設定，立即收款。"
              icon="💳"
              delay="200ms"
            />
          </div>
        </section>
      </main>

      {/* 頁尾 */}
      <footer className="border-t bg-secondary/30 py-12 md:py-16">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © 2026 AIsell. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-primary">隱私權政策</Link>
            <Link href="#" className="hover:text-primary">服務條款</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * 功能卡片元件
 */
function FeatureCard({
  title,
  description,
  icon,
  delay
}: {
  title: string;
  description: string;
  icon: string;
  delay?: string;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border bg-card p-8 text-card-foreground shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5"
      style={{ animationDelay: delay }}
    >
      <div className="absolute -right-4 -top-4 text-8xl opacity-[0.03] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12">
        {icon}
      </div>
      <div className="mb-4 text-4xl">{icon}</div>
      <h3 className="mb-3 text-xl font-bold">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
