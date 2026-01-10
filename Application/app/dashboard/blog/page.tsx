"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 部落格管理頁面
 */
export default function BlogPage() {
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const response = await fetch("/api/blog/posts");
        const data = await response.json();
        if (data.success) {
          setPosts(data.data.items);
        }
      } catch (error) {
        console.error("載入文章失敗:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPosts();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">部落格管理</h2>
          <p className="text-muted-foreground">管理您的文章內容</p>
        </div>
        <Link href="/dashboard/blog/new">
          <Button>撰寫文章</Button>
        </Link>
      </div>

      {/* 文章列表 */}
      <div className="rounded-lg border">
        {isLoading ? (
          <div className="p-8 text-center">載入中...</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-lg">尚無文章</p>
            <p className="mt-2">點擊「撰寫文章」開始您的第一篇內容</p>
          </div>
        ) : (
          <div className="divide-y">
            {posts.map((post) => {
              const p = post as {
                id: string;
                slug: string;
                title: string;
                summary: string;
                status: string;
                publishedAt: string;
                createdAt: string;
                author?: { name: string };
              };
              return (
                <Link
                  key={p.id}
                  href={`/dashboard/blog/${p.slug}/edit`}
                  className="block p-4 hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{p.title}</h3>
                      {p.summary && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {p.summary}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {p.author?.name} ·{" "}
                        {new Date(p.publishedAt || p.createdAt).toLocaleDateString("zh-TW")}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 狀態標籤
 */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    PUBLISHED: "bg-green-100 text-green-800",
  };

  const labels: Record<string, string> = {
    DRAFT: "草稿",
    PUBLISHED: "已發布",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
      {labels[status] || status}
    </span>
  );
}
