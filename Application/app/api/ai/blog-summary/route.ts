import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant, isWriteRole } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";

/**
 * 部落格摘要生成請求 Schema
 */
const generateBlogSummarySchema = z.object({
    title: z.string().min(1, "標題為必填"),
    content: z.string().min(1, "內容為必填"),
});

/**
 * POST /api/ai/blog-summary
 * 使用 DeepSeek AI 生成部落格文章摘要
 */
export async function POST(request: NextRequest) {
    try {
        const { session } = await authWithTenant();
        if (!session) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "UNAUTHORIZED", message: "請先登入" },
                },
                { status: 401 }
            );
        }

        // [RBAC] AI 工具需至少 STAFF 角色
        if (!isWriteRole(session.user.role)) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "權限不足" } },
                { status: 403 }
            );
        }

        const body = await request.json();
        const validation = generateBlogSummarySchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "INVALID_INPUT",
                        message: validation.error.errors[0].message,
                    },
                },
                { status: 400 }
            );
        }

        const { title, content } = validation.data;

        // 建立 prompt
        const prompt = `請為以下部落格文章生成一段簡潔的摘要（150-200字）。

文章標題：${title}

文章內容：
${content.substring(0, 2000)}

請直接輸出摘要文字，不要加任何前綴或標題，使用繁體中文。`;

        // 使用 AI SDK 呼叫 DeepSeek
        const result = await generateText({
            model: deepseek("deepseek-chat"),
            prompt,
        });

        const summary = result.text.trim();

        // 記錄 AI 互動
        await db.aiInteraction.create({
            data: {
                id: generateId(),
                tenantId: session.user.tenantId,
                userId: session.user.id,
                type: "BLOG_SUMMARY",
                prompt,
                response: summary,
                model: "deepseek-chat",
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                summary,
                usage: result.usage,
            },
        });
    } catch (error) {
        console.error("AI 生成錯誤:", error);
        const errorMessage = error instanceof Error ? error.message : "未知錯誤";
        return NextResponse.json(
            {
                success: false,
                error: { code: "INTERNAL_ERROR", message: `AI 生成失敗: ${errorMessage}` },
            },
            { status: 500 }
        );
    }
}
