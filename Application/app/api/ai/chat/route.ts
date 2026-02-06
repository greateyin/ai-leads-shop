import { NextRequest } from "next/server";
import { authWithTenant, isWriteRole } from "@/lib/api/auth-helpers";
import { deepseek } from "@ai-sdk/deepseek";
import { streamText, UIMessage, convertToModelMessages } from "ai";

// 允許串流回應最多 30 秒
export const maxDuration = 30;

/**
 * POST /api/ai/chat
 * AI 導購聊天 - 使用 AI SDK 串流回應
 */
export async function POST(request: NextRequest) {
    try {
        const { session } = await authWithTenant();
        if (!session) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { code: "UNAUTHORIZED", message: "請先登入" },
                }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            );
        }

        // [RBAC] AI 工具需至少 STAFF 角色
        if (!isWriteRole(session.user.role)) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { code: "FORBIDDEN", message: "權限不足" },
                }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await request.json();
        const messages: UIMessage[] = body.messages || [];

        // 建立系統提示
        const systemPrompt = `你是一個專業的電商導購助手。請根據顧客的問題提供專業、友善的建議。

回答規則：
1. 簡潔明瞭，專注回答問題
2. 如果資料中沒有相關資訊，請誠實告知
3. 適時推薦相關商品
4. 使用友善、專業的語氣
5. 使用繁體中文回應`;

        // 使用 streamText 進行串流回應
        const result = streamText({
            model: deepseek("deepseek-chat"),
            system: systemPrompt,
            messages: await convertToModelMessages(messages),
        });

        // 返回 UI 訊息串流回應
        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error("AI 聊天錯誤:", error);
        const errorMessage = error instanceof Error ? error.message : "未知錯誤";
        return new Response(
            JSON.stringify({
                success: false,
                error: { code: "INTERNAL_ERROR", message: `AI 服務發生錯誤: ${errorMessage}` },
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
