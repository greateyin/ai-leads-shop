"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 商品編輯頁面
 */
export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    summary: "",
    descriptionMd: "",
    status: "DRAFT",
  });

  /**
   * 載入商品資料
   */
  useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await fetch(`/api/products/${productId}`);
        const data = await response.json();
        if (data.success) {
          setFormData({
            name: data.data.name,
            price: String(data.data.price),
            stock: String(data.data.stock),
            summary: data.data.summary || "",
            descriptionMd: data.data.descriptionMd || "",
            status: data.data.status,
          });
        }
      } catch (error) {
        console.error("載入商品失敗:", error);
      } finally {
        setIsFetching(false);
      }
    }
    fetchProduct();
  }, [productId]);

  /**
   * 處理輸入變更
   */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /**
   * 提交表單
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock),
          summary: formData.summary,
          descriptionMd: formData.descriptionMd,
          status: formData.status,
        }),
      });

      if (response.ok) {
        router.push("/dashboard/products");
      }
    } catch (error) {
      console.error("更新商品失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return <div className="flex items-center justify-center p-8">載入中...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">編輯商品</h2>
        <p className="text-muted-foreground">更新商品資訊</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">商品名稱 *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">價格 (TWD) *</Label>
              <Input
                id="price"
                name="price"
                type="number"
                value={formData.price}
                onChange={handleChange}
                min="0"
                step="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock">庫存數量</Label>
              <Input
                id="stock"
                name="stock"
                type="number"
                value={formData.stock}
                onChange={handleChange}
                min="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">狀態</Label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已發布</option>
              <option value="ARCHIVED">已封存</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">商品摘要</Label>
            <Input
              id="summary"
              name="summary"
              value={formData.summary}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descriptionMd">商品描述</Label>
            <textarea
              id="descriptionMd"
              name="descriptionMd"
              value={formData.descriptionMd}
              onChange={handleChange}
              className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "更新中..." : "更新商品"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
