import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * 儀表板側邊選單項目
 */
const sidebarItems = [
  { name: "總覽", href: "/dashboard", icon: "📊" },
  { name: "商品", href: "/dashboard/products", icon: "📦" },
  { name: "訂單", href: "/dashboard/orders", icon: "📋" },
  { name: "金流", href: "/dashboard/payments", icon: "💳" },
  { name: "物流", href: "/dashboard/logistics", icon: "🚚" },
  { name: "部落格", href: "/dashboard/blog", icon: "📝" },
  { name: "AI 助手", href: "/dashboard/ai", icon: "🤖" },
  { name: "分析", href: "/dashboard/analytics", icon: "📈" },
  { name: "設定", href: "/dashboard/settings", icon: "⚙️" },
];

/**
 * 儀表板 Layout
 * 包含側邊選單與頂部導航
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // 未登入則導向登入頁
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-secondary/20">
      {/* 側邊欄 - 亮色漸層風格 */}
      <aside className="hidden w-64 flex-col bg-background border-r border-border md:flex shadow-xl shadow-blue-900/5 z-20">
        <div className="flex h-16 items-center px-6 bg-background/50 backdrop-blur-sm shadow-sm border-b border-border/50">
          <Link href="/dashboard" className="text-2xl font-heading font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            AIsell
          </Link>
        </div>
        <nav className="flex-1 space-y-2 p-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">主選單</div>
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-foreground/70 transition-all hover:bg-primary/5 hover:text-primary hover:translate-x-1 hover:shadow-sm active:scale-95 group font-medium"
            >
              <span className="text-lg group-hover:scale-110 transition-transform text-muted-foreground group-hover:text-primary">{item.icon}</span>
              <span className="tracking-wide">{item.name}</span>
            </Link>
          ))}
        </nav>

        {/* 側邊欄底部 - 用戶資訊 */}
        <div className="p-4 bg-secondary/30 border-t border-border/50">
          <div className="rounded-xl bg-background p-3 flex items-center gap-3 border border-border shadow-sm">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-white shadow-sm">
              {session.user?.name?.[0] || "U"}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-bold truncate text-foreground">{session.user?.name}</div>
              <div className="text-xs text-muted-foreground truncate">{session.user?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* 主內容區 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 頂部導航 */}
        <header className="flex h-16 items-center justify-between border-b bg-background/80 backdrop-blur-md px-6 md:px-8 sticky top-0 z-10 transition-shadow">
          <div className="flex items-center gap-2 md:hidden">
            {/* Mobile Toggle Placeholder */}
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AIsell</span>
          </div>

          <h1 className="text-lg font-semibold hidden md:block text-slate-700 dark:text-slate-200">
            管理控制台
          </h1>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary">
              <span className="text-xl">🔔</span>
            </Button>

            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground hover:text-destructive">
                登出
              </Button>
            </form>
          </div>
        </header>

        {/* 頁面內容 - 加入容器與背景優化 */}
        <main className="flex-1 overflow-auto p-6 md:p-8 relative">
          {/* 背景裝飾 */}
          <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
          <div className="relative animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
