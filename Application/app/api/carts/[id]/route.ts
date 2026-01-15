import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 購物車項目更新 Schema
 */
const updateItemSchema = z.object({
    quantity: z.number().int().min(1, "數量至少為 1"),
});

/**
 * GET /api/carts/[id]
 * 取得購物車項目詳情
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

        const cartItem = await db.cartItem.findFirst({
            where: {
                id,
                cart: { tenantId: session.user.tenantId },
            },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        coverImageUrl: true,
                        stock: true,
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
        });

        if (!cartItem) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "購物車項目不存在" } },
                { status: 404 }
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
                unitPrice: Number(cartItem.variant?.price ?? cartItem.product.price),
                subtotal: Number(cartItem.variant?.price ?? cartItem.product.price) * cartItem.quantity,
            },
        });
    } catch (error) {
        console.error("取得購物車項目錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "取得購物車項目失敗" } },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/carts/[id]
 * 更新購物車項目數量
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
        const validation = updateItemSchema.safeParse(body);

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

        const { quantity } = validation.data;

        // 取得購物車項目
        const cartItem = await db.cartItem.findFirst({
            where: {
                id,
                cart: { tenantId: session.user.tenantId },
            },
            include: {
                product: { select: { stock: true } },
                variant: { select: { stock: true } },
            },
        });

        if (!cartItem) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "購物車項目不存在" } },
                { status: 404 }
            );
        }

        // 檢查庫存
        const availableStock = cartItem.variant?.stock ?? cartItem.product.stock;
        if (availableStock !== null && availableStock < quantity) {
            return NextResponse.json(
                { success: false, error: { code: "INSUFFICIENT_STOCK", message: `庫存不足，僅剩 ${availableStock} 件` } },
                { status: 400 }
            );
        }

        // 更新數量 (通過 cartId 關聯驗證 tenant)
        const cartId = cartItem.cartId;
        await db.cartItem.update({
            where: { id },
            data: { quantity },
        });
        // 重新取得更新後的資料
        const updatedItem = await db.cartItem.findFirst({
            where: { id },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        coverImageUrl: true,
                    },
                },
                variant: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                    },
                },
            },
        });

        if (!updatedItem) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "購物車項目不存在" } },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                id: updatedItem.id,
                productId: updatedItem.productId,
                variantId: updatedItem.variantId,
                quantity: updatedItem.quantity,
                product: updatedItem.product,
                variant: updatedItem.variant,
            },
            message: "購物車已更新",
        });
    } catch (error) {
        console.error("更新購物車項目錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "更新購物車項目失敗" } },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/carts/[id]
 * 刪除購物車項目
 */
export async function DELETE(
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

        // 檢查項目是否存在
        const cartItem = await db.cartItem.findFirst({
            where: {
                id,
                cart: { tenantId: session.user.tenantId },
            },
        });

        if (!cartItem) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "購物車項目不存在" } },
                { status: 404 }
            );
        }

        // 刪除項目
        await db.cartItem.delete({
            where: { id },
        });

        return NextResponse.json({
            success: true,
            data: { id },
            message: "商品已從購物車移除",
        });
    } catch (error) {
        console.error("刪除購物車項目錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "刪除購物車項目失敗" } },
            { status: 500 }
        );
    }
}
