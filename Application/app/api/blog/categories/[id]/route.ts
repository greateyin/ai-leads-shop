import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * 分類更新 Schema
 */
const updateCategorySchema = z.object({
    name: z.string().min(1, "名稱為必填").optional(),
    slug: z.string().optional(),
    description: z.string().optional(),
});

/**
 * PUT /api/blog/categories/[id]
 * 更新部落格分類
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

        const { id } = await params;

        // 確認分類存在且屬於當前租戶
        const existing = await db.blogCategory.findFirst({
            where: { id, tenantId: session.user.tenantId },
        });

        if (!existing) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "找不到分類" } },
                { status: 404 }
            );
        }

        const body = await request.json();
        const validation = updateCategorySchema.safeParse(body);

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

        // 若有更新 name 且未指定 slug，自動產生 slug
        const finalSlug = slug ?? (name ? slugify(name) : undefined);

        const category = await db.blogCategory.update({
            where: { id, tenantId: session.user.tenantId },
            data: {
                ...(name && { name }),
                ...(finalSlug && { slug: finalSlug }),
                ...(description !== undefined && { description }),
            },
        });

        return NextResponse.json({
            success: true,
            data: category,
            message: "分類更新成功",
        });
    } catch (error) {
        console.error("Update category error:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "更新分類失敗" } },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/blog/categories/[id]
 * 刪除部落格分類（僅在無關聯文章時允許刪除）
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

        const { id } = await params;

        // 確認分類存在且屬於當前租戶
        const existing = await db.blogCategory.findFirst({
            where: { id, tenantId: session.user.tenantId },
            include: { _count: { select: { posts: true } } },
        });

        if (!existing) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "找不到分類" } },
                { status: 404 }
            );
        }

        // 若分類下仍有文章，拒絕刪除
        if (existing._count.posts > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "HAS_REFERENCES",
                        message: `此分類下仍有 ${existing._count.posts} 篇文章，請先移除或更換分類`,
                    },
                },
                { status: 409 }
            );
        }

        await db.blogCategory.delete({
            where: { id, tenantId: session.user.tenantId },
        });

        return NextResponse.json({
            success: true,
            message: "分類刪除成功",
        });
    } catch (error) {
        console.error("Delete category error:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "刪除分類失敗" } },
            { status: 500 }
        );
    }
}
