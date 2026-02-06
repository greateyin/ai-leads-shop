import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 事件記錄 Schema
 */
const eventSchema = z.object({
  eventName: z.string().min(1, "事件名稱為必填"),
  sessionId: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

/**
 * POST /api/analytics/event
 * 記錄分析事件
 */
export async function POST(request: NextRequest) {
  try {
    const { session, tenantId } = await authWithTenant();

    if (!session || !tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = eventSchema.safeParse(body);

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

    const { eventName, sessionId, properties } = validation.data;

    // 記錄事件
    const event = await db.analyticsEvent.create({
      data: {
        id: generateId(),
        tenantId,
        userId: session.user?.id,
        sessionId,
        eventName,
        properties: (properties || {}) as object,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: event.id },
    });
  } catch (error) {
    console.error("Record event error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "記錄事件失敗" } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/event
 * 取得事件統計
 */
export async function GET(request: NextRequest) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const eventName = searchParams.get("eventName");

    const where = {
      tenantId: session.user.tenantId,
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
      ...(eventName && { eventName }),
    };

    // 取得事件統計
    const [events, totalCount] = await Promise.all([
      db.analyticsEvent.groupBy({
        by: ["eventName"],
        where,
        _count: { eventName: true },
        orderBy: { _count: { eventName: "desc" } },
        take: 20,
      }),
      db.analyticsEvent.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        events: events.map((e) => ({
          eventName: e.eventName,
          count: e._count.eventName,
        })),
        totalCount,
      },
    });
  } catch (error) {
    console.error("Get events error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得事件統計失敗" } },
      { status: 500 }
    );
  }
}
