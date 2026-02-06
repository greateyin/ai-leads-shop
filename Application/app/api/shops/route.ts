import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { generateId } from "@/lib/id";

/**
 * 商店建立/更新 Schema
 */
const shopSchema = z.object({
  name: z.string().min(1, "商店名稱為必填"),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  currency: z.string().default("TWD"),
  timezone: z.string().default("Asia/Taipei"),
  locale: z.string().default("zh-TW"),
  config: z.record(z.unknown()).optional(),
});

/**
 * GET /api/shops
 * 取得商店列表
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

    const shops = await db.shop.findMany({
      where: { tenantId: session.user.tenantId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: shops });
  } catch (error) {
    console.error("取得商店列表錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得商店列表失敗" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shops
 * 建立新商店
 */
export async function POST(request: NextRequest) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    // 檢查方案限制
    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      include: { _count: { select: { shops: true } } },
    });

    const maxShops = { SEED: 1, GROWTH: 3, PRO: 10 };
    if (tenant && tenant._count.shops >= maxShops[tenant.plan]) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: `您的方案最多只能建立 ${maxShops[tenant.plan]} 個商店` },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = shopSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
        },
        { status: 400 }
      );
    }

    const { name, description, logoUrl, currency, timezone, locale, config } = validation.data;

    const shop = await db.shop.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        ownerId: session.user.id,
        name,
        slug: slugify(name) + "-" + Date.now().toString(36),
        description,
        logoUrl,
        currency,
        timezone,
        locale,
        config: config as object | undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: shop,
      message: "商店建立成功",
    });
  } catch (error) {
    console.error("建立商店錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立商店失敗" } },
      { status: 500 }
    );
  }
}
