import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 購物車項目新增 Schema
 */
const addItemSchema = z.object({
    productId: z.string().uuid("商品 ID 格式錯誤"),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().min(1, "數量至少為 1").default(1),
});

/**
 * GET /api/carts
 * 取得當前使用者的購物車
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

        // 取得或建立購物車
        let cart = await db.cart.findFirst({
            where: {
                tenantId: session.user.tenantId,
                userId: session.user.id,
            },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                price: true,
                                coverImageUrl: true,
                                stock: true,
                                status: true,
                            },
                        },
                        variant: {
                            select: {
                                id: true,
                                name: true,
                                price: true,
                                stock: true,
                                attributes: true,
                            },
                        },
                    },
                },
            },
        });

        if (!cart) {
            // 建立新購物車
            cart = await db.cart.create({
                data: {
                    id: generateId(),
                    tenantId: session.user.tenantId,
                    userId: session.user.id,
                    total: 0,
                },
                include: {
                    items: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    price: true,
                                    coverImageUrl: true,
                                    stock: true,
                                    status: true,
                                },
                            },
                            variant: {
                                select: {
                                    id: true,
                                    name: true,
                                    price: true,
                                    stock: true,
                                    attributes: true,
                                },
                            },
                        },
                    },
                },
            });
        }

        // 計算購物車總額
        const total = cart.items.reduce((sum, item) => {
            const price = item.variant?.price ?? item.product.price;
            return sum + Number(price) * item.quantity;
        }, 0);

        return NextResponse.json({
            success: true,
            data: {
                id: cart.id,
                items: cart.items.map((item) => ({
                    id: item.id,
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: item.quantity,
                    product: item.product,
                    variant: item.variant,
                    unitPrice: Number(item.variant?.price ?? item.product.price),
                    subtotal: Number(item.variant?.price ?? item.product.price) * item.quantity,
                })),
                total,
                itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
                currency: cart.currency,
            },
        });
    } catch (error) {
        console.error("取得購物車錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "取得購物車失敗" } },
            { status: 500 }
        );
    }
}

/**
 * POST /api/carts
 * 新增商品到購物車
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
        const validation = addItemSchema.safeParse(body);

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

        const { productId, variantId, quantity } = validation.data;

        // 檢查商品是否存在且已發布
        const product = await db.product.findFirst({
            where: {
                id: productId,
                tenantId: session.user.tenantId,
                status: "PUBLISHED",
                deletedAt: null,
            },
        });

        if (!product) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "商品不存在或已下架" } },
                { status: 404 }
            );
        }

        // 如有 variantId，檢查變體是否存在
        if (variantId) {
            const variant = await db.productVariant.findFirst({
                where: {
                    id: variantId,
                    productId,
                },
            });

            if (!variant) {
                return NextResponse.json(
                    { success: false, error: { code: "NOT_FOUND", message: "商品規格不存在" } },
                    { status: 404 }
                );
            }

            // 檢查庫存
            if (variant.stock !== null && variant.stock < quantity) {
                return NextResponse.json(
                    { success: false, error: { code: "INSUFFICIENT_STOCK", message: "庫存不足" } },
                    { status: 400 }
                );
            }
        } else {
            // 檢查主商品庫存
            if (product.stock < quantity) {
                return NextResponse.json(
                    { success: false, error: { code: "INSUFFICIENT_STOCK", message: "庫存不足" } },
                    { status: 400 }
                );
            }
        }

        // 取得或建立購物車
        let cart = await db.cart.findFirst({
            where: {
                tenantId: session.user.tenantId,
                userId: session.user.id,
            },
        });

        if (!cart) {
            cart = await db.cart.create({
                data: {
                    id: generateId(),
                    tenantId: session.user.tenantId,
                    userId: session.user.id,
                    total: 0,
                },
            });
        }

        // 檢查是否已有相同商品/變體
        const existingItem = await db.cartItem.findFirst({
            where: {
                cartId: cart.id,
                productId,
                variantId: variantId ?? null,
            },
        });

        let cartItem;
        if (existingItem) {
            // 更新數量
            cartItem = await db.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: existingItem.quantity + quantity },
                include: {
                    product: { select: { id: true, name: true, price: true, coverImageUrl: true } },
                    variant: { select: { id: true, name: true, price: true } },
                },
            });
        } else {
            // 新增項目
            cartItem = await db.cartItem.create({
                data: {
                    id: generateId(),
                    tenantId: session.user.tenantId,
                    cartId: cart.id,
                    productId,
                    variantId,
                    quantity,
                },
                include: {
                    product: { select: { id: true, name: true, price: true, coverImageUrl: true } },
                    variant: { select: { id: true, name: true, price: true } },
                },
            });
        }

        if (!cartItem) {
            return NextResponse.json(
                { success: false, error: { code: "INTERNAL_ERROR", message: "購物車項目更新失敗" } },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                id: cartItem.id,
                productId: cartItem.productId,
                variantId: cartItem.variantId,
                quantity: cartItem.quantity,
                product: cartItem.product,
                variant: cartItem.variant,
            },
            message: "商品已加入購物車",
        });
    } catch (error) {
        console.error("新增購物車項目錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "新增購物車項目失敗" } },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/carts
 * 清空當前使用者的購物車
 * 刪除所有購物車項目並重設購物車總額
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        // 查詢當前使用者的購物車
        const cart = await db.cart.findFirst({
            where: {
                tenantId: session.user.tenantId,
                userId: session.user.id,
            },
        });

        if (!cart) {
            return NextResponse.json({
                success: true,
                message: "購物車已為空",
            });
        }

        // 刪除購物車所有項目並重設總額
        await db.$transaction([
            db.cartItem.deleteMany({
                where: { cartId: cart.id },
            }),
            db.cart.update({
                where: { id: cart.id },
                data: { total: 0 },
            }),
        ]);

        return NextResponse.json({
            success: true,
            message: "購物車已清空",
        });
    } catch (error) {
        console.error("清空購物車錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "清空購物車失敗" } },
            { status: 500 }
        );
    }
}
