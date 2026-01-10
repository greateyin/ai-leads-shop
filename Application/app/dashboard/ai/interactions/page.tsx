"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * AI 互動記錄介面
 */
interface AiInteraction {
  id: string;
  type: string;
  prompt: string;
  model: string;
  createdAt: string;
}

/**
 * AI 使用記錄頁面
 * 路由: /dashboard/ai/interactions
 */
export default function AiInteractionsPage() {
  const [interactions, setInteractions] = useState<AiInteraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("");

  useEffect(() => {
    async function fetchInteractions() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "20",
        });
        if (typeFilter) {
          params.set("type", typeFilter);
        }

        const res = await fetch(`/api/ai?${params}`);
        const data = await res.json();
        if (data.success) {
          setInteractions(data.data.items);
          setTotalPages(data.data.pagination.totalPages);
        }
      } catch (error) {
        console.error("載入 AI 記錄失敗:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchInteractions();
  }, [page, typeFilter]);

  /**
   * 取得類型標籤
   */
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      PRODUCT_DESCRIPTION: "商品描述",
      FAQ: "常見問題",
      BLOG_SUMMARY: "部落格摘要",
      CHAT: "智能導購",
    };
    return labels[type] || type;
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("zh-TW");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">AI 使用記錄</h2>
        <p className="text-muted-foreground">查看 AI 服務的使用歷史</p>
      </div>

      {/* 篩選器 */}
      <div className="flex gap-4 items-center">
        <label className="text-sm font-medium">類型篩選:</label>
        <select
          className="rounded-md border p-2"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部</option>
          <option value="PRODUCT_DESCRIPTION">商品描述</option>
          <option value="BLOG_SUMMARY">部落格摘要</option>
          <option value="CHAT">智能導購</option>
          <option value="FAQ">常見問題</option>
        </select>
      </div>

      {/* 記錄列表 */}
      <div className="rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">類型</th>
              <th className="px-4 py-3 text-left text-sm font-medium">提示詞</th>
              <th className="px-4 py-3 text-left text-sm font-medium">模型</th>
              <th className="px-4 py-3 text-left text-sm font-medium">時間</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center">
                  載入中...
                </td>
              </tr>
            ) : interactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  尚無 AI 使用記錄
                </td>
              </tr>
            ) : (
              interactions.map((interaction) => (
                <tr key={interaction.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      {getTypeLabel(interaction.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="max-w-md truncate" title={interaction.prompt}>
                      {interaction.prompt.length > 100
                        ? `${interaction.prompt.substring(0, 100)}...`
                        : interaction.prompt}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {interaction.model}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(interaction.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            上一頁
          </Button>
          <span className="flex items-center px-4 text-sm">
            第 {page} / {totalPages} 頁
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            下一頁
          </Button>
        </div>
      )}
    </div>
  );
}
