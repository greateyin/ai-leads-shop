import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * 商店更新 Schema
 */
const updateShopSchema = z.object({
    name: z.string().min(1, "商店名稱為必填").optional(),
    description: z.string().optional(),
    logoUrl: z.string().url().optional(),
    currency: z.string().optional(),
    timezone: z.string().optional(),
    locale: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

/**
 * GET /api/shops/[id]
 * 取得特定商店資訊
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const { id } = await params;

        const shop = await db.shop.findFirst({
            where: { id, tenantId: session.user.tenantId },
            include: {
                _count: {
                    select: {
                        products: true,
                        orders: true,
                    },
                },
            },
        });

        if (!shop) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "找不到商店" } },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, data: shop });
    } catch (error) {
        console.error("取得商店資訊錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "取得商店資訊失敗" } },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/shops/[id]
 * 更新商店資訊
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const { id } = await params;
        const body = await request.json();
        const validation = updateShopSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
                },
                { status: 400 }
            );
        }

        // 確認商店存在且屬於該租戶
        const existingShop = await db.shop.findFirst({
            where: { id, tenantId: session.user.tenantId },
        });

        if (!existingShop) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "找不到商店" } },
                { status: 404 }
            );
        }

        // 若有更新名稱，同步更新 slug (可選)
        let slug = existingShop.slug;
        if (validation.data.name && validation.data.name !== existingShop.name) {
            slug = slugify(validation.data.name) + "-" + Date.now().toString(36);
        }

        const shop = await db.shop.update({
            where: { id },
            data: {
                ...validation.data,
                slug,
                config: validation.data.config ? (validation.data.config as any) : undefined,
            },
        });

        return NextResponse.json({
            success: true,
            data: shop,
            message: "商店資訊更新成功",
        });
    } catch (error) {
        console.error("更新商店資訊錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "更新商店資訊失敗" } },
            { status: 500 }
        );
    }
}
