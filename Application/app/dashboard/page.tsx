import { auth } from "@/lib/auth";

/**
 * 儀表板首頁
 * 顯示關鍵指標與快捷操作
 */
export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-10">
      {/* 歡迎訊息 - 加入漸層標題 */}
      <div className="animate-fade-in-up">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent inline-block">
          歡迎回來，{session?.user?.name || "店長"}！ 👋
        </h2>
        <p className="text-muted-foreground mt-2 text-lg">
          這是您商店的今日概況，祝您生意興隆！
        </p>
      </div>

      {/* 統計卡片 - 使用 Glassmorphism 與漸層邊框 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-fade-in-up [animation-delay:100ms]">
        <StatCard
          title="今日營收"
          value="NT$ 0"
          change="+0%"
          icon="💰"
          color="from-blue-500 to-cyan-400"
        />
        <StatCard
          title="今日訂單"
          value="0"
          change="+0%"
          icon="🛍️"
          color="from-purple-500 to-pink-400"
        />
        <StatCard
          title="商品總數"
          value="0"
          change=""
          icon="📦"
          color="from-amber-500 to-orange-400"
        />
        <StatCard
          title="待處理訂單"
          value="0"
          change=""
          icon="⏳"
          color="from-emerald-500 to-green-400"
        />
      </div>

      {/* 快捷操作 */}
      <div className="space-y-6 animate-fade-in-up [animation-delay:200ms]">
        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
          <span className="w-1 h-6 bg-primary rounded-full"></span>
          快速開始
        </h3>
        <div className="grid gap-6 md:grid-cols-3">
          <QuickActionCard
            title="新增商品"
            description="上架您的第一個商品"
            href="/dashboard/products/new"
            icon="✨"
            bg="bg-blue-50 dark:bg-blue-900/20"
          />
          <QuickActionCard
            title="設定金流"
            description="連接金流供應商以接受付款"
            href="/dashboard/payments"
            icon="💳"
            bg="bg-purple-50 dark:bg-purple-900/20"
          />
          <QuickActionCard
            title="撰寫文章"
            description="使用 AI 協助撰寫行銷文章"
            href="/dashboard/blog/new"
            icon="✍️"
            bg="bg-amber-50 dark:bg-amber-900/20"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 統計卡片元件
 */
function StatCard({
  title,
  value,
  change,
  icon,
  color,
}: {
  title: string;
  value: string;
  change: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card border border-border/50 p-6 shadow-lg shadow-blue-900/5 hover:-translate-y-1 transition-transform duration-300 group">
      {/* 頂部漸層條 */}
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color}`}></div>

      <div className="flex justify-between items-start mb-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span className="text-2xl opacity-80 group-hover:scale-110 transition-transform">{icon}</span>
      </div>

      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>

      {change && (
        <div className="mt-2 flex items-center text-xs font-medium">
          <span className="text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            {change}
          </span>
          <span className="ml-2 text-muted-foreground">較昨日</span>
        </div>
      )}
    </div>
  );
}

/**
 * 快捷操作卡片
 */
function QuickActionCard({
  title,
  description,
  href,
  icon,
  bg,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
  bg: string;
}) {
  return (
    <a
      href={href}
      className={`block rounded-2xl border border-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${bg} hover:border-primary/20 group relative overflow-hidden`}
    >
      <div className="relative z-10">
        <div className="mb-4 w-12 h-12 rounded-xl bg-white/80 dark:bg-black/20 flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h4 className="font-bold text-lg text-foreground">{title}</h4>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* 裝飾性背景圓 */}
      <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors"></div>
    </a>
  );
}
