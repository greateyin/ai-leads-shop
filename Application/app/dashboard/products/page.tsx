import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 商品列表頁面
 * 顯示所有商品，支援搜尋與篩選
 */
export default function ProductsPage() {
  return (
    <div className="space-y-6">
      {/* 頁面標題與操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">商品管理</h2>
          <p className="text-muted-foreground">管理您的所有商品</p>
        </div>
        <Link href="/dashboard/products/new">
          <Button>新增商品</Button>
        </Link>
      </div>

      {/* 搜尋與篩選 */}
      <div className="flex gap-4">
        <input
          type="search"
          placeholder="搜尋商品..."
          className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">所有狀態</option>
          <option value="DRAFT">草稿</option>
          <option value="PUBLISHED">已發布</option>
          <option value="ARCHIVED">已封存</option>
        </select>
      </div>

      {/* 商品列表 */}
      <div className="rounded-lg border">
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-lg">尚無商品</p>
          <p className="mt-2">點擊「新增商品」開始上架您的第一個商品</p>
        </div>
      </div>
    </div>
  );
}
