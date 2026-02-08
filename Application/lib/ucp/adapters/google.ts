/**
 * Google Merchant Shopping APIs v1 — Schema Adapter
 *
 * 負責在內部 UCP 型別與 Google v1 契約之間做雙向轉換，
 * 讓核心業務邏輯不直接耦合 Google schema。
 *
 * @module lib/ucp/adapters/google
 */

import type {
    UcpMoney,
    UcpAddress,
    UcpCartItem,
    UcpCheckoutSession,
    UcpPaymentHandler,
    UcpOrder,
    UcpOrderStatus,
    UcpAvailabilityResponse,
    GoogleCreateCheckoutRequest,
    GoogleCheckoutSessionResponse,
    GoogleUpdateCheckoutRequest,
    GoogleCompleteCheckoutRequest,
    GoogleOrderResponse,
    GoogleOrderState,
    GoogleAvailabilityRequest,
    GoogleAvailabilityResponse,
} from "@/lib/ucp/types";
import type { DeliveryOption } from "@/lib/ucp/handlers/shipping";

// ===========================================
// Checkout Session 轉換
// ===========================================

/**
 * Google v1 create request → 內部 UCP 格式
 * @param req - Google v1 建立 checkout session 請求
 * @returns 內部 UCP 結構
 */
export function fromGoogleCreateCheckout(req: GoogleCreateCheckoutRequest) {
    return {
        merchantId: req.merchantId,
        cart: {
            items: req.cart.items.map((item) => ({
                offerId: item.offer.offerId,
                quantity: item.quantity,
                price: item.offer.price,
            })),
            currency: req.cart.currency || "TWD",
        },
        shippingAddress: req.shippingAddress,
        billingAddress: req.billingAddress,
        buyerEmail: req.buyerInfo?.email,
        buyerPhone: req.buyerInfo?.phone,
        metadata: req.metadata,
    };
}

/**
 * 內部 UCP checkout session → Google v1 response
 * @param session - 內部 UCP checkout session
 * @param deliveryOptions - 可選配送方式清單（由 shipping engine 提供）
 * @returns Google v1 checkout session 回應
 */
export function toGoogleCheckoutResponse(
    session: UcpCheckoutSession,
    deliveryOptions?: DeliveryOption[]
): GoogleCheckoutSessionResponse {
    return {
        id: session.id,
        merchantId: session.merchantId,
        state: mapCheckoutStatusToGoogleState(session.status),
        cart: {
            items: session.cart.items.map((item) => ({
                offer: {
                    offerId: item.offerId,
                    price: item.price!,
                },
                quantity: item.quantity,
            })),
            subtotal: session.cart.subtotal,
            shippingCost: session.cart.shippingFee,
            tax: session.cart.tax,
            total: session.cart.total,
        },
        shippingAddress: session.shippingAddress,
        billingAddress: session.billingAddress,
        availablePaymentMethods: session.paymentHandlers.map((h) => ({
            id: h.id,
            type: h.type,
            name: h.name,
            supportedNetworks: h.supportedNetworks,
        })),
        availableDeliveryOptions: deliveryOptions?.map((opt) => ({
            ref: opt.ref,
            name: opt.name,
            cost: opt.cost,
            estimatedDays: opt.estimatedDays,
        })),
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
    };
}

/**
 * Google v1 complete request → 內部 UCP 格式
 * @param req - Google v1 complete checkout 請求
 * @param checkoutSessionId - 從 path param 取得的 session ID
 * @param merchantId - 從 auth context 取得的 merchant ID
 * @returns 內部 UCP 建立訂單結構
 */
export function fromGoogleCompleteCheckout(
    req: GoogleCompleteCheckoutRequest,
    checkoutSessionId: string,
    merchantId: string
) {
    return {
        checkoutSessionId,
        merchantId,
        paymentToken: req.paymentInfo.paymentProcessorToken,
        paymentHandlerId: req.paymentInfo.paymentMethodType,
    };
}

// ===========================================
// Order 轉換
// ===========================================

/**
 * 內部 UCP order → Google v1 order response
 * @param order - 內部 UCP order
 * @returns Google v1 order 回應
 */
export function toGoogleOrderResponse(order: UcpOrder): GoogleOrderResponse {
    return {
        id: order.id,
        merchantId: order.merchantId,
        merchantOrderId: order.merchantOrderId,
        state: mapOrderStatusToGoogleState(order.status),
        lineItems: order.cart.items.map((item) => ({
            offerId: item.offerId,
            quantity: item.quantity,
            price: item.price!,
        })),
        subtotal: order.cart.subtotal,
        shippingCost: order.cart.shippingFee,
        tax: order.cart.tax,
        total: order.cart.total,
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
        paymentSummary: {
            status: order.payment.status,
            transactionId: order.payment.transactionId,
        },
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
    };
}

// ===========================================
// Availability 轉換
// ===========================================

/**
 * Google v1 availability request → 內部 UCP 格式
 * @param req - Google v1 庫存查詢請求
 * @returns 內部 UCP 結構
 */
export function fromGoogleAvailabilityRequest(req: GoogleAvailabilityRequest) {
    return {
        merchantId: req.merchantId,
        offers: req.products.map((p) => ({
            id: p.offerId,
            quantity: p.quantity,
        })),
        shippingAddress: req.shippingAddress,
    };
}

/**
 * 內部 UCP availability response → Google v1 格式
 * @param res - 內部 UCP 庫存查詢回應
 * @returns Google v1 庫存查詢回應
 */
export function toGoogleAvailabilityResponse(
    res: UcpAvailabilityResponse
): GoogleAvailabilityResponse {
    return {
        products: res.offers.map((o) => ({
            offerId: o.id,
            availability: o.availability,
            price: o.price,
            quantityAvailable: o.quantity,
            maxOrderQuantity: o.maxQuantity,
        })),
    };
}

// ===========================================
// 狀態映射
// ===========================================

/**
 * 內部 checkout status → Google v1 state
 */
function mapCheckoutStatusToGoogleState(
    status: UcpCheckoutSession["status"]
): GoogleCheckoutSessionResponse["state"] {
    const map: Record<string, GoogleCheckoutSessionResponse["state"]> = {
        PENDING: "CREATED",
        AWAITING_PAYMENT: "OPEN",
        PROCESSING: "OPEN",
        COMPLETED: "CLOSED",
        EXPIRED: "EXPIRED",
        CANCELLED: "CLOSED",
    };
    return map[status] || "CREATED";
}

/**
 * 內部 order status → Google v1 state
 */
function mapOrderStatusToGoogleState(status: UcpOrderStatus): GoogleOrderState {
    const map: Record<string, GoogleOrderState> = {
        PENDING: "CREATED",
        CONFIRMED: "IN_PROGRESS",
        PROCESSING: "IN_PROGRESS",
        SHIPPED: "IN_PROGRESS",
        DELIVERED: "COMPLETED",
        CANCELLED: "CANCELLED",
        REFUNDED: "CANCELLED",
    };
    return map[status] || "CREATED";
}
