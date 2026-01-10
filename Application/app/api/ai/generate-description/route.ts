import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * AI 描述生成請求 Schema
 */
const generateDescriptionSchema = z.object({
  productName: z.string().min(1, "商品名稱為必填"),
  keywords: z.array(z.string()).optional().default([]),
});

/**
 * POST /api/ai/generate-description
 * 使用 AI 生成商品描述
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

請以 Markdown 格式輸出商品描述，並在最後附上 3 個常見問題。`;

    // TODO: 整合 OpenAI API
    // 目前使用模擬回應
    const mockDescription = `## ${productName}

這是一款優質的 ${productName}，專為追求品質的您而設計。

### 產品特色

- **高品質材料**：採用頂級原料製作
- **精心設計**：注重每一個細節
- **實用耐用**：經久耐用，物超所值

### 適用場合

無論是日常使用還是特殊場合，${productName} 都是您的最佳選擇。

---

## 常見問題

**Q: 這個產品有保固嗎？**
A: 是的，我們提供 1 年保固服務。

**Q: 可以退換貨嗎？**
A: 7 天內可無條件退換貨。

**Q: 如何保養這個產品？**
A: 請參考產品說明書中的保養指南。`;

    // 記錄 AI 互動
    await db.aiInteraction.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        type: "PRODUCT_DESCRIPTION",
        prompt,
        response: mockDescription,
        model: "gpt-4-mock",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        descriptionMd: mockDescription,
        faq: [
          { question: "這個產品有保固嗎？", answer: "是的，我們提供 1 年保固服務。" },
          { question: "可以退換貨嗎？", answer: "7 天內可無條件退換貨。" },
          { question: "如何保養這個產品？", answer: "請參考產品說明書中的保養指南。" },
        ],
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
