"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 撰寫文章頁面
 */
export default function NewBlogPostPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    summary: "",
    contentMdx: "",
    seoTitle: "",
    seoDescription: "",
    status: "DRAFT",
  });

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
   * AI 生成摘要
   */
  const handleGenerateSummary = async () => {
    if (!formData.contentMdx) {
      alert("請先輸入文章內容");
      return;
    }
    if (!formData.title) {
      alert("請先輸入文章標題");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/ai/blog-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          content: formData.contentMdx,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setFormData((prev) => ({
          ...prev,
          summary: data.data.summary,
        }));
      } else {
        alert(data.error?.message || "AI 生成失敗");
      }
    } catch (error) {
      console.error("AI 生成失敗:", error);
      alert("AI 生成失敗，請稍後再試");
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
      const response = await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push("/dashboard/blog");
      }
    } catch (error) {
      console.error("建立文章失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">撰寫文章</h2>
        <p className="text-muted-foreground">建立新的部落格文章</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">文章標題 *</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="輸入文章標題"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="summary">文章摘要</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
                disabled={isGenerating}
              >
                {isGenerating ? "生成中..." : "🤖 AI 生成"}
              </Button>
            </div>
            <textarea
              id="summary"
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              placeholder="簡短描述文章內容"
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contentMdx">文章內容 *</Label>
            <textarea
              id="contentMdx"
              name="contentMdx"
              value={formData.contentMdx}
              onChange={handleChange}
              placeholder="輸入文章內容 (支援 MDX 格式)"
              className="min-h-[400px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="seoTitle">SEO 標題</Label>
              <Input
                id="seoTitle"
                name="seoTitle"
                value={formData.seoTitle}
                onChange={handleChange}
                placeholder="搜尋引擎標題"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">發布狀態</Label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="DRAFT">草稿</option>
                <option value="PUBLISHED">立即發布</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seoDescription">SEO 描述</Label>
            <textarea
              id="seoDescription"
              name="seoDescription"
              value={formData.seoDescription}
              onChange={handleChange}
              placeholder="搜尋引擎描述 (建議 150-160 字)"
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "發布中..." : formData.status === "PUBLISHED" ? "發布文章" : "儲存草稿"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
