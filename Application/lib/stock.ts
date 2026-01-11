/**
 * Stock Management Utilities
 * 庫存管理工具函式
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

interface OrderItem {
    productId: string;
    variantId?: string | null;
    quantity: number;
}

/**
 * 扣減庫存
 * @param items - 訂單項目，包含 productId, variantId, quantity
 * @throws Error if stock is insufficient
 */
export async function deductStock(items: OrderItem[]): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (const item of items) {
        if (item.variantId) {
            // 扣減變體庫存
            operations.push(
                db.productVariant.update({
                    where: { id: item.variantId },
                    data: {
                        stock: {
                            decrement: item.quantity,
                        },
                    },
                })
            );
        } else {
            // 扣減主商品庫存
            operations.push(
                db.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: {
                            decrement: item.quantity,
                        },
                    },
                })
            );
        }
    }

    await db.$transaction(operations);
}

/**
 * 恢復庫存（取消訂單或退款時使用）
 * @param items - 訂單項目
 */
export async function restoreStock(items: OrderItem[]): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (const item of items) {
        if (item.variantId) {
            operations.push(
                db.productVariant.update({
                    where: { id: item.variantId },
                    data: {
                        stock: {
                            increment: item.quantity,
                        },
                    },
                })
            );
        } else {
            operations.push(
                db.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: {
                            increment: item.quantity,
                        },
                    },
                })
            );
        }
    }

    await db.$transaction(operations);
}

/**
 * 檢查庫存是否足夠
 * @param items - 訂單項目
 * @returns 庫存不足的項目列表
 */
export async function checkStock(items: OrderItem[]): Promise<{
    sufficient: boolean;
    insufficientItems: { productId: string; variantId?: string; required: number; available: number }[];
}> {
    const insufficientItems: { productId: string; variantId?: string; required: number; available: number }[] = [];

    for (const item of items) {
        if (item.variantId) {
            const variant = await db.productVariant.findUnique({
                where: { id: item.variantId },
                select: { stock: true },
            });

            if (variant && variant.stock !== null && variant.stock < item.quantity) {
                insufficientItems.push({
                    productId: item.productId,
                    variantId: item.variantId,
                    required: item.quantity,
                    available: variant.stock,
                });
            }
        } else {
            const product = await db.product.findUnique({
                where: { id: item.productId },
                select: { stock: true },
            });

            if (product && product.stock < item.quantity) {
                insufficientItems.push({
                    productId: item.productId,
                    required: item.quantity,
                    available: product.stock,
                });
            }
        }
    }

    return {
        sufficient: insufficientItems.length === 0,
        insufficientItems,
    };
}

/**
 * 檢查商品庫存並發送低庫存通知
 * @param productId - 商品 ID
 * @param threshold - 安全庫存閾值，預設 10
 */
export async function checkLowStock(productId: string, threshold: number = 10): Promise<boolean> {
    const product = await db.product.findUnique({
        where: { id: productId },
        select: { stock: true, name: true },
    });

    if (product && product.stock <= threshold) {
        console.warn(`[低庫存警告] 商品 "${product.name}" 庫存僅剩 ${product.stock} 件`);
        // TODO: 發送低庫存通知 (Email/Line)
        return true;
    }

    return false;
}
