import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";

/**
 * AI 描述生成請求 Schema
 */
const generateDescriptionSchema = z.object({
  productName: z.string().min(1, "商品名稱為必填"),
  keywords: z.array(z.string()).optional().default([]),
});

/**
 * POST /api/ai/generate-description
 * 使用 DeepSeek AI SDK 生成商品描述
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "請先登入" },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = generateDescriptionSchema.safeParse(body);

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

    const { productName, keywords } = validation.data;

    // 建立 prompt
    const prompt = `請為以下商品生成吸引人的商品描述和常見問題 (FAQ)。

商品名稱：${productName}
${keywords.length > 0 ? `關鍵字：${keywords.join(", ")}` : ""}

請以 Markdown 格式輸出商品描述，內容包含：
1. 產品標題和簡介
2. 產品特色（3-5 點）
3. 適用場合
4. 3 個常見問題與解答

使用繁體中文回應。`;

    // 使用 AI SDK 呼叫 DeepSeek
    const result = await generateText({
      model: deepseek("deepseek-chat"),
      prompt,
    });

    const generatedDescription = result.text;

    // 記錄 AI 互動
    await db.aiInteraction.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        userId: session.user.id,
        type: "PRODUCT_DESCRIPTION",
        prompt,
        response: generatedDescription,
        model: "deepseek-chat",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        descriptionMd: generatedDescription,
        usage: result.usage,
      },
    });
  } catch (error) {
    console.error("AI 生成錯誤:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "AI 生成失敗" },
      },
      { status: 500 }
    );
  }
}
