import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { getVectorService } from "@/lib/vector";

/**
 * 聊天請求 Schema
 */
const chatRequestSchema = z.object({
    message: z.string().min(1, "訊息不可為空").max(2000, "訊息過長"),
    conversationId: z.string().uuid().optional(),
    context: z.object({
        productId: z.string().uuid().optional(),
        pageUrl: z.string().optional(),
    }).optional(),
});

/**
 * POST /api/ai/chat
 * AI 導購聊天 - 使用 RAG 回答問題
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const body = await request.json();
        const validation = chatRequestSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "資料格式錯誤",
                        details: validation.error.flatten(),
                    },
                },
                { status: 400 }
            );
        }

        const { message, conversationId, context } = validation.data;
        const tenantId = session.user.tenantId;

        // 1. 使用向量搜尋找到相關內容
        const vectorService = getVectorService();
        const searchResults = await vectorService.search(tenantId, message, {
            entityTypes: ["PRODUCT", "BLOG_POST", "FAQ"],
            limit: 5,
            minScore: 0.6,
        });

        // 2. 構建 RAG 上下文
        const ragContext = searchResults
            .map((r) => `[${r.entityType}] ${r.content}`)
            .join("\n\n");

        // 3. 如果有指定商品，取得商品資訊
        let productContext = "";
        if (context?.productId) {
            const product = await db.product.findFirst({
                where: {
                    id: context.productId,
                    tenantId,
                },
                select: {
                    name: true,
                    descriptionMd: true,
                    price: true,
                    stock: true,
                },
            });

            if (product) {
                productContext = `
目前查看的商品：
- 名稱：${product.name}
- 描述：${product.descriptionMd || "無"}
- 價格：${product.price}
- 庫存：${product.stock}
`;
            }
        }

        // 4. 呼叫 LLM 生成回應
        const systemPrompt = `你是一個專業的電商導購助手。請根據以下資訊回答顧客問題：

${ragContext ? `相關資料：\n${ragContext}\n` : ""}
${productContext}

回答規則：
1. 簡潔明瞭，專注回答問題
2. 如果資料中沒有相關資訊，請誠實告知
3. 適時推薦相關商品
4. 使用友善、專業的語氣`;

        const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message },
                ],
                max_tokens: 500,
                temperature: 0.7,
            }),
        });

        if (!llmResponse.ok) {
            const error = await llmResponse.text();
            console.error("LLM API error:", error);
            return NextResponse.json(
                { success: false, error: { code: "AI_ERROR", message: "AI 服務暫時無法使用" } },
                { status: 503 }
            );
        }

        const llmData = await llmResponse.json();
        const assistantMessage = llmData.choices[0]?.message?.content || "抱歉，無法生成回應";
        const tokenUsage = llmData.usage?.total_tokens || 0;

        // 5. 記錄 AI 互動
        const interaction = await db.aiInteraction.create({
            data: {
                id: generateId(),
                tenantId,
                userId: session.user.id,
                type: "CHAT",
                prompt: message,
                response: assistantMessage,
                model: "gpt-4o-mini",
            },
        });

        // 6. 記錄使用量
        const period = new Date();
        period.setDate(1);
        period.setHours(0, 0, 0, 0);
        const periodEnd = new Date(period.getFullYear(), period.getMonth() + 1, 0);

        await db.$executeRaw`
      INSERT INTO tenant_usage_metrics (id, tenant_id, metric_type, value, period_start, period_end, created_at, updated_at)
      VALUES (gen_random_uuid(), ${tenantId}::uuid, 'AI_TOKENS_PER_MONTH', ${tokenUsage}, ${period}, ${periodEnd}, NOW(), NOW())
      ON CONFLICT (tenant_id, metric_type, period_start)
      DO UPDATE SET value = tenant_usage_metrics.value + ${tokenUsage}, updated_at = NOW()
    `;

        return NextResponse.json({
            success: true,
            data: {
                message: assistantMessage,
                interactionId: interaction.id,
                sources: searchResults.map((r) => ({
                    type: r.entityType,
                    id: r.entityId,
                    score: r.score,
                })),
            },
        });
    } catch (error) {
        console.error("AI 聊天錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "AI 服務發生錯誤" } },
            { status: 500 }
        );
    }
}
