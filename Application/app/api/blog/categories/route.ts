import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * 分類建立 Schema
 */
const categorySchema = z.object({
  name: z.string().min(1, "名稱為必填"),
  slug: z.string().optional(),
  description: z.string().optional(),
});

/**
 * GET /api/blog/categories
 * 取得部落格分類列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
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

    const categories = await db.blogCategory.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        postCount: cat._count.posts,
      })),
    });
  } catch (error) {
    console.error("Get categories error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得分類列表失敗" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/blog/categories
 * 建立部落格分類
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = categorySchema.safeParse(body);

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

    const { name, slug, description } = validation.data;
    const finalSlug = slug || slugify(name);

    const category = await db.blogCategory.create({
      data: {
        tenantId: session.user.tenantId,
        name,
        slug: finalSlug,
        description,
      },
    });

    return NextResponse.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error("Create category error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立分類失敗" } },
      { status: 500 }
    );
  }
}
