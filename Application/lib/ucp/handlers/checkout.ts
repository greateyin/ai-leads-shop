/**
 * UCP Checkout Session — 共用核心邏輯
 *
 * 被 /api/ucp/checkout-sessions（舊）和 /api/ucp/v1/checkout-sessions（v1）共用。
 * Route handler 負責 schema 解析與回應格式化，此模組處理業務邏輯。
 *
 * @module lib/ucp/handlers/checkout
 */

import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import type {
    UcpCheckoutSession,
    UcpPaymentHandler,
    UcpMoney,
    UcpCartItem,
    UcpAddress,
} from "@/lib/ucp/types";
import type { UcpAuthContext } from "@/lib/ucp/middleware";
import {
    calculateDefaultShippingFee,
    calculateDeliveryFee,
    getAvailableDeliveryOptions,
} from "@/lib/ucp/handlers/shipping";

// ===========================================
// 輔助函數
// ===========================================

/** 金額 → UCP minor units */
export function toUcpMoney(amount: number, currency: string): UcpMoney {
    return {
        value: Math.round(amount * 100),
        currency: currency.toUpperCase(),
    };
}

/** UCP minor units → 金額 */
export function fromUcpMoney(money: UcpMoney): number {
    return money.value / 100;
}

// ===========================================
// 建立 Checkout Session
// ===========================================

/** 建立 Session 的輸入 */
export interface CreateSessionInput {
    merchantId: string;
    cart: {
        items: Array<{ offerId: string; quantity: number; price?: UcpMoney }>;
        currency: string;
    };
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    buyerEmail?: string;
    metadata?: Record<string, string>;
}

/** 建立 Session 的結果 */
export interface CreateSessionResult {
    success: true;
    session: UcpCheckoutSession;
}

/** 建立 Session 的錯誤 */
export interface CreateSessionError {
    success: false;
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
}

/**
 * 建立 Checkout Session 核心邏輯
 * @param input - 已驗證的結帳請求資料
 * @param authCtx - 已驗證的 UCP auth context
 * @returns 成功回傳 session，失敗回傳 error
 */
