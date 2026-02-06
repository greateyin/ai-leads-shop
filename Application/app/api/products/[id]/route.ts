import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant, isWriteRole } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 商品更新驗證 Schema
 */
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  descriptionMd: z.string().optional(),
  price: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  sku: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  ogTitle: z.string().optional().nullable(),
  ogDescription: z.string().optional().nullable(),
  ogImageUrl: z.string().url().optional().nullable(),
  categoryIds: z.array(z.string()).optional(),
});

/**
 * GET /api/products/[id]
 * 取得單一商品詳情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const product = await db.product.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        deletedAt: null,
      },
      include: {
        categories: {
          include: { category: true },
        },
        variants: true,
        assets: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "找不到商品" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get product error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得商品失敗" },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/products/[id]
 * 完整更新商品
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // [RBAC] 寫入操作需至少 STAFF 角色
    if (!isWriteRole(session.user.role)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "權限不足" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateProductSchema.safeParse(body);

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

    // 檢查商品是否存在
    const existingProduct = await db.product.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        deletedAt: null,
      },
    });

    if (!existingProduct) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "找不到商品" },
        },
        { status: 404 }
      );
    }

    const { categoryIds, ...updateData } = validation.data;

    // 產品更新限制 Logic (Spec Section 4.3)
    // 若產品已發布，僅允許特定欄位可編輯 (如價格、庫存、OG metadata)
    if (existingProduct.status === "PUBLISHED") {
      // 白名單：只有這些欄位可以在已發布狀態下修改
      const allowedFieldsForPublished = [
        "price",
        "cost",
        "stock",
        "coverImageUrl",
        "ogTitle",
        "ogDescription",
        "ogImageUrl",
      ];

      const attemptedChanges = Object.keys(updateData);
      const disallowedChanges = attemptedChanges.filter(
        (field) => !allowedFieldsForPublished.includes(field)
      );

      if (disallowedChanges.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN_UPDATE",
              message: `已發布的商品僅可修改價格、庫存與 OG 設定。欲修改其他欄位 (${disallowedChanges.join(", ")}) 請先下架商品`,
            },
          },
          { status: 422 }
        );
      }
    }

    // 更新商品
    const product = await db.$transaction(async (tx) => {
      // 更新商品基本資料
      const updated = await tx.product.update({
        where: { id, tenantId: session.user.tenantId },
        data: updateData,
      });

      // 更新分類關聯
      if (categoryIds !== undefined) {
        await tx.productCategoryAssignment.deleteMany({
          where: { productId: id, tenantId: session.user.tenantId },
        });

        if (categoryIds.length > 0) {
          await tx.productCategoryAssignment.createMany({
            data: categoryIds.map((categoryId: string) => ({
              id: generateId(),
              tenantId: session.user.tenantId,
              productId: id,
              categoryId,
            })),
          });
        }
      }

      return updated;
    });

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "UPDATE",
        entityType: "Product",
        entityId: id,
        oldValue: existingProduct,
        newValue: product,
      },
    });

    return NextResponse.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Update product error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "更新商品失敗" },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/products/[id]
 * 部分更新商品
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // PATCH 與 PUT 使用相同邏輯
  return PUT(request, { params });
}

/**
 * DELETE /api/products/[id]
 * 軟刪除商品
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // [RBAC] 寫入操作需至少 STAFF 角色
    if (!isWriteRole(session.user.role)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "權限不足" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 檢查商品是否存在
    const product = await db.product.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        deletedAt: null,
      },
    });

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "找不到商品" },
        },
        { status: 404 }
      );
    }

    // 軟刪除商品 (status=ARCHIVED + deletedAt)
    await db.product.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "ARCHIVED",
        deletedAt: new Date(),
      },
    });

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "DELETE",
        entityType: "Product",
        entityId: id,
        oldValue: product,
      },
    });

    return NextResponse.json({
      success: true,
      data: { message: "商品已刪除" },
    });
  } catch (error) {
    console.error("Delete product error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "刪除商品失敗" },
      },
      { status: 500 }
    );
  }
}
