/**
 * Manus AI Shop 型別定義
 * 定義 DTO 與 API 介面型別
 */

// ===========================================
// 使用者相關
// ===========================================

/**
 * 使用者 DTO
 */
export interface UserDTO {
  id: string;
  name: string | null;
  email: string;
  role: "OWNER" | "ADMIN" | "STAFF" | "VIEWER" | "CUSTOMER";
  avatarUrl: string | null;
  tenantId: string | null;
}

/**
 * Session 擴展型別
 */
export interface ExtendedSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: string;
    tenantId: string;
  };
  expires: string;
}

// ===========================================
// 商品相關
// ===========================================

/**
 * 商品 DTO
 */
export interface ProductDTO {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  descriptionMd: string | null;
  price: number;
  currency: string;
  stock: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  coverImageUrl: string | null;
  categories: CategoryDTO[];
  variants: VariantDTO[];
  images: AssetDTO[];
}

/**
 * 商品分類 DTO
 */
export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * 商品變體 DTO
 */
export interface VariantDTO {
  id: string;
  sku: string;
  name: string | null;
  attributes: Record<string, string> | null;
  price: number;
  stock: number;
}

/**
 * 商品資源 DTO
 */
export interface AssetDTO {
  id: string;
  type: "IMAGE" | "VIDEO" | "PDF";
  url: string;
  altText: string | null;
}

// ===========================================
// 訂單相關
// ===========================================

/**
 * 訂單 DTO
 */
export interface OrderDTO {
  id: string;
  orderNo: string;
  status: OrderStatusType;
  totalAmount: number;
  currency: string;
  paymentStatus: PaymentStatusType;
  shippingStatus: ShippingStatusType;
  items: OrderItemDTO[];
  addresses: AddressDTO[];
  createdAt: string;
}

export type OrderStatusType =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDING";

export type PaymentStatusType = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export type ShippingStatusType =
  | "PENDING"
  | "PREPARING"
  | "DELIVERING"
  | "DELIVERED"
  | "RETURNED";

/**
 * 訂單項目 DTO
 */
export interface OrderItemDTO {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/**
 * 地址 DTO
 */
export interface AddressDTO {
  id: string;
  type: "BILLING" | "SHIPPING" | "PICKUP" | "STORE";
  contactName: string;
  phone: string;
  country: string;
  city: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string | null;
}

// ===========================================
// API 相關
// ===========================================

/**
 * API 成功回應
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * API 錯誤回應
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * API 錯誤碼
 */
export type ApiErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * 分頁參數
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * 分頁回應
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ===========================================
// AI 相關
// ===========================================

/**
 * AI 描述生成請求
 */
export interface AiDescriptionRequest {
  productName: string;
  keywords: string[];
}

/**
 * AI 描述生成回應
 */
export interface AiDescriptionResponse {
  descriptionMd: string;
  faq: FaqItem[];
}

/**
 * FAQ 項目
 */
export interface FaqItem {
  question: string;
  answer: string;
}

// ===========================================
// 金流相關
// ===========================================

/**
 * 建立交易請求
 */
export interface CreatePaymentRequest {
  orderId: string;
  provider: "ECPAY" | "NEWEBPAY" | "STRIPE";
  returnUrl: string;
  notifyUrl: string;
}

/**
 * 金流結果
 */
export interface PaymentResult {
  success: boolean;
  paymentId: string;
  redirectUrl?: string;
  formHtml?: string;
  clientSecret?: string;
}
