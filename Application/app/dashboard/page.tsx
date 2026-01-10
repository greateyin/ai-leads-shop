import { auth } from "@/lib/auth";

/**
 * 儀表板首頁
 * 顯示關鍵指標與快捷操作
 */
export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      {/* 歡迎訊息 */}
      <div>
        <h2 className="text-2xl font-bold">
          歡迎回來，{session?.user?.name || "店長"}！
        </h2>
        <p className="text-muted-foreground">這是您商店的總覽。</p>
      </div>

      {/* 統計卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="今日營收" value="NT$ 0" change="+0%" />
        <StatCard title="今日訂單" value="0" change="+0%" />
        <StatCard title="商品總數" value="0" change="" />
        <StatCard title="待處理訂單" value="0" change="" />
      </div>

      {/* 快捷操作 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">快速開始</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <QuickActionCard
            title="新增商品"
            description="上架您的第一個商品"
            href="/dashboard/products/new"
          />
          <QuickActionCard
            title="設定金流"
            description="連接金流供應商以接受付款"
            href="/dashboard/payments"
          />
          <QuickActionCard
            title="撰寫文章"
            description="使用 AI 協助撰寫行銷文章"
            href="/dashboard/blog/new"
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
}: {
  title: string;
  value: string;
  change: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {change && (
        <p className="mt-1 text-sm text-green-600">{change}</p>
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
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg border bg-card p-6 transition-colors hover:bg-muted"
    >
      <h4 className="font-semibold">{title}</h4>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </a>
  );
}
