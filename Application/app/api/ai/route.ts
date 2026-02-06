import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { createAIService } from "@/lib/ai";
import { generateId } from "@/lib/id";

/**
 * AI 請求驗證 Schema
 */
const aiRequestSchema = z.object({
  type: z.enum([
    "product_description",
    "blog_summary",
    "chat",
    "seo",
    "forecast",
  ]),
  input: z.record(z.unknown()),
});

/**
 * POST /api/ai
 * 統一的 AI 服務 Proxy
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

    const body = await request.json();
    const validation = aiRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "驗證失敗",
            details: validation.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { type, input } = validation.data;
    let result: unknown;
    let aiInteractionType: "PRODUCT_DESCRIPTION" | "FAQ" | "BLOG_SUMMARY" | "CHAT";

    // 建立 AI 服務實例
    const aiService = createAIService();

    // 根據類型呼叫對應的 AI 服務
    switch (type) {
      case "product_description":
        aiInteractionType = "PRODUCT_DESCRIPTION";
        result = await aiService.generateProductDescription({
          productName: input.productName as string,
          keywords: input.keywords as string[] | undefined,
        });
        break;

      case "blog_summary":
        aiInteractionType = "BLOG_SUMMARY";
        result = await aiService.generateBlogSummary(
          input.content as string
        );
        break;

      case "chat":
        aiInteractionType = "CHAT";
        result = await aiService.chat([
          { role: "user", content: input.message as string },
        ]);
        break;

      case "seo":
        aiInteractionType = "BLOG_SUMMARY";
        result = await aiService.generateProductDescription({
          productName: input.title as string,
          keywords: [input.content as string],
        });
        break;

      case "forecast":
        aiInteractionType = "FAQ";
        // 銷售預測使用通用 chat 功能
        result = await aiService.chat([
          {
            role: "user",
            content: `請分析以下銷售數據並預測未來趨勢：\n${JSON.stringify(input.salesData)}`,
          },
        ]);
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_TYPE", message: "不支援的 AI 服務類型" },
          },
          { status: 400 }
        );
    }

    // 記錄 AI 互動
    await db.aiInteraction.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        userId: session.user.id,
        type: aiInteractionType,
        prompt: JSON.stringify(input),
        response: JSON.stringify(result),
        model: "gpt-4",
      },
    });

    // 更新用量統計
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    await db.tenantUsageMetric.upsert({
      where: {
        tenantId_metricType_periodStart: {
          tenantId: session.user.tenantId,
          metricType: "AI_TOKENS",
          periodStart: currentMonth,
        },
      },
      update: {
        value: { increment: 1 }, // 簡化計算，實際應計算 token 數
      },
      create: {
        id: generateId(),
        tenantId: session.user.tenantId,
        metricType: "AI_TOKENS",
        value: 1,
        periodStart: currentMonth,
        periodEnd: nextMonth,
      },
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("AI service error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "AI 服務處理失敗" },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai
 * 取得 AI 使用記錄
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const type = searchParams.get("type");

    const where = {
      tenantId: session.user.tenantId,
      ...(type && { type: type as "PRODUCT_DESCRIPTION" | "BLOG_SUMMARY" | "CHAT" | "FAQ" | "SEO_CONTENT" | "SALES_FORECAST" }),
    };

    const [interactions, total] = await Promise.all([
      db.aiInteraction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          prompt: true,
          model: true,
          createdAt: true,
        },
      }),
      db.aiInteraction.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: interactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get AI interactions error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得 AI 記錄失敗" },
      },
      { status: 500 }
    );
  }
}
