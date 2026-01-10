import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 首頁（宣傳頁）
 * 展示平台特色與行銷內容
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* 導航列 */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold">AIsell</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">登入</Button>
            </Link>
            <Link href="/register">
              <Button>免費開店</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* 主要內容區 */}
      <main className="flex-1">
        {/* Hero 區塊 */}
        <section className="container flex flex-col items-center justify-center gap-6 pb-8 pt-16 md:py-24">
          <h1 className="text-center text-4xl font-bold leading-tight tracking-tighter md:text-6xl lg:leading-[1.1]">
            AI 驅動的
            <br />
            <span className="text-primary">輕量級電商平台</span>
          </h1>
          <p className="max-w-[750px] text-center text-lg text-muted-foreground sm:text-xl">
            讓您在 10 分鐘內建立專業線上商店。AI
            自動生成商品描述、智能導購、銷售預測，讓經營更輕鬆。
          </p>
          <div className="flex gap-4">
            <Link href="/register">
              <Button size="lg">立即開始</Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg">
                了解更多
              </Button>
            </Link>
          </div>
        </section>

        {/* 功能特色區塊 */}
        <section id="features" className="container py-16 md:py-24">
          <h2 className="mb-12 text-center text-3xl font-bold">核心功能</h2>
          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard
              title="AI 商品描述"
              description="輸入商品名稱，AI 自動生成吸引人的商品描述與 FAQ"
            />
            <FeatureCard
              title="智能導購"
              description="AI 客服 24 小時為顧客解答問題、推薦商品"
            />
            <FeatureCard
              title="多金流整合"
              description="支援綠界、藍新、Stripe 等多種金流，一鍵設定"
            />
          </div>
        </section>
      </main>

      {/* 頁尾 */}
      <footer className="border-t py-6 md:py-0">
        <div className="container flex h-16 items-center justify-between">
          <p className="text-sm text-muted-foreground">
            © 2026 AIsell. All rights reserved.
          </p>
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
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <h3 className="mb-2 text-xl font-semibold">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
