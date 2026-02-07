"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProductForm, type ProductFormData } from "@/components/admin/product-form";
import { Loader2 } from "lucide-react";

/**
 * 商品編輯頁面
 * 路由: /dashboard/products/[id]/edit
 * 載入商品資料後渲染共用 ProductForm 元件（分頁籤模式）
 */
export default function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [initialData, setInitialData] = useState<Partial<ProductFormData> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 載入商品資料 */
  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products/${resolvedParams.id}`);
        const data = await res.json();
        if (data.success) {
          const p = data.data;
          setInitialData({
            name: p.name || "",
            slug: p.slug || "",
            summary: p.summary || "",
            descriptionMd: p.descriptionMd || "",
            price: p.price != null ? Number(p.price) : "",
            cost: p.cost != null ? Number(p.cost) : "",
            stock: p.stock != null ? Number(p.stock) : "",
            sku: p.sku || "",
            status: p.status || "DRAFT",
            coverImageUrl: p.coverImageUrl || "",
            ogTitle: p.ogTitle || "",
            ogDescription: p.ogDescription || "",
            ogImageUrl: p.ogImageUrl || "",
            compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : "",
            badge: p.badge || "",
            campaignTag: p.campaignTag || "",
            featuredUntil: p.featuredUntil || "",
          });
        } else {
          setError(data.error?.message || "載入商品失敗");
        }
      } catch {
        setError("載入商品失敗");
      } finally {
        setIsLoading(false);
      }
    }
    fetchProduct();
  }, [resolvedParams.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !initialData) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-4">
        <p className="text-destructive">{error || "找不到商品"}</p>
        <Button variant="outline" onClick={() => router.back()}>
          返回
        </Button>
      </div>
    );
  }

  return (
    <ProductForm
      mode="edit"
      productId={resolvedParams.id}
      initialData={initialData}
    />
  );
}
