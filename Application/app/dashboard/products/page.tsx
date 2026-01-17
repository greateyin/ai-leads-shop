import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 商品列表頁面
 * 顯示所有商品，支援搜尋與篩選
 */
export default function ProductsPage() {
  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* 頁面標題與操作 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent inline-block">商品管理</h2>
          <p className="text-muted-foreground mt-1 text-lg">
            管理您的所有商品，上架、編輯或查看庫存
          </p>
        </div>
        <Link href="/dashboard/products/new">
          <Button variant="gradient" className="rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30">
            <span className="mr-2 text-lg">+</span>
            新增商品
          </Button>
        </Link>
      </div>

      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 space-y-6">
        {/* 搜尋與篩選 - 美化樣式 */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
            <input
              type="search"
              placeholder="搜尋商品名稱、SKU..."
              className="flex h-12 w-full rounded-xl border border-input bg-secondary/20 px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all focus:bg-background"
            />
          </div>

          <div className="relative w-full md:w-48">
            <select className="h-12 w-full appearance-none rounded-xl border border-input bg-secondary/20 px-4 text-sm focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer transition-all">
              <option value="">所有狀態</option>
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已發布</option>
              <option value="ARCHIVED">已封存</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>

        {/* 商品列表/Empty State - 美化 */}
        <div className="rounded-2xl border-2 border-dashed border-border/60 bg-secondary/5 min-h-[300px] flex flex-col items-center justify-center p-8 text-center animate-fade-in">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 text-4xl">
            📦
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">尚無商品</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            您的商店還沒有任何商品。點擊「新增商品」按鈕開始上架您的第一個商品，讓顧客看見您的好物！
          </p>
          <Link href="/dashboard/products/new">
            <Button variant="outline" className="rounded-full border-2 hover:bg-secondary">
              開始上架
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
