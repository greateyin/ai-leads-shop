import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 切換租戶請求驗證 Schema
 */
const switchTenantSchema = z.object({
  tenantId: z.string().min(1, "租戶 ID 為必填"),
});

/**
 * POST /api/tenants/switch
 * 切換當前使用者的活動租戶
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const validation = switchTenantSchema.safeParse(body);

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

    const { tenantId } = validation.data;

    // 驗證使用者是否有權限存取此租戶
    const userTenant = await db.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId,
        },
      },
      include: { tenant: true },
    });

    if (!userTenant) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "您沒有權限存取此租戶",
          },
        },
        { status: 403 }
      );
    }

    // 更新所有 userTenant 的 isDefault 狀態
    await db.$transaction([
      // 先將所有設為 false
      db.userTenant.updateMany({
        where: { userId: session.user.id },
        data: { isDefault: false },
      }),
      // 再將目標設為 true
      db.userTenant.update({
        where: { id: userTenant.id },
        data: { isDefault: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tenant: {
          id: userTenant.tenant.id,
          name: userTenant.tenant.name,
          subdomain: userTenant.tenant.subdomain,
          plan: userTenant.tenant.plan,
        },
        role: userTenant.role,
      },
    });
  } catch (error) {
    console.error("Switch tenant error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "切換租戶失敗" },
      },
      { status: 500 }
    );
  }
}
