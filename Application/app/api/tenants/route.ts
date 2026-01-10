import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 租戶更新 Schema
 */
const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  plan: z.enum(["SEED", "GROWTH", "PRO"]).optional(),
});

/**
 * GET /api/tenants
 * 取得當前租戶資訊
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      include: {
        billingAccount: true,
        _count: {
          select: {
            users: true,
            shops: true,
            products: true,
            orders: true,
          },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到租戶" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: tenant });
  } catch (error) {
    console.error("取得租戶資訊錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得租戶資訊失敗" } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tenants
 * 更新租戶資訊
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId || session.user.role !== "OWNER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "權限不足" } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = updateTenantSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
        },
        { status: 400 }
      );
    }

    const tenant = await db.tenant.update({
      where: { id: session.user.tenantId },
      data: validation.data,
    });

    return NextResponse.json({
      success: true,
      data: tenant,
      message: "租戶資訊更新成功",
    });
  } catch (error) {
    console.error("更新租戶資訊錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新租戶資訊失敗" } },
      { status: 500 }
    );
  }
}
