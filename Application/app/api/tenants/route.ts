import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";

/**
 * 租戶更新 Schema
 */
const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  plan: z.enum(["SEED", "GROWTH", "PRO"]).optional(),
});

/**
 * 租戶建立 Schema
 */
const createTenantSchema = z.object({
  name: z.string().min(1, "租戶名稱為必填"),
  email: z.string().email("無效的 Email 格式"),
  password: z.string().min(8, "密碼至少需 8 個字元"),
  plan: z.enum(["SEED", "GROWTH", "PRO"]).default("SEED"),
});

/**
 * POST /api/tenants
 * 建立新租戶 (註冊)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createTenantSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
        },
        { status: 400 }
      );
    }

    const { name, email, password, plan } = validation.data;

    // 檢查 email 是否已存在
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_EXISTS", message: "Email 已被註冊" } },
        { status: 409 }
      );
    }

    const { generateId } = await import("@/lib/id");
    const { hashPassword } = await import("@/lib/auth");

    // 建立租戶與使用者 (Transaction)
    const result = await db.$transaction(async (tx) => {
      const tenantId = generateId();
      const userId = generateId();
      const hashedPassword = await hashPassword(password);


      const { slugify } = await import("@/lib/utils");
      const tenantSlug = slugify(name) + "-" + Date.now().toString(36);

      // 1. 建立租戶
      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name,
          subdomain: tenantSlug,
          plan,
          status: "ACTIVE",
          billingAccount: {
            create: {
              id: generateId(),
              currency: "TWD",
              status: "ACTIVE",
              plan,
            },
          },
        },
      });

      // 2. 建立使用者 (Owner)
      const user = await tx.user.create({
        data: {
          id: userId,
          tenantId,
          email,
          name: name, // 預設使用者名稱為租戶名稱
          passwordHash: hashedPassword,
          role: "OWNER",
        },
      });

      // 2.5 建立 UserTenant 關聯 (owner 對應的租戶關係)
      await tx.userTenant.create({
        data: {
          id: generateId(),
          userId,
          tenantId,
          role: "OWNER",
          status: "ACTIVE",
          isDefault: true,
        },
      });

      // 3. 建立預設商店 (Spec Requirement)
      const shopSlug = slugify(name) + "-shop-" + Date.now().toString(36);

      const shop = await tx.shop.create({
        data: {
          id: generateId(),
          tenantId,
          ownerId: userId,
          name: name, // 預設商店名稱與租戶相同
          slug: shopSlug,
          currency: "TWD",
          timezone: "Asia/Taipei",
          locale: "zh-TW",
        },
      });

      return { tenant, user, shop };
    });

    return NextResponse.json({
      success: true,
      data: {
        tenant: result.tenant,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
        },
        shop: result.shop,
      },
      message: "租戶與商店建立成功",
    });
  } catch (error) {
    console.error("建立租戶錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立租戶失敗" } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tenants
 * 取得當前租戶資訊
 */
export async function GET() {
  try {
    const { session } = await authWithTenant();
    if (!session) {
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
    const { session } = await authWithTenant();
    if (!session || session.user.role !== "OWNER") {
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
