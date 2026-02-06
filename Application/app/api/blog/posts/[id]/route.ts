import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant, isWriteRole } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 文章更新 Schema
 */
const updatePostSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().optional(),
  contentMdx: z.string().optional(),
  summary: z.string().optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
  ogTitle: z.string().optional().nullable(),
  ogDescription: z.string().optional().nullable(),
  ogImageUrl: z.string().url().optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  categoryIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
});

/**
 * GET /api/blog/posts/[id]
 * 取得單一文章
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const post = await db.blogPost.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
      },
      include: {
        author: { select: { id: true, name: true } },
        categories: { include: { category: true } },
        tags: { include: { tag: true } },
      },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到文章" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("Get post error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得文章失敗" } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/blog/posts/[id]
 * 更新文章
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
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
    const validation = updatePostSchema.safeParse(body);

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

    // 檢查文章是否存在
    const existingPost = await db.blogPost.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
      },
    });

    if (!existingPost) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到文章" } },
        { status: 404 }
      );
    }

    const { categoryIds, tagIds, ...updateData } = validation.data;

    // [安全] 驗證 categoryIds 屬於同一 tenant，防止跨租戶注入
    if (categoryIds?.length) {
      const validCategories = await db.blogCategory.count({
        where: { id: { in: categoryIds }, tenantId: session.user.tenantId },
      });
      if (validCategories !== categoryIds.length) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_INPUT", message: "部分分類不存在或不屬於此租戶" } },
          { status: 400 }
        );
      }
    }

    // [安全] 驗證 tagIds 屬於同一 tenant，防止跨租戶注入
    if (tagIds?.length) {
      const validTags = await db.blogTag.count({
        where: { id: { in: tagIds }, tenantId: session.user.tenantId },
      });
      if (validTags !== tagIds.length) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_INPUT", message: "部分標籤不存在或不屬於此租戶" } },
          { status: 400 }
        );
      }
    }

    // 處理發布時間
    if (updateData.status === "PUBLISHED" && !existingPost.publishedAt) {
      Object.assign(updateData, { publishedAt: new Date() });
    }

    // 更新文章
    const post = await db.$transaction(async (tx) => {
      // 更新文章基本資料
      const updated = await tx.blogPost.update({
        where: { id, tenantId: session.user.tenantId },
        data: updateData,
      });

      // 更新分類關聯
      if (categoryIds !== undefined) {
        await tx.blogCategoryAssignment.deleteMany({
          where: { postId: id },
        });
        if (categoryIds.length > 0) {
          await tx.blogCategoryAssignment.createMany({
            data: categoryIds.map((categoryId) => ({
              id: generateId(),
              tenantId: session.user.tenantId,
              postId: id,
              categoryId,
            })),
          });
        }
      }

      // 更新標籤關聯
      if (tagIds !== undefined) {
        await tx.blogTagAssignment.deleteMany({
          where: { postId: id },
        });
        if (tagIds.length > 0) {
          await tx.blogTagAssignment.createMany({
            data: tagIds.map((tagId) => ({
              id: generateId(),
              tenantId: session.user.tenantId,
              postId: id,
              tagId,
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
        entityType: "BlogPost",
        entityId: id,
        oldValue: existingPost as object,
        newValue: post as object,
      },
    });

    // 重新取得完整文章資料用於生成 SEO JSON
    const fullPost = await db.blogPost.findFirst({
      where: { id, tenantId: session.user.tenantId },
      include: {
        author: { select: { id: true, name: true } },
        categories: { include: { category: true } },
        tags: { include: { tag: true } },
      },
    });

    // 生成 SEO JSON-LD
    if (fullPost) {
      try {
        const { generateBlogPostSeoJson } = await import("@/lib/seo/json-ld");
        const seoJson = generateBlogPostSeoJson({
          title: fullPost.title,
          slug: fullPost.slug,
          summary: fullPost.summary,
          contentMdx: fullPost.contentMdx,
          author: { name: fullPost.author.name },
          publishedAt: fullPost.publishedAt,
          updatedAt: fullPost.updatedAt,
          coverImageUrl: fullPost.coverImageUrl,
          seoTitle: fullPost.seoTitle,
          seoDescription: fullPost.seoDescription,
        });

        await db.blogPost.update({
          where: { id, tenantId: session.user.tenantId },
          data: { seoJson: seoJson as object },
        });

        return NextResponse.json({
          success: true,
          data: { ...fullPost, seoJson },
        });
      } catch (seoError) {
        console.warn("[Blog] SEO JSON-LD 生成失敗:", seoError);
      }
    }

    return NextResponse.json({
      success: true,
      data: fullPost || post,
    });
  } catch (error) {
    console.error("Update post error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新文章失敗" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/blog/posts/[id]
 * 刪除文章
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
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

    // 檢查文章是否存在
    const existingPost = await db.blogPost.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
      },
    });

    if (!existingPost) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到文章" } },
        { status: 404 }
      );
    }

    // 刪除文章
    await db.blogPost.delete({
      where: { id, tenantId: session.user.tenantId },
    });

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "DELETE",
        entityType: "BlogPost",
        entityId: id,
        oldValue: existingPost,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error("Delete post error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "刪除文章失敗" } },
      { status: 500 }
    );
  }
}
