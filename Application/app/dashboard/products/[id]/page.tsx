import { redirect } from "next/navigation";

/**
 * 商品詳情頁面 - 重導向到編輯頁面
 * 消除 /dashboard/products/[id] 與 /dashboard/products/[id]/edit 的重複路由
 */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/products/${id}/edit`);
}
