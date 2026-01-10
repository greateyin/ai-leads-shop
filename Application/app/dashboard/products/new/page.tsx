"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 新增商品頁面
 * 包含 AI 描述生成功能
 */
export default function NewProductPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    summary: "",
    descriptionMd: "",
  });

  /**
   * 處理輸入變更
   */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /**
   * AI 生成商品描述
   */
  const handleGenerateDescription = async () => {
    if (!formData.name) {
      alert("請先輸入商品名稱");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: formData.name,
          keywords: [],
        }),
      });

      const data = await response.json();
      if (data.success) {
        setFormData((prev) => ({
          ...prev,
          descriptionMd: data.data.descriptionMd,
        }));
      }
    } catch (error) {
      console.error("AI 生成失敗:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 提交表單
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock),
          summary: formData.summary,
          descriptionMd: formData.descriptionMd,
        }),
      });

      if (response.ok) {
        router.push("/dashboard/products");
      }
    } catch (error) {
      console.error("建立商品失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">新增商品</h2>
        <p className="text-muted-foreground">填寫商品資訊，可使用 AI 協助生成描述</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本資訊 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">商品名稱 *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="輸入商品名稱"
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
                placeholder="0"
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
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">商品摘要</Label>
            <Input
              id="summary"
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              placeholder="簡短描述商品特色"
            />
          </div>
        </div>

        {/* 商品描述 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="descriptionMd">商品描述</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateDescription}
              disabled={isGenerating}
            >
              {isGenerating ? "生成中..." : "🤖 AI 生成描述"}
            </Button>
          </div>
          <textarea
            id="descriptionMd"
            name="descriptionMd"
            value={formData.descriptionMd}
            onChange={handleChange}
            placeholder="輸入商品詳細描述 (支援 Markdown)"
            className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* 操作按鈕 */}
        <div className="flex gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "建立中..." : "建立商品"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
