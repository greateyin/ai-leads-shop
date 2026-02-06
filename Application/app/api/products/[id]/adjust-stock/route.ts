import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant, isWriteRole } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 庫存調整 Schema
 */
const adjustStockSchema = z.object({
    adjustment: z.number().int("調整數量必須為整數"),
    reason: z.string().min(1, "調整原因為必填"),
    variantId: z.string().uuid().optional(),
});

/**
 * POST /api/products/[id]/adjust-stock
 * 調整商品庫存
 */
export async function POST(
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
        const validation = adjustStockSchema.safeParse(body);

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

        const { adjustment, reason, variantId } = validation.data;

        // 檢查商品是否存在
        const product = await db.product.findFirst({
            where: {
                id,
                tenantId: session.user.tenantId,
                deletedAt: null,
            },
        });

        if (!product) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "商品不存在" } },
                { status: 404 }
            );
        }

        let oldStock: number;
        let newStock: number;
        let entityType: string;
        let entityId: string;

        if (variantId) {
            // 調整變體庫存
            const variant = await db.productVariant.findFirst({
                where: {
                    id: variantId,
                    productId: id,
                    tenantId: session.user.tenantId,
                },
            });

            if (!variant) {
                return NextResponse.json(
                    { success: false, error: { code: "NOT_FOUND", message: "商品規格不存在" } },
                    { status: 404 }
                );
            }

            oldStock = variant.stock ?? 0;
            newStock = oldStock + adjustment;

            if (newStock < 0) {
                return NextResponse.json(
                    { success: false, error: { code: "INVALID_STOCK", message: "調整後庫存不可為負數" } },
                    { status: 400 }
                );
            }

            await db.productVariant.update({
                where: { id: variantId, tenantId: session.user.tenantId },
                data: { stock: newStock },
            });

            entityType = "ProductVariant";
            entityId = variantId;
        } else {
            // 調整主商品庫存
            oldStock = product.stock;
            newStock = oldStock + adjustment;

            if (newStock < 0) {
                return NextResponse.json(
                    { success: false, error: { code: "INVALID_STOCK", message: "調整後庫存不可為負數" } },
                    { status: 400 }
                );
            }

            await db.product.update({
                where: { id, tenantId: session.user.tenantId },
                data: { stock: newStock },
            });

            entityType = "Product";
            entityId = id;
        }

        // 記錄審計日誌
        await db.auditLog.create({
            data: {
                id: generateId(),
                tenantId: session.user.tenantId,
                userId: session.user.id,
                action: "STOCK_ADJUSTMENT",
                entityType,
                entityId,
                oldValue: { stock: oldStock },
                newValue: { stock: newStock, adjustment, reason },
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                productId: id,
                variantId: variantId || null,
                oldStock,
                newStock,
                adjustment,
                reason,
            },
            message: `庫存已調整：${oldStock} → ${newStock}`,
        });
    } catch (error) {
        console.error("調整庫存錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "調整庫存失敗" } },
            { status: 500 }
        );
    }
}