export async function createCheckoutSession(
    input: CreateSessionInput,
    authCtx: UcpAuthContext
): Promise<CreateSessionResult | CreateSessionError> {
    const { tenantId, shopId } = authCtx;

    // 取得商店幣別
    const shop = await db.shop.findFirst({
        where: { id: shopId },
        select: { currency: true },
    });
    const currency = shop?.currency || input.cart.currency;

    // 驗證所有商品並計算價格
    const productIds = input.cart.items.map((item) => item.offerId);
    const products = await db.product.findMany({
        where: {
            id: { in: productIds },
            shopId,
            status: "PUBLISHED",
            deletedAt: null,
        },
        select: {
            id: true,
            name: true,
            price: true,
            stock: true,
        },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 驗證庫存並計算小計
    const validatedItems: UcpCartItem[] = [];
    let subtotal = 0;

    for (const item of input.cart.items) {
        const product = productMap.get(item.offerId);
        if (!product) {
            return {
                success: false,
                code: "NOT_FOUND",
                message: `Product ${item.offerId} not found`,
                status: 404,
            };
        }

        if (product.stock < item.quantity) {
            return {
                success: false,
                code: "INSUFFICIENT_STOCK",
                message: `Insufficient stock for ${product.name}`,
                status: 400,
                details: {
                    offerId: item.offerId,
                    requested: item.quantity,
                    available: product.stock,
                },
            };
        }

        const unitPrice = Number(product.price);
        const itemPrice = toUcpMoney(unitPrice, currency);
        subtotal += unitPrice * item.quantity;

        validatedItems.push({
            offerId: item.offerId,
            quantity: item.quantity,
            price: itemPrice,
        });
    }

    // 動態計算運費（整合 lib/logistics 模組）
    const shippingFee = await calculateDefaultShippingFee(
        shopId,
        subtotal,
        !!input.shippingAddress
    );
    const tax = 0; // 台灣內含稅
    const total = subtotal + shippingFee + tax;

    // 取得 Payment Handlers
    const paymentHandlers = await getPaymentHandlers(tenantId);

    // 建立 Session
    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 分鐘

    const session: UcpCheckoutSession = {
        id: sessionId,
        merchantId: input.merchantId,
        status: "PENDING",
        cart: {
            items: validatedItems,
            subtotal: toUcpMoney(subtotal, currency),
            shippingFee: shippingFee > 0 ? toUcpMoney(shippingFee, currency) : undefined,
            tax: tax > 0 ? toUcpMoney(tax, currency) : undefined,
            total: toUcpMoney(total, currency),
        },
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        paymentHandlers,
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    // 存入資料庫
    await db.ucpCheckoutSession.create({
        data: {
            id: sessionId,
            tenantId,
            shopId,
            platformId: authCtx.platformId,
            status: "PENDING",
            cartData: JSON.parse(JSON.stringify(session.cart)),
            shippingAddress: input.shippingAddress
                ? JSON.parse(JSON.stringify(input.shippingAddress))
                : undefined,
            billingAddress: input.billingAddress
                ? JSON.parse(JSON.stringify(input.billingAddress))
                : undefined,
            paymentHandlers: JSON.parse(JSON.stringify(paymentHandlers)),
            buyerEmail: input.buyerEmail,
            metadata: input.metadata
                ? JSON.parse(JSON.stringify(input.metadata))
                : undefined,
            expiresAt,
        },
    });

    return { success: true, session };
}

// ===========================================
// 讀取 Checkout Session
// ===========================================

/**
 * 讀取 Checkout Session
 * @param sessionId - Session ID
 * @param merchantId - 商家 ID（用於安全驗證）
 * @param tenantId - 租戶 ID（用於安全驗證）
 * @returns Session 或 null
 */
export async function getCheckoutSession(
    sessionId: string,
    merchantId: string,
    tenantId: string
): Promise<UcpCheckoutSession | null> {
    const dbSession = await db.ucpCheckoutSession.findFirst({
        where: {
            id: sessionId,
            shopId: merchantId,
            tenantId,
        },
    });

    if (!dbSession) return null;

    const cartData = dbSession.cartData as unknown as UcpCheckoutSession["cart"];
    const paymentHandlers = dbSession.paymentHandlers as unknown as UcpPaymentHandler[];
    const isExpired = dbSession.expiresAt < new Date();
    const status = isExpired ? "EXPIRED" : dbSession.status;

    return {
        id: dbSession.id,
        merchantId,
        status: status as UcpCheckoutSession["status"],
        cart: cartData,
        shippingAddress: dbSession.shippingAddress as unknown as UcpAddress | undefined,
        billingAddress: dbSession.billingAddress as unknown as UcpAddress | undefined,
        paymentHandlers,
        expiresAt: dbSession.expiresAt.toISOString(),
        createdAt: dbSession.createdAt.toISOString(),
        updatedAt: dbSession.updatedAt.toISOString(),
        orderId: dbSession.orderId || undefined,
    };
}

// ===========================================
// 更新 Checkout Session（Phase 2 擴展）
// ===========================================

/** 更新 Session 的輸入（Phase 2 完整實作運費重算） */
export interface UpdateSessionInput {
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    selectedDeliveryOptionRef?: string;
}

/**
 * 更新 Checkout Session（含動態運費重算）
 * @param sessionId - Session ID
 * @param tenantId - 租戶 ID
 * @param input - 更新資料
 * @returns 更新後的 session 或 error
 */
export async function updateCheckoutSession(
    sessionId: string,
    tenantId: string,
    input: UpdateSessionInput
): Promise<{ success: true; session: UcpCheckoutSession } | CreateSessionError> {
    const dbSession = await db.ucpCheckoutSession.findFirst({
        where: { id: sessionId, tenantId },
    });

    if (!dbSession) {
        return { success: false, code: "NOT_FOUND", message: "Session not found", status: 404 };
    }

    if (dbSession.expiresAt < new Date()) {
        return { success: false, code: "SESSION_EXPIRED", message: "Session has expired", status: 400 };
    }

    if (dbSession.status === "COMPLETED") {
        return { success: false, code: "CONFLICT", message: "Session already completed", status: 409 };
    }

    const shopId = dbSession.shopId;
    const cartData = dbSession.cartData as unknown as UcpCheckoutSession["cart"];

    // 更新地址欄位
    const updateData: Record<string, unknown> = {};
    if (input.shippingAddress) {
        updateData.shippingAddress = JSON.parse(JSON.stringify(input.shippingAddress));
    }
    if (input.billingAddress) {
        updateData.billingAddress = JSON.parse(JSON.stringify(input.billingAddress));
    }

    // 運費重算：地址或配送方式變更時觸發
    const needsShippingRecalc = !!input.shippingAddress || !!input.selectedDeliveryOptionRef;

    if (needsShippingRecalc) {
        const subtotalValue = fromUcpMoney(cartData.subtotal);
        const currency = cartData.subtotal.currency;
        let newShippingFee: number;

        if (input.selectedDeliveryOptionRef) {
            // 使用者選了特定配送方式
            const deliveryCost = await calculateDeliveryFee(
                shopId,
                input.selectedDeliveryOptionRef,
                subtotalValue
            );
            newShippingFee = deliveryCost ? fromUcpMoney(deliveryCost) : 0;
        } else {
            // 地址變更，使用預設配送方式重算
            const hasAddr = !!(input.shippingAddress ||
                (dbSession.shippingAddress as unknown as UcpAddress | null));
            newShippingFee = await calculateDefaultShippingFee(shopId, subtotalValue, hasAddr);
        }

        const tax = cartData.tax ? fromUcpMoney(cartData.tax) : 0;
        const newTotal = subtotalValue + newShippingFee + tax;

        // 更新 cartData 中的運費與合計
        const updatedCart = {
            ...cartData,
            shippingFee: newShippingFee > 0 ? toUcpMoney(newShippingFee, currency) : undefined,
            total: toUcpMoney(newTotal, currency),
        };
        updateData.cartData = JSON.parse(JSON.stringify(updatedCart));
    }

    await db.ucpCheckoutSession.update({
        where: { id: sessionId },
        data: updateData,
    });

    // 回傳更新後的 session
    const merchantId = shopId;
    const updated = await getCheckoutSession(sessionId, merchantId, tenantId);
    if (!updated) {
        return { success: false, code: "INTERNAL_ERROR", message: "Failed to read updated session", status: 500 };
    }

    return { success: true, session: updated };
}

// ===========================================
// Payment Handlers（共用）
// ===========================================

/**
 * 取得租戶可用的 Payment Handlers
 * @param tenantId - 租戶 ID
 */
async function getPaymentHandlers(tenantId: string): Promise<UcpPaymentHandler[]> {
    const handlers: UcpPaymentHandler[] = [];

    const providers = await db.paymentProvider.findMany({
        where: { tenantId },
        select: { type: true, config: true, isDefault: true },
    });

    for (const provider of providers) {
        if (provider.type === "STRIPE") {
            handlers.push({
                id: "stripe",
                type: "CARD",
                name: "Credit/Debit Card",
                supportedNetworks: ["VISA", "MASTERCARD", "JCB", "AMEX"],
            });
        } else if (provider.type === "PAYPAL") {
            handlers.push({
                id: "paypal",
                type: "WALLET",
                name: "PayPal",
            });
        }
    }

    if (handlers.length === 0) {
        handlers.push({
            id: "stripe",
            type: "CARD",
            name: "Credit/Debit Card",
            supportedNetworks: ["VISA", "MASTERCARD", "JCB", "AMEX"],
        });
    }

    return handlers;
}
