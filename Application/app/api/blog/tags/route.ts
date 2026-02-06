import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant, isWriteRole } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { generateId } from "@/lib/id";

/**
 * 標籤建立 Schema
 */
const tagSchema = z.object({
  name: z.string().min(1, "名稱為必填"),
  slug: z.string().optional(),
});

/**
 * GET /api/blog/tags
 * 取得部落格標籤列表
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
    const search = searchParams.get("search");

    const where = {
      tenantId: session.user.tenantId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { slug: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const tags = await db.blogTag.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        postCount: tag._count.posts,
      })),
    });
  } catch (error) {
    console.error("Get tags error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得標籤列表失敗" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/blog/tags
 * 建立部落格標籤
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
    const validation = tagSchema.safeParse(body);

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

    const { name, slug } = validation.data;
    const finalSlug = slug || slugify(name);

    const tag = await db.blogTag.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        name,
        slug: finalSlug,
      },
    });

    return NextResponse.json({
      success: true,
      data: tag,
    });
  } catch (error) {
    console.error("Create tag error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立標籤失敗" } },
      { status: 500 }
    );
  }
}
