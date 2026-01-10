"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 文章資料介面
 */
interface BlogPost {
  id: string;
  title: string;
  slug: string;
  summary?: string;
  contentMdx: string;
  coverImageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  status: string;
}

/**
 * 部落格文章編輯頁面
 * 路由: /dashboard/blog/[slug]/edit
 */
export default function BlogEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  useEffect(() => {
    async function fetchPost() {
      try {
        // 先用 slug 查詢文章列表取得 id
        const listRes = await fetch(`/api/blog/posts?search=${resolvedParams.slug}`);
        const listData = await listRes.json();
        
        if (listData.success && listData.data.items?.length > 0) {
          const postId = listData.data.items[0].id;
          // 用 id 取得完整文章資料
          const res = await fetch(`/api/blog/posts/${postId}`);
          const data = await res.json();
          if (data.success) {
            setPost(data.data);
          } else {
            setError("找不到文章");
          }
        } else {
          setError("找不到文章");
        }
      } catch {
        setError("載入文章失敗");
      } finally {
        setIsLoading(false);
      }
    }
    fetchPost();
  }, [resolvedParams.slug]);

  /**
   * AI 生成文章摘要
   */
  const handleGenerateSummary = async () => {
    if (!post?.contentMdx) return;

    setIsGeneratingSummary(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "blog_summary",
          input: { content: post.contentMdx },
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPost((prev) =>
          prev ? { ...prev, summary: data.data } : null
        );
      }
    } catch {
      console.error("AI 生成失敗");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  /**
   * 儲存文章
   */
  const handleSave = async () => {
    if (!post) return;

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/blog/posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: post.title,
          slug: post.slug,
          summary: post.summary,
          contentMdx: post.contentMdx,
          coverImageUrl: post.coverImageUrl,
          seoTitle: post.seoTitle,
          seoDescription: post.seoDescription,
          status: post.status,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push("/dashboard/blog");
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

  if (error && !post) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => router.back()}>返回</Button>
      </div>
    );
  }

  if (!post) {
    return <div className="p-8">找不到文章</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">編輯文章</h2>
          <p className="text-muted-foreground">修改部落格文章</p>
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
            <Label htmlFor="title">文章標題 *</Label>
            <Input
              id="title"
              value={post.title}
              onChange={(e) =>
                setPost((prev) =>
                  prev ? { ...prev, title: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">網址代稱</Label>
            <Input
              id="slug"
              value={post.slug}
              onChange={(e) =>
                setPost((prev) =>
                  prev ? { ...prev, slug: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="summary">摘要</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary}
              >
                {isGeneratingSummary ? "生成中..." : "🤖 AI 生成"}
              </Button>
            </div>
            <textarea
              id="summary"
              className="w-full rounded-md border p-2 min-h-[80px]"
              value={post.summary || ""}
              onChange={(e) =>
                setPost((prev) =>
                  prev ? { ...prev, summary: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">狀態</Label>
            <select
              id="status"
              className="w-full rounded-md border p-2"
              value={post.status}
              onChange={(e) =>
                setPost((prev) =>
                  prev ? { ...prev, status: e.target.value } : null
                )
              }
            >
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已發布</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverImage">封面圖片 URL</Label>
            <Input
              id="coverImage"
              value={post.coverImageUrl || ""}
              onChange={(e) =>
                setPost((prev) =>
                  prev ? { ...prev, coverImageUrl: e.target.value } : null
                )
              }
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">文章內容 (MDX)</Label>
            <textarea
              id="content"
              className="w-full rounded-md border p-2 min-h-[300px] font-mono text-sm"
              value={post.contentMdx}
              onChange={(e) =>
                setPost((prev) =>
                  prev ? { ...prev, contentMdx: e.target.value } : null
                )
              }
            />
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">SEO 設定</h3>
            <div className="space-y-2">
              <Label htmlFor="seoTitle">SEO 標題</Label>
              <Input
                id="seoTitle"
                value={post.seoTitle || ""}
                onChange={(e) =>
                  setPost((prev) =>
                    prev ? { ...prev, seoTitle: e.target.value } : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seoDescription">SEO 描述</Label>
              <textarea
                id="seoDescription"
                className="w-full rounded-md border p-2 min-h-[60px]"
                value={post.seoDescription || ""}
                onChange={(e) =>
                  setPost((prev) =>
                    prev ? { ...prev, seoDescription: e.target.value } : null
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
