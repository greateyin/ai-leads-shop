"use client";

import { ProductForm } from "@/components/admin/product-form";

/**
 * 新增商品頁面
 * 使用共用 ProductForm 元件（分頁籤：基本資料、價格庫存、媒體、SEO、行銷）
 */
export default function NewProductPage() {
  return <ProductForm mode="create" />;
}
