import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/products/public
 * 公開商品列表 - 不需要認證
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "12");
        const category = searchParams.get("category");
        const search = searchParams.get("search");
        const sortBy = searchParams.get("sortBy") || "createdAt";
        const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

        // 建立查詢條件
        const where = {
            status: "PUBLISHED" as const,
            deletedAt: null,
            ...(category && {
                categories: {
                    some: {
                        category: {
                            slug: category,
                        },
                    },
                },
            }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: "insensitive" as const } },
                    { summary: { contains: search, mode: "insensitive" as const } },
                ],
            }),
        };

        // 建立排序
        const orderBy: Record<string, "asc" | "desc"> = {};
        if (sortBy === "price" || sortBy === "createdAt" || sortBy === "name") {
            orderBy[sortBy] = sortOrder;
        } else {
            orderBy.createdAt = "desc";
        }

        // 執行查詢
        const [products, total, categories] = await Promise.all([
            db.product.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    summary: true,
                    price: true,
                    stock: true,
                    coverImageUrl: true,
                    createdAt: true,
                    categories: {
                        select: {
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                    shop: {
                        select: {
                            name: true,
                            slug: true,
                        },
                    },
                },
            }),
            db.product.count({ where }),
            // 取得所有分類（供篩選用）
            db.productCategory.findMany({
                where: {
                    products: {
                        some: {
                            product: {
                                status: "PUBLISHED",
                                deletedAt: null,
                            },
                        },
                    },
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    _count: {
                        select: {
                            products: true,
                        },
                    },
                },
                orderBy: { name: "asc" },
            }),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                products: products.map((p) => ({
                    ...p,
                    price: Number(p.price),
                    categories: p.categories.map((c) => c.category),
                })),
                categories: categories.map((c) => ({
                    ...c,
                    productCount: c._count.products,
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
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
