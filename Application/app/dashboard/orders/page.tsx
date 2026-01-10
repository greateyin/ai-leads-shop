/**
 * 訂單列表頁面
 * 顯示所有訂單，支援狀態篩選與搜尋
 */
export default function OrdersPage() {
  return (
    <div className="space-y-6">
      {/* 頁面標題 */}
      <div>
        <h2 className="text-2xl font-bold">訂單管理</h2>
        <p className="text-muted-foreground">查看與管理所有訂單</p>
      </div>

      {/* 篩選列 */}
      <div className="flex gap-4">
        <input
          type="search"
          placeholder="搜尋訂單編號..."
          className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">所有狀態</option>
          <option value="PENDING">待付款</option>
          <option value="PAID">已付款</option>
          <option value="PROCESSING">處理中</option>
          <option value="SHIPPED">已出貨</option>
          <option value="COMPLETED">已完成</option>
          <option value="CANCELLED">已取消</option>
        </select>
      </div>

      {/* 訂單列表 */}
      <div className="rounded-lg border">
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-lg">尚無訂單</p>
          <p className="mt-2">訂單將在顧客下單後顯示於此</p>
        </div>
      </div>
    </div>
  );
}
