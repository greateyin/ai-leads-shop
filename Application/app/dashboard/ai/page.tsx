"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * AI 助手頁面
 */
export default function AIPage() {
  const [activeTab, setActiveTab] = useState<"description" | "chat" | "forecast">("description");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">AI 助手</h2>
        <p className="text-muted-foreground">使用 AI 功能提升您的營運效率</p>
      </div>

      {/* 功能選項 */}
      <div className="flex gap-2 border-b">
        <TabButton
          active={activeTab === "description"}
          onClick={() => setActiveTab("description")}
        >
          商品描述生成
        </TabButton>
        <TabButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")}>
          智能導購
        </TabButton>
        <TabButton active={activeTab === "forecast"} onClick={() => setActiveTab("forecast")}>
          銷售預測
        </TabButton>
      </div>

      {/* 內容區 */}
      <div className="rounded-lg border p-6">
        {activeTab === "description" && <ProductDescriptionGenerator />}
        {activeTab === "chat" && <CustomerChatBot />}
        {activeTab === "forecast" && <SalesForecast />}
      </div>
    </div>
  );
}

/**
 * Tab 按鈕
 */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-primary text-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 商品描述生成器
 */
function ProductDescriptionGenerator() {
  const [productName, setProductName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!productName) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setResult(data.data.descriptionMd);
      }
    } catch (error) {
      console.error("生成失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="productName">商品名稱</Label>
        <Input
          id="productName"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="輸入商品名稱"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="keywords">關鍵字 (選填，以逗號分隔)</Label>
        <Input
          id="keywords"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="例如：有機、天然、環保"
        />
      </div>
      <Button onClick={handleGenerate} disabled={isLoading || !productName}>
        {isLoading ? "生成中..." : "🤖 生成描述"}
      </Button>

      {result && (
        <div className="mt-4 rounded-lg bg-muted p-4">
          <h4 className="mb-2 font-medium">生成結果</h4>
          <pre className="whitespace-pre-wrap text-sm">{result}</pre>
        </div>
      )}
    </div>
  );
}

/**
 * 智能導購聊天
 */
function CustomerChatBot() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      // TODO: 整合實際 AI 聊天 API
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "您好！我是 AI 導購助手。請問有什麼可以幫助您的嗎？",
        },
      ]);
    } catch (error) {
      console.error("發送失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="h-[300px] overflow-y-auto rounded-lg border bg-muted/50 p-4">
        {messages.length === 0 ? (
          <p className="text-center text-muted-foreground">開始與 AI 導購對話...</p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-2 rounded-lg p-2 ${
                msg.role === "user" ? "bg-primary text-primary-foreground ml-auto" : "bg-muted"
              } max-w-[80%] ${msg.role === "user" ? "ml-auto" : ""}`}
            >
              {msg.content}
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="輸入訊息..."
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
        />
        <Button onClick={handleSend} disabled={isLoading}>
          發送
        </Button>
      </div>
    </div>
  );
}

/**
 * 銷售預測
 */
function SalesForecast() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-4 text-center">
        <p className="text-muted-foreground">
          銷售預測功能需要累積足夠的訂單數據。
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          系統將根據您的歷史銷售數據，提供未來銷售趨勢預測。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">--</p>
          <p className="text-sm text-muted-foreground">預測本週營收</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">--</p>
          <p className="text-sm text-muted-foreground">預測本月訂單</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">--</p>
          <p className="text-sm text-muted-foreground">趨勢方向</p>
        </div>
      </div>
    </div>
  );
}
