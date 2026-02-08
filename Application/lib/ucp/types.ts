/**
 * UCP (Universal Commerce Protocol) 類型定義
 * @see https://ucp.dev/specification/overview/
 */

// ===========================================
// 基礎類型
// ===========================================

/** 金額格式（UCP 使用 minor units，如分） */
export interface UcpMoney {
    value: number; // Minor units (cents)
    currency: string; // ISO 4217
}

/** UCP 地址格式 */
export interface UcpAddress {
    name?: string;
    addressLines: string[];
    locality: string; // City
    administrativeArea?: string; // State/Province
    postalCode: string;
    regionCode: string; // ISO 3166-1 alpha-2 (e.g., "TW")
    phoneNumber?: string;
}

// ===========================================
// 商品/Offer 相關
// ===========================================

/** UCP Offer（商品報價） */
export interface UcpOffer {
    id: string;
    merchantId: string;
    name: string;
    description?: string;
    price: UcpMoney;
    availability: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER";
    imageUrl?: string;
    productUrl?: string;
    gtin?: string; // Global Trade Item Number
    sku?: string;
    brand?: string;
    condition?: "NEW" | "REFURBISHED" | "USED";
    attributes?: Record<string, string>;
}

/** UCP 庫存查詢請求 */
export interface UcpAvailabilityRequest {
    offers: Array<{
        id: string;
        quantity?: number;
    }>;
    shippingAddress?: UcpAddress;
}

/** UCP 庫存查詢回應 */
export interface UcpAvailabilityResponse {
    offers: Array<{
        id: string;
        availability: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER";
        price: UcpMoney;
        quantity?: number;
        maxQuantity?: number;
    }>;
}

// ===========================================
// 結帳 Session 相關
// ===========================================

/** UCP 購物車項目 */
export interface UcpCartItem {
    offerId: string;
    quantity: number;
    price?: UcpMoney;
}

/** UCP 付款處理器 */
export interface UcpPaymentHandler {
    id: string;
    type: "CARD" | "WALLET" | "BANK_TRANSFER" | "OTHER";
    name: string;
    supportedNetworks?: string[];
    processorEndpoint?: string;
    processorPublicKey?: string;
}

/** UCP 建立結帳 Session 請求 */
export interface UcpCreateCheckoutRequest {
    merchantId: string;
    cart: {
        items: UcpCartItem[];
        currency: string;
    };
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    buyerEmail?: string;
    buyerPhone?: string;
    metadata?: Record<string, string>;
}

/** UCP 結帳 Session 狀態 */
export type UcpCheckoutStatus =
    | "PENDING"
    | "AWAITING_PAYMENT"
    | "PROCESSING"
    | "COMPLETED"
    | "EXPIRED"
    | "CANCELLED";

/** UCP 結帳 Session 回應 */
export interface UcpCheckoutSession {
    id: string;
    merchantId: string;
    status: UcpCheckoutStatus;
    cart: {
        items: UcpCartItem[];
        subtotal: UcpMoney;
        shippingFee?: UcpMoney;
        tax?: UcpMoney;
        total: UcpMoney;
    };
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    paymentHandlers: UcpPaymentHandler[];
    expiresAt: string; // RFC 3339
    createdAt: string; // RFC 3339
    updatedAt: string; // RFC 3339
    continueUrl?: string; // For embedded checkout
    orderId?: string;
}

// ===========================================
// 訂單相關
// ===========================================

/** UCP 建立訂單請求 */
export interface UcpCreateOrderRequest {
    checkoutSessionId: string;
    paymentToken: string;
    paymentHandlerId: string;
}

/** UCP 訂單狀態 */
export type UcpOrderStatus =
    | "PENDING"
    | "CONFIRMED"
    | "PROCESSING"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED"
    | "REFUNDED";

/** UCP 訂單回應 */
export interface UcpOrder {
    id: string;
    merchantId: string;
    merchantOrderId: string; // 商家端訂單編號
    status: UcpOrderStatus;
    cart: {
        items: UcpCartItem[];
        subtotal: UcpMoney;
        shippingFee?: UcpMoney;
        tax?: UcpMoney;
        total: UcpMoney;
    };
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    payment: {
        status: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
        transactionId?: string;
    };
    createdAt: string;
    updatedAt: string;
}

// ===========================================
// 錯誤處理
// ===========================================

/** UCP 標準錯誤碼 */
export type UcpErrorCode =
    | "INVALID_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INSUFFICIENT_STOCK"
    | "PAYMENT_FAILED"
    | "SESSION_EXPIRED"
    | "INTERNAL_ERROR";

/** UCP 錯誤回應 */
export interface UcpError {
    code: UcpErrorCode;
    message: string;
    details?: Record<string, unknown>;
}

// ===========================================
// Profile / Discovery
// ===========================================

