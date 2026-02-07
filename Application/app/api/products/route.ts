import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { generateId } from "@/lib/id";
import { withAuth, withStaffAuth, type AuthenticatedSession } from "@/lib/api/with-auth";

/**
 * 商品建立 Schema (含 variants 與 assets)
 */
const createProductSchema = z.object({
  name: z.string().min(1, "商品名稱為必填"),
  price: z.number().min(0, "價格不能為負數"),
  cost: z.number().min(0).optional(),
  stock: z.number().int().min(0).optional().default(0),
  sku: z.string().optional(),
  summary: z.string().optional(),
  descriptionMd: z.string().optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT"),
  categoryIds: z.array(z.string().uuid()).optional(),
  variants: z.array(z.object({
    name: z.string().min(1, "規格名稱為必填"),
    sku: z.string().optional(),
    price: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    attributes: z.record(z.string()).optional(),
  })).optional(),
  assets: z.array(z.object({
    type: z.enum(["IMAGE", "VIDEO", "PDF"]),
    url: z.string().url(),
    altText: z.string().optional(),
    sortOrder: z.number().int().optional(),
  })).max(12, "單一商品最多 12 張媒體附件").optional(),
});

/**
 * GET /api/products
 * 取得商品列表
 */
export const GET = withAuth(async (request: NextRequest, session: AuthenticatedSession) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const categoryId = searchParams.get("categoryId");

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
      ...(categoryId && {
        categories: { some: { categoryId } },
      }),
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
});

/**
 * POST /api/products
 * 建立新商品（需要 OWNER / ADMIN / STAFF 角色）
 */
export const POST = withStaffAuth(async (request: NextRequest, session: AuthenticatedSession) => {
  try {
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

    const { name, price, stock, summary, descriptionMd, status, categoryIds, variants, assets } =
      validation.data;
    const cost = (validation.data as { cost?: number }).cost;
    const sku = (validation.data as { sku?: string }).sku;
    const coverImageUrl = (validation.data as { coverImageUrl?: string | null }).coverImageUrl;

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

    // [安全] 驗證 categoryIds 屬於同一 tenant，防止跨租戶注入
    if (categoryIds && categoryIds.length > 0) {
      const validCategories = await db.productCategory.count({
        where: { id: { in: categoryIds }, tenantId: session.user.tenantId },
      });
      if (validCategories !== categoryIds.length) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_INPUT", message: "部分商品分類不存在或不屬於此租戶" } },
          { status: 400 }
        );
      }
    }

    const productId = generateId();

    const product = await db.$transaction(async (tx) => {
      // 建立商品
      const newProduct = await tx.product.create({
        data: {
          id: productId,
          tenantId: session.user.tenantId,
          shopId: shop.id,
          name,
          slug: slugify(name) + "-" + Date.now().toString(36),
          price,
          cost,
          stock,
          sku,
          summary,
          descriptionMd,
          coverImageUrl,
          status,
        },
      });

      // 建立分類關聯
      if (categoryIds && categoryIds.length > 0) {
        await tx.productCategoryAssignment.createMany({
          data: categoryIds.map((categoryId: string) => ({
            id: generateId(),
            tenantId: session.user.tenantId,
            productId,
            categoryId,
          })),
        });
      }

      // 建立規格變體
      if (variants && variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((variant: { name: string; sku?: string; price?: number; stock?: number; attributes?: Record<string, string> }, index: number) => ({
            id: generateId(),
            tenantId: session.user.tenantId,
            productId,
            name: variant.name,
            sku: variant.sku || `${sku || ""}-V${index + 1}`,
            price: variant.price ?? price,
            stock: variant.stock ?? 0,
            attributes: variant.attributes || {},
          })),
        });
      }

      // 建立商品媒體資產
      if (assets && assets.length > 0) {
        await tx.productAsset.createMany({
          data: assets.map((asset: { type: "IMAGE" | "VIDEO" | "PDF"; url: string; altText?: string; sortOrder?: number }, index: number) => ({
            id: generateId(),
            tenantId: session.user.tenantId,
            productId,
            type: asset.type,
            url: asset.url,
            altText: asset.altText,
            sortOrder: asset.sortOrder ?? index,
          })),
        });
      }

      return newProduct;
    });

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "CREATE",
        entityType: "Product",
        entityId: product.id,
        newValue: { name, price, stock, status, categoryCount: categoryIds?.length, variantCount: variants?.length, assetCount: assets?.length },
      },
    });

    // 回傳完整商品資料
    const fullProduct = await db.product.findUnique({
      where: { id: product.id },
      include: {
        categories: { include: { category: true } },
        variants: true,
        assets: { orderBy: { sortOrder: "asc" } },
      },
    });

    return NextResponse.json({
      success: true,
      data: fullProduct,
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
});
