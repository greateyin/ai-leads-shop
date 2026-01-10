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
    <div className="flex min-h-screen">
      {/* 側邊欄 */}
      <aside className="hidden w-64 flex-col border-r bg-muted/40 md:flex">
        <div className="flex h-16 items-center border-b px-4">
          <Link href="/dashboard" className="text-xl font-bold">
            AIsell
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* 主內容區 */}
      <div className="flex flex-1 flex-col">
        {/* 頂部導航 */}
        <header className="flex h-16 items-center justify-between border-b px-6">
          <h1 className="text-lg font-semibold">儀表板</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {session.user?.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                登出
              </Button>
            </form>
          </div>
        </header>

        {/* 頁面內容 */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