/** UCP Profile（ucp.dev 風格，已 deprecated） */
export interface UcpProfile {
    version: string;
    profile: {
        id: string;
        name: string;
        description?: string;
        homepage?: string;
        services: {
            shopping?: {
                version: string;
                rest?: {
                    schema: string;
                    endpoint: string;
                };
                mcp?: {
                    schema: string;
                    endpoint: string;
                };
            };
        };
        capabilities: string[];
    };
}

// ===========================================
// Google Merchant Shopping APIs v1 — Profile
// ===========================================

/** Google Merchant UCP Profile（/.well-known/ucp/profile.json） */
export interface GoogleUcpProfile {
    /** 服務提供者名稱 */
    provider: string;
    /** 商店顯示名稱 */
    title: string;
    /** v1 API base URL pattern */
    urlPattern: string;
    /** 結帳配置 */
    checkoutConfig: {
        type: "NATIVE" | "REDIRECT";
        supportedPaymentMethods: string[];
        supportedShippingCountries: string[];
        checkoutUrl?: string;
    };
    /** 訂單管理配置 */
    orderManagement: {
        callbackUrl: string;
        supportedActions: ("CANCEL" | "REFUND" | "RETURN")[];
    };
    /** 認證配置 */
    authentication: {
        type: "API_KEY" | "OAUTH2" | "HMAC";
        apiRequestHeaders?: Record<string, string>;
    };
}

// ===========================================
// Google Merchant Shopping APIs v1 — Checkout
// ===========================================

/** Google v1 建立 Checkout Session 請求 */
export interface GoogleCreateCheckoutRequest {
    merchantId: string;
    checkoutOptions?: {
        requestedProcessingType?: "CHECKOUT_AND_PAY" | "CHECKOUT_ONLY";
    };
    cart: {
        items: Array<{
            offer: {
                offerId: string;
                price?: UcpMoney;
            };
            quantity: number;
        }>;
        currency?: string;
    };
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    buyerInfo?: {
        email?: string;
        phone?: string;
    };
    selectedDeliveryOptionRef?: string;
    metadata?: Record<string, string>;
}

/** Google v1 Checkout Session 回應 */
export interface GoogleCheckoutSessionResponse {
    id: string;
    merchantId: string;
    state: "CREATED" | "OPEN" | "CLOSED" | "EXPIRED";
    cart: {
        items: Array<{
            offer: {
                offerId: string;
                price: UcpMoney;
            };
            quantity: number;
        }>;
        subtotal: UcpMoney;
        shippingCost?: UcpMoney;
        tax?: UcpMoney;
        total: UcpMoney;
    };
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    availablePaymentMethods: Array<{
        id: string;
        type: string;
        name: string;
        supportedNetworks?: string[];
    }>;
    availableDeliveryOptions?: Array<{
        ref: string;
        name: string;
        cost: UcpMoney;
        estimatedDays?: number;
    }>;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}

/** Google v1 更新 Checkout Session 請求 */
export interface GoogleUpdateCheckoutRequest {
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    selectedDeliveryOptionRef?: string;
    selectedPaymentMethodId?: string;
}

/** Google v1 Complete Checkout 請求 */
export interface GoogleCompleteCheckoutRequest {
    paymentInfo: {
        paymentProcessorToken?: string;
        paymentMethodType?: string;
    };
}

// ===========================================
// Google Merchant Shopping APIs v1 — Orders
// ===========================================

/** Google v1 訂單狀態 */
export type GoogleOrderState =
    | "CREATED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "RETURNED";

/** Google v1 訂單回應 */
export interface GoogleOrderResponse {
    id: string;
    merchantId: string;
    merchantOrderId: string;
    state: GoogleOrderState;
    lineItems: Array<{
        offerId: string;
        quantity: number;
        price: UcpMoney;
    }>;
    subtotal: UcpMoney;
    shippingCost?: UcpMoney;
    tax?: UcpMoney;
    total: UcpMoney;
    shippingAddress?: UcpAddress;
    billingAddress?: UcpAddress;
    paymentSummary: {
        status: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
        transactionId?: string;
    };
    deliveryDetails?: {
        carrier?: string;
        trackingNumber?: string;
        trackingUrl?: string;
        estimatedDelivery?: string;
    };
    createdAt: string;
    updatedAt: string;
}

// ===========================================
// Google Merchant Shopping APIs v1 — Availability
// ===========================================

/** Google v1 庫存查詢請求 */
export interface GoogleAvailabilityRequest {
    merchantId: string;
    products: Array<{
        offerId: string;
        quantity?: number;
    }>;
    shippingAddress?: UcpAddress;
}

/** Google v1 庫存查詢回應 */
export interface GoogleAvailabilityResponse {
    products: Array<{
        offerId: string;
        availability: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER";
        price: UcpMoney;
        quantityAvailable?: number;
        maxOrderQuantity?: number;
    }>;
}
