import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * 商品建立 Schema
 */
const createProductSchema = z.object({
  name: z.string().min(1, "商品名稱為必填"),
  price: z.number().min(0, "價格不能為負數"),
  stock: z.number().int().min(0).optional().default(0),
  summary: z.string().optional(),
  descriptionMd: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT"),
});

/**
 * GET /api/products
 * 取得商品列表
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");

    const where = {
      tenantId: session.user.tenantId,
      deletedAt: null, // 排除軟刪除的商品
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { summary: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "DRAFT" | "PUBLISHED" | "ARCHIVED" }),
    };

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          categories: { include: { category: true } },
          variants: true,
        },
      }),
      db.product.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: products,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("取得商品列表錯誤:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得商品列表失敗" },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products
 * 建立新商品
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
    const validation = createProductSchema.safeParse(body);

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

    const { name, price, stock, summary, descriptionMd, status } =
      validation.data;

    // 取得用戶的第一個商店
    const shop = await db.shop.findFirst({
      where: { tenantId: session.user.tenantId },
    });

    if (!shop) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "找不到商店" },
        },
        { status: 404 }
      );
    }

    const product = await db.product.create({
      data: {
        tenantId: session.user.tenantId,
        shopId: shop.id,
        name,
        slug: slugify(name) + "-" + Date.now().toString(36),
        price,
        stock,
        summary,
        descriptionMd,
        status,
      },
    });

    return NextResponse.json({
      success: true,
      data: product,
      message: "商品建立成功",
    });
  } catch (error) {
    console.error("建立商品錯誤:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "建立商品失敗" },
      },
      { status: 500 }
    );
  }
}
