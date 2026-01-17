"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
      className={`px-4 py-2 text-sm font-medium transition-colors ${active
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
 * 智能導購聊天 - Claude 風格 UI
 */
function CustomerChatBot() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/chat",
    }),
  });
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自動滾動到最新訊息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col h-[600px] bg-background rounded-xl border shadow-sm">
      {/* 訊息區域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">智能導購助手</h3>
            <p className="text-muted-foreground max-w-sm">
              您好！我是您的 AI 購物助手，可以幫您推薦商品、解答問題，請問有什麼可以幫您的嗎？
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* 頭像 */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
                  }`}
              >
                {message.role === "user" ? "👤" : "🤖"}
              </div>

              {/* 訊息氣泡 */}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${message.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
                  }`}
              >
                {message.parts.map((part, index) =>
                  part.type === "text" ? (
                    <p key={index} className="whitespace-pre-wrap text-sm leading-relaxed">
                      {part.text}
                    </p>
                  ) : null
                )}
              </div>
            </div>
          ))
        )}

        {/* 載入中指示器 */}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-sm text-white">
              🤖
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 輸入區域 */}
      <div className="border-t p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && status === "ready") {
              sendMessage({ text: input });
              setInput("");
            }
          }}
          className="flex gap-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="輸入訊息..."
            className="flex-1 rounded-full px-4"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-full px-6"
          >
            {isLoading ? (
              <span className="animate-pulse">⋯</span>
            ) : (
              "發送"
            )}
          </Button>
        </form>
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
