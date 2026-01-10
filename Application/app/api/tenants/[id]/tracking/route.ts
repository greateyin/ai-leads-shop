import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 追蹤設定更新 Schema
 */
const updateTrackingSchema = z.object({
  ga4MeasurementId: z.string().optional().nullable(),
  metaPixelId: z.string().optional().nullable(),
  gtmContainerId: z.string().optional().nullable(),
  tiktokPixelId: z.string().optional().nullable(),
  lineTagId: z.string().optional().nullable(),
  customScripts: z.any().optional().nullable(),
});

/**
 * GET /api/tenants/[id]/tracking
 * 取得租戶追蹤設定
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "請先登入" },
        },
        { status: 401 }
      );
    }

    const { id: tenantId } = await params;

    // 驗證使用者權限
    const userTenant = await db.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId,
        },
      },
    });

    if (!userTenant) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "無權限查看此租戶設定" },
        },
        { status: 403 }
      );
    }

    // 取得追蹤設定
    const trackingSettings = await db.trackingSettings.findUnique({
      where: { tenantId },
    });

    return NextResponse.json({
      success: true,
      data: trackingSettings || {
        tenantId,
        ga4MeasurementId: null,
        metaPixelId: null,
        gtmContainerId: null,
        tiktokPixelId: null,
        lineTagId: null,
        customScripts: null,
      },
    });
  } catch (error) {
    console.error("Get tracking settings error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得追蹤設定失敗" },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tenants/[id]/tracking
 * 更新租戶追蹤設定
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "請先登入" },
        },
        { status: 401 }
      );
    }

    const { id: tenantId } = await params;

    // 驗證使用者權限 (需要 OWNER 或 ADMIN)
    const userTenant = await db.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId,
        },
      },
    });

    if (!userTenant || !["OWNER", "ADMIN"].includes(userTenant.role)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "無權限修改此租戶設定" },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = updateTrackingSchema.safeParse(body);

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

    const data = validation.data;

    // 使用 upsert 建立或更新追蹤設定
    const trackingSettings = await db.trackingSettings.upsert({
      where: { tenantId },
      update: {
        ga4MeasurementId: data.ga4MeasurementId,
        metaPixelId: data.metaPixelId,
        gtmContainerId: data.gtmContainerId,
        tiktokPixelId: data.tiktokPixelId,
        lineTagId: data.lineTagId,
        customScripts: data.customScripts,
      },
      create: {
        tenantId,
        ga4MeasurementId: data.ga4MeasurementId,
        metaPixelId: data.metaPixelId,
        gtmContainerId: data.gtmContainerId,
        tiktokPixelId: data.tiktokPixelId,
        lineTagId: data.lineTagId,
        customScripts: data.customScripts,
      },
    });

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        action: "UPDATE_TRACKING_SETTINGS",
        entityType: "TrackingSettings",
        entityId: trackingSettings.id,
        newValue: data,
      },
    });

    return NextResponse.json({
      success: true,
      data: trackingSettings,
    });
  } catch (error) {
    console.error("Update tracking settings error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "更新追蹤設定失敗" },
      },
      { status: 500 }
    );
  }
}
