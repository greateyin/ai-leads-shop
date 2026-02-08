/**
 * UCP Orders — 共用核心邏輯
 *
 * 被 /api/ucp/orders（舊）和 /api/ucp/v1/ 路由共用。
 * Route handler 負責 schema 解析與回應格式化，此模組處理業務邏輯。
 *
 * @module lib/ucp/handlers/orders
 */

import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { getStripeConfigForTenant, createPaymentIntent } from "@/lib/payment/stripe";
import { toUcpMoney, fromUcpMoney } from "./checkout";
import { sendOrderCallback } from "./callbacks";
import type {
    UcpOrder,
    UcpCheckoutSession,
    UcpPaymentHandler,
    UcpAddress,
} from "@/lib/ucp/types";

// ===========================================
// 建立訂單（complete checkout session）
// ===========================================

/** 建立訂單的輸入 */
export interface CreateOrderInput {
    checkoutSessionId: string;
    merchantId: string;
    paymentToken?: string;
    paymentHandlerId?: string;
}

/** 建立訂單的結果 */
export interface CreateOrderResult {
    success: true;
    order: UcpOrder;
}

/** 建立訂單的錯誤 */
export interface CreateOrderError {
    success: false;
    code: string;
    message: string;
    status: number;
}

/**
 * 從 Checkout Session 建立訂單
 * @param input - 已驗證的訂單請求
 * @param tenantId - 租戶 ID（已從 auth context 取得）
 * @returns 成功回傳 order，失敗回傳 error
 */
