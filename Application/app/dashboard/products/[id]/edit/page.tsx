"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 商品資料介面
 */
interface Product {
  id: string;
  name: string;
  slug: string;
  summary?: string;
  descriptionMd?: string;
  price: number;
  cost?: number;
  stock: number;
  sku?: string;
  status: string;
  coverImageUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
}

/**
 * 商品編輯頁面
 * 路由: /dashboard/products/[id]/edit
 */
export default function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products/${resolvedParams.id}`);
        const data = await res.json();
        if (data.success) {
          setProduct(data.data);
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

  /**
   * AI 生成商品描述
   */
  const handleGenerateDescription = async () => {
    if (!product?.name) return;

    setIsGeneratingDescription(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "product_description",
          input: { productName: product.name },
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.description) {
        setProduct((prev) =>
          prev ? { ...prev, descriptionMd: data.data.description } : null
        );
      }
    } catch {
      console.error("AI 生成失敗");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  /**
   * 儲存商品
   */
  const handleSave = async () => {
    if (!product) return;

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/products/${resolvedParams.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          slug: product.slug,
          summary: product.summary,
          descriptionMd: product.descriptionMd,
          price: product.price,
          cost: product.cost,
          stock: product.stock,
          sku: product.sku,
          status: product.status,
          coverImageUrl: product.coverImageUrl,
          ogTitle: product.ogTitle,
          ogDescription: product.ogDescription,
          ogImageUrl: product.ogImageUrl,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push("/dashboard/products");
      } else {
        setError(data.error?.message || "儲存失敗");
      }
    } catch {
      setError("儲存失敗");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">載入中...</div>;
  }

  if (error && !product) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => router.back()}>返回</Button>
      </div>
    );
  }

  if (!product) {
    return <div className="p-8">找不到商品</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">編輯商品</h2>
          <p className="text-muted-foreground">修改商品資訊</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">商品名稱 *</Label>
            <Input
              id="name"
              value={product.name}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, name: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">網址代稱</Label>
            <Input
              id="slug"
              value={product.slug}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, slug: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={product.sku || ""}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, sku: e.target.value } : null
                )
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">售價 *</Label>
              <Input
                id="price"
                type="number"
                value={product.price}
                onChange={(e) =>
                  setProduct((prev) =>
                    prev ? { ...prev, price: Number(e.target.value) } : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">成本</Label>
              <Input
                id="cost"
                type="number"
                value={product.cost || ""}
                onChange={(e) =>
                  setProduct((prev) =>
                    prev ? { ...prev, cost: Number(e.target.value) || undefined } : null
                  )
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stock">庫存</Label>
            <Input
              id="stock"
              type="number"
              value={product.stock}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, stock: Number(e.target.value) } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">狀態</Label>
            <select
              id="status"
              className="w-full rounded-md border p-2"
              value={product.status}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, status: e.target.value } : null
                )
              }
            >
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已發布</option>
              <option value="ARCHIVED">已封存</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="summary">簡介</Label>
            <textarea
              id="summary"
              className="w-full rounded-md border p-2 min-h-[80px]"
              value={product.summary || ""}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, summary: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">商品描述 (Markdown)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateDescription}
                disabled={isGeneratingDescription}
              >
                {isGeneratingDescription ? "生成中..." : "🤖 AI 生成"}
              </Button>
            </div>
            <textarea
              id="description"
              className="w-full rounded-md border p-2 min-h-[200px] font-mono text-sm"
              value={product.descriptionMd || ""}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, descriptionMd: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverImage">封面圖片 URL</Label>
            <Input
              id="coverImage"
              value={product.coverImageUrl || ""}
              onChange={(e) =>
                setProduct((prev) =>
                  prev ? { ...prev, coverImageUrl: e.target.value } : null
                )
              }
            />
            {product.coverImageUrl && (
              <img
                src={product.coverImageUrl}
                alt="封面預覽"
                className="mt-2 w-full max-h-40 object-cover rounded-md"
              />
            )}
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">OpenGraph 設定 (社群分享)</h3>
            <div className="space-y-2">
              <Label htmlFor="ogTitle">OG 標題</Label>
              <Input
                id="ogTitle"
                placeholder="留空則使用商品名稱"
                value={product.ogTitle || ""}
                onChange={(e) =>
                  setProduct((prev) =>
                    prev ? { ...prev, ogTitle: e.target.value } : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ogDescription">OG 描述</Label>
              <textarea
                id="ogDescription"
                className="w-full rounded-md border p-2 min-h-[60px]"
                placeholder="留空則使用簡介"
                value={product.ogDescription || ""}
                onChange={(e) =>
                  setProduct((prev) =>
                    prev ? { ...prev, ogDescription: e.target.value } : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ogImageUrl">OG 圖片 URL</Label>
              <Input
                id="ogImageUrl"
                placeholder="留空則使用封面圖片"
                value={product.ogImageUrl || ""}
                onChange={(e) =>
                  setProduct((prev) =>
                    prev ? { ...prev, ogImageUrl: e.target.value } : null
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
