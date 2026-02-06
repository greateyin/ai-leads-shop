import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant, isWriteRole } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { generateId } from "@/lib/id";

/**
 * 文章建立/更新 Schema
 */
const postSchema = z.object({
  title: z.string().min(1, "標題為必填"),
  contentMdx: z.string().min(1, "內容為必填"),
  summary: z.string().optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
  ogTitle: z.string().optional().nullable(),
  ogDescription: z.string().optional().nullable(),
  ogImageUrl: z.string().url().optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT"),
  categoryIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
});

/**
 * GET /api/blog/posts
 * 取得文章列表
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
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where = {
      tenantId: session.user.tenantId,
      ...(status && { status: status as "DRAFT" | "PUBLISHED" }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { summary: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [posts, total] = await Promise.all([
      db.blogPost.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true } },
          categories: { include: { category: true } },
          tags: { include: { tag: true } },
        },
      }),
      db.blogPost.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: posts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get posts error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得文章列表失敗" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/blog/posts
 * 建立新文章
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

    // [RBAC] 寫入操作需至少 STAFF 角色
    if (!isWriteRole(session.user.role)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "權限不足" } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = postSchema.safeParse(body);

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

    const { categoryIds, tagIds, ...postData } = validation.data;

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

    const slug = slugify(postData.title);

    // 檢查 slug 是否重複
    const existingPost = await db.blogPost.findUnique({
      where: {
        tenantId_slug: {
          tenantId: session.user.tenantId,
          slug,
        },
      },
    });

    const finalSlug = existingPost ? `${slug}-${Date.now()}` : slug;

    const post = await db.blogPost.create({
      data: {
        id: generateId(),
        ...postData,
        slug: finalSlug,
        tenantId: session.user.tenantId,
        authorId: session.user.id,
        publishedAt: postData.status === "PUBLISHED" ? new Date() : null,
        categories: categoryIds?.length
          ? {
            create: categoryIds.map((categoryId) => ({
              id: generateId(),
              tenantId: session.user.tenantId,
              categoryId,
            })),
          }
          : undefined,
        tags: tagIds?.length
          ? {
            create: tagIds.map((tagId) => ({
              id: generateId(),
              tenantId: session.user.tenantId,
              tagId,
            })),
          }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true } },
        categories: { include: { category: true } },
        tags: { include: { tag: true } },
      },
    });

    // 生成 SEO JSON-LD
    try {
      const { generateBlogPostSeoJson } = await import("@/lib/seo/json-ld");
      const seoJson = generateBlogPostSeoJson({
        title: post.title,
        slug: post.slug,
        summary: post.summary,
        contentMdx: post.contentMdx,
        author: { name: post.author.name },
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        coverImageUrl: post.coverImageUrl,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
      });

      await db.blogPost.update({
        where: { id: post.id },
        data: { seoJson: seoJson as object },
      });

      // 返回包含 seoJson 的 post
      return NextResponse.json({
        success: true,
        data: { ...post, seoJson },
      });
    } catch (seoError) {
      console.warn("[Blog] SEO JSON-LD 生成失敗:", seoError);
    }

    return NextResponse.json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("Create post error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立文章失敗" } },
      { status: 500 }
    );
  }
}