export async function createOrderFromSession(
    input: CreateOrderInput,
    tenantId: string
): Promise<CreateOrderResult | CreateOrderError> {
    const { checkoutSessionId, merchantId, paymentToken, paymentHandlerId } = input;

    // 取得 shop
    const shop = await db.shop.findFirst({
        where: { id: merchantId, tenantId },
        select: { id: true, tenantId: true, currency: true, config: true },
    });

    if (!shop) {
        return { success: false, code: "NOT_FOUND", message: "Merchant not found", status: 404 };
    }

    // 取得 Checkout Session
    const dbSession = await db.ucpCheckoutSession.findFirst({
        where: {
            id: checkoutSessionId,
            shopId: merchantId,
            tenantId,
        },
    });

    if (!dbSession) {
        return { success: false, code: "NOT_FOUND", message: "Checkout session not found", status: 404 };
    }

    if (dbSession.expiresAt < new Date()) {
        return { success: false, code: "SESSION_EXPIRED", message: "Checkout session has expired", status: 410 };
    }

    // Idempotency：若 session 已完成且有對應訂單，回傳既有訂單
    if (dbSession.status === "COMPLETED" && dbSession.orderId) {
        const existingOrder = await db.order.findFirst({
            where: { id: dbSession.orderId, tenantId },
            include: { items: true },
        });
        if (existingOrder) {
            return {
                success: true,
                order: mapDbOrderToUcp(existingOrder),
            };
        }
        // orderId 存在但查不到訂單 → 資料不一致，拒絕
        return { success: false, code: "CONFLICT", message: "Order already created for this session", status: 409 };
    }

    if (dbSession.status === "COMPLETED" || dbSession.status === "CANCELLED") {
        return { success: false, code: "CONFLICT", message: "Order already created for this session", status: 409 };
    }

    const cartData = dbSession.cartData as unknown as UcpCheckoutSession["cart"];
    const buyerEmail = dbSession.buyerEmail || undefined;
    const shippingAddress = dbSession.shippingAddress as unknown as UcpAddress | undefined;
    const currency = shop.currency;
    const totalAmount = fromUcpMoney(cartData.total);

    // 產生訂單編號
    const orderNo = `UCP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const orderId = generateId();

    // 建立訂單項目（加 tenantId 防禦深度）
    const orderItems = await Promise.all(
        cartData.items.map(async (item) => {
            const product = await db.product.findFirst({
                where: { id: item.offerId, tenantId },
                select: { name: true, sku: true },
            });

            // 商品不存在或不屬於當前租戶時必須報錯，不可無聲建單
            if (!product) {
                throw new Error(
                    `Product ${item.offerId} not found within tenant ${tenantId}`
                );
            }

            const unitPrice = item.price ? fromUcpMoney(item.price) : 0;

            return {
                id: generateId(),
                tenantId,
                productId: item.offerId,
                name: product.name,
                sku: product.sku || "",
                quantity: item.quantity,
                unitPrice,
                discount: 0,
                subtotal: unitPrice * item.quantity,
            };
        })
    );

    // ============================================================
    // 原子交易：claim session + 建單 + 扣庫存（併發安全 + TOCTOU 防護）
    //
    // 關鍵條件：
    //   - status NOT IN (COMPLETED, CANCELLED, EXPIRED)
    //   - orderId IS NULL（確保尚未綁定訂單）
    //   - expiresAt > now（防止 TOCTOU：前置檢查有效但交易時已過期）
    //
    // 若 count === 0 → re-query 區分原因：
    //   - 已過期 → __SESSION_EXPIRED__
    //   - 已被 claim → __CONCURRENT_CLAIM__
    //
    // orderId @unique 提供 DB-level 的最後防線。
    // ============================================================
    const order = await db.$transaction(async (tx) => {
        // 原子 claim：只有第一個到達且 session 仍有效的請求能成功
        const claimResult = await tx.ucpCheckoutSession.updateMany({
            where: {
                id: checkoutSessionId,
                tenantId,
                status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] },
                orderId: null, // 確保尚未綁定訂單
                expiresAt: { gt: new Date() }, // TOCTOU 防護：交易時仍須有效
            },
            data: {
                status: "COMPLETED",
                orderId,
            },
        });

        if (claimResult.count === 0) {
            // Re-query 區分失敗原因，以便回傳正確錯誤碼
            const current = await tx.ucpCheckoutSession.findFirst({
                where: { id: checkoutSessionId, tenantId },
                select: { status: true, orderId: true, expiresAt: true },
            });

            if (current?.expiresAt && current.expiresAt < new Date()) {
                throw new Error("__SESSION_EXPIRED__");
            }

            // 已被另一請求 claim 或已取消
            throw new Error("__CONCURRENT_CLAIM__");
        }

        // 建立訂單
        const newOrder = await tx.order.create({
            data: {
                id: orderId,
                tenantId,
                shopId: shop.id,
                orderNo,
                status: "PENDING",
                currency,
                totalAmount,
                shippingFee: cartData.shippingFee ? fromUcpMoney(cartData.shippingFee) : 0,
                discountAmount: 0,
                taxAmount: cartData.tax ? fromUcpMoney(cartData.tax) : 0,
                paymentStatus: "PENDING",
                shippingStatus: "PENDING",
                items: { create: orderItems },
            },
            include: { items: true },
        });

        // 建立地址
        if (shippingAddress) {
            await tx.address.create({
                data: {
                    id: generateId(),
                    tenantId,
                    userId: generateId(),
                    orderId: newOrder.id,
                    type: "SHIPPING",
                    contactName: shippingAddress.name || "",
                    phone: shippingAddress.phoneNumber || "",
                    country: shippingAddress.regionCode,
                    state: shippingAddress.administrativeArea || "",
                    city: shippingAddress.locality,
                    postalCode: shippingAddress.postalCode,
                    addressLine1: shippingAddress.addressLines[0] || "",
                    addressLine2: shippingAddress.addressLines.slice(1).join(", ") || undefined,
                },
            });
        }

        // 扣除庫存（加 stock >= quantity 條件防超賣，count=0 代表庫存不足或商品不存在）
        for (const item of cartData.items) {
            const result = await tx.product.updateMany({
                where: {
                    id: item.offerId,
                    tenantId,
                    stock: { gte: item.quantity },
                },
                data: { stock: { decrement: item.quantity } },
            });

            if (result.count === 0) {
                throw new Error(
                    `Insufficient stock or product not found: ${item.offerId} (requested: ${item.quantity})`
                );
            }
        }

        return newOrder;
    });

    // 處理付款
    let paymentStatus: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" = "PENDING";
    let transactionId: string | undefined;

    if (paymentToken && paymentHandlerId === "stripe") {
        const stripeConfig = await getStripeConfigForTenant(tenantId);
        if (stripeConfig) {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
                const result = await createPaymentIntent(stripeConfig, {
                    orderId: order.id,
                    amount: totalAmount,
                    currency: currency.toLowerCase(),
                    description: `UCP Order ${orderNo}`,
                    successUrl: `${baseUrl}/orders/${order.id}/success`,
                    cancelUrl: `${baseUrl}/orders/${order.id}/cancel`,
                    customerEmail: buyerEmail,
                });
                transactionId = result.paymentIntentId;
                paymentStatus = "AUTHORIZED";

                await db.order.update({
                    where: { id: order.id },
                    data: { paymentStatus: "PENDING" },
                });

                await db.payment.create({
                    data: {
                        id: generateId(),
                        tenantId,
                        orderId: order.id,
                        provider: "STRIPE",
                        amount: totalAmount,
                        currency,
                        status: "INITIATED",
                        transactionNo: transactionId,
                    },
                });
            } catch (error) {
                console.error("[UCP Orders] Payment error:", error);
                paymentStatus = "FAILED";
            }
        }
    }

    const ucpOrder: UcpOrder = {
        id: order.id,
        merchantId,
        merchantOrderId: order.orderNo,
        status: "CONFIRMED",
        cart: cartData,
        shippingAddress,
        billingAddress: dbSession.billingAddress as unknown as UcpAddress | undefined,
        payment: { status: paymentStatus, transactionId },
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
    };

    // Fire-and-forget: 通知 UCP 平台訂單已建立
    sendOrderCallback(order.id, "CONFIRMED").catch((err) =>
        console.error("[UCP Orders] Callback send failed:", err)
    );

    return { success: true, order: ucpOrder };
}

// ===========================================
// DB Order → UcpOrder 映射（用於 idempotent complete）
// ===========================================

/**
 * 將 DB order（含 items）轉為 UcpOrder
 * @param order - Prisma order with items
 * @returns UcpOrder
 */
function mapDbOrderToUcp(order: {
    id: string;
    shopId: string;
    orderNo: string;
    status: string;
    currency: string;
    totalAmount: unknown;
    shippingFee: unknown;
    taxAmount: unknown;
    paymentStatus: string;
    createdAt: Date;
    updatedAt: Date;
    items: { productId: string; quantity: number; unitPrice: unknown }[];
}): UcpOrder {
    const statusMap: Record<string, UcpOrder["status"]> = {
        PENDING: "PENDING",
        PAID: "CONFIRMED",
        PROCESSING: "PROCESSING",
        SHIPPED: "SHIPPED",
        COMPLETED: "DELIVERED",
        CANCELLED: "CANCELLED",
        REFUNDING: "REFUNDED",
    };

    const paymentStatusMap: Record<string, UcpOrder["payment"]["status"]> = {
        PENDING: "PENDING",
        PAID: "CAPTURED",
        FAILED: "FAILED",
        REFUNDED: "REFUNDED",
    };

    const currency = order.currency;

    return {
        id: order.id,
        merchantId: order.shopId,
        merchantOrderId: order.orderNo,
        status: statusMap[order.status] || "PENDING",
        cart: {
            items: order.items.map((item) => ({
                offerId: item.productId,
                quantity: item.quantity,
                price: toUcpMoney(Number(item.unitPrice), currency),
            })),
            subtotal: toUcpMoney(
                Number(order.totalAmount) - Number(order.shippingFee) - Number(order.taxAmount),
                currency
            ),
            shippingFee: Number(order.shippingFee) > 0
                ? toUcpMoney(Number(order.shippingFee), currency)
                : undefined,
            tax: Number(order.taxAmount) > 0
                ? toUcpMoney(Number(order.taxAmount), currency)
                : undefined,
            total: toUcpMoney(Number(order.totalAmount), currency),
        },
        payment: {
            status: paymentStatusMap[order.paymentStatus] || "PENDING",
        },
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
    };
}

// ===========================================
// 查詢訂單
// ===========================================

/**
 * 查詢訂單詳情
 * @param orderId - 訂單 ID
 * @param merchantId - 商家 ID
 * @param tenantId - 租戶 ID
 * @returns UCP 訂單或 null
 */
export async function getOrder(
    orderId: string,
    merchantId: string,
    tenantId: string
): Promise<UcpOrder | null> {
    const order = await db.order.findFirst({
        where: { id: orderId, shopId: merchantId, tenantId },
        include: {
            items: {
                select: { productId: true, quantity: true, unitPrice: true },
            },
            addresses: {
                where: { type: "SHIPPING" },
                take: 1,
            },
            shop: { select: { currency: true } },
        },
    });

    if (!order) return null;

    const statusMap: Record<string, UcpOrder["status"]> = {
        PENDING: "PENDING",
        PAID: "CONFIRMED",
        PROCESSING: "PROCESSING",
        SHIPPED: "SHIPPED",
        COMPLETED: "DELIVERED",
        CANCELLED: "CANCELLED",
        REFUNDING: "REFUNDED",
    };

    const paymentStatusMap: Record<string, UcpOrder["payment"]["status"]> = {
        PENDING: "PENDING",
        PAID: "CAPTURED",
        FAILED: "FAILED",
        REFUNDED: "REFUNDED",
    };

    const currency = order.shop.currency;
    const shippingAddr = order.addresses[0];

    return {
        id: order.id,
        merchantId,
        merchantOrderId: order.orderNo,
        status: statusMap[order.status] || "PENDING",
        cart: {
            items: order.items.map((item) => ({
                offerId: item.productId,
                quantity: item.quantity,
                price: toUcpMoney(Number(item.unitPrice), currency),
            })),
            subtotal: toUcpMoney(
                Number(order.totalAmount) - Number(order.shippingFee) - Number(order.taxAmount),
                currency
            ),
            shippingFee: Number(order.shippingFee) > 0
                ? toUcpMoney(Number(order.shippingFee), currency)
                : undefined,
            tax: Number(order.taxAmount) > 0
                ? toUcpMoney(Number(order.taxAmount), currency)
                : undefined,
            total: toUcpMoney(Number(order.totalAmount), currency),
        },
        shippingAddress: shippingAddr
            ? {
                name: shippingAddr.contactName,
                addressLines: [shippingAddr.addressLine1, shippingAddr.addressLine2].filter(Boolean) as string[],
                locality: shippingAddr.city,
                administrativeArea: shippingAddr.state || undefined,
                postalCode: shippingAddr.postalCode,
                regionCode: shippingAddr.country,
                phoneNumber: shippingAddr.phone,
            }
            : undefined,
        payment: {
            status: paymentStatusMap[order.paymentStatus] || "PENDING",
        },
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
    };
}
