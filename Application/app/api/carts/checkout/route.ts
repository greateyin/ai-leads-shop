import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 結帳 Schema
 */
const checkoutSchema = z.object({
    shopId: z.string().uuid("商店 ID 格式錯誤"),
    shippingAddress: z.object({
        contactName: z.string().min(1, "收件人姓名為必填"),
        phone: z.string().min(1, "電話為必填"),
        city: z.string().min(1, "城市為必填"),
        postalCode: z.string().min(1, "郵遞區號為必填"),
        addressLine1: z.string().min(1, "地址為必填"),
        addressLine2: z.string().optional(),
        country: z.string().default("TW"),
        state: z.string().optional(),
        notes: z.string().optional(),
    }),
    billingAddress: z.object({
        contactName: z.string().min(1),
        phone: z.string().min(1),
        city: z.string().min(1),
        postalCode: z.string().min(1),
        addressLine1: z.string().min(1),
        addressLine2: z.string().optional(),
        country: z.string().default("TW"),
        state: z.string().optional(),
    }).optional(),
});

/**
 * POST /api/carts/checkout
 * 購物車結帳 - 建立訂單
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

        const body = await request.json();
        const validation = checkoutSchema.safeParse(body);

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

        const { shopId, shippingAddress, billingAddress } = validation.data;

        // 取得購物車
        const cart = await db.cart.findFirst({
            where: {
                tenantId: session.user.tenantId,
                userId: session.user.id,
            },
            include: {
                items: {
                    include: {
                        product: { select: { id: true, name: true, price: true, sku: true, stock: true } },
                        variant: { select: { id: true, name: true, price: true, sku: true, stock: true } },
                    },
                },
            },
        });

        if (!cart || cart.items.length === 0) {
            return NextResponse.json(
                { success: false, error: { code: "EMPTY_CART", message: "購物車是空的" } },
                { status: 400 }
            );
        }

        // 驗證所有商品庫存
        for (const item of cart.items) {
            const availableStock = item.variant?.stock ?? item.product.stock;
            if (availableStock !== null && availableStock < item.quantity) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: "INSUFFICIENT_STOCK",
                            message: `商品 "${item.product.name}" 庫存不足`,
                        },
                    },
                    { status: 400 }
                );
            }
        }

        // 計算訂單金額
        const orderItems = cart.items.map((item) => {
            const unitPrice = Number(item.variant?.price ?? item.product.price);
            return {
                id: generateId(),
                tenantId: session.user.tenantId,
                productId: item.productId,
                variantId: item.variantId,
                name: item.product.name,
                sku: item.variant?.sku ?? item.product.sku ?? "",
                quantity: item.quantity,
                unitPrice,
                discount: 0,
                subtotal: unitPrice * item.quantity,
            };
        });

        const totalAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

        // 產生訂單編號
        const orderNo = `ORD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        // 建立訂單（含地址）
        const order = await db.$transaction(async (tx) => {
            // 建立訂單
            const newOrder = await tx.order.create({
                data: {
                    id: generateId(),
                    tenantId: session.user.tenantId,
                    shopId,
                    userId: session.user.id,
                    orderNo,
                    status: "PENDING",
                    currency: cart.currency,
                    totalAmount,
                    shippingFee: 0,
                    discountAmount: 0,
                    taxAmount: 0,
                    paymentStatus: "PENDING",
                    shippingStatus: "PENDING",
                    items: {
                        create: orderItems,
                    },
                },
                include: {
                    items: true,
                },
            });

            // 建立寄送地址
            await tx.address.create({
                data: {
                    id: generateId(),
                    tenantId: session.user.tenantId,
                    userId: session.user.id,
                    orderId: newOrder.id,
                    type: "SHIPPING",
                    ...shippingAddress,
                },
            });

            // 建立帳單地址（如果提供）
            if (billingAddress) {
                await tx.address.create({
                    data: {
                        id: generateId(),
                        tenantId: session.user.tenantId,
                        userId: session.user.id,
                        orderId: newOrder.id,
                        type: "BILLING",
                        ...billingAddress,
                    },
                });
            }

            // 清空購物車
            await tx.cartItem.deleteMany({
                where: { cartId: cart.id },
            });

            return newOrder;
        });

        return NextResponse.json({
            success: true,
            data: {
                orderId: order.id,
                orderNo: order.orderNo,
                totalAmount,
                currency: order.currency,
                status: order.status,
                itemCount: order.items.length,
            },
            message: "訂單已建立，請選擇付款方式",
        });
    } catch (error) {
        console.error("結帳錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "結帳失敗" } },
            { status: 500 }
        );
    }
}
