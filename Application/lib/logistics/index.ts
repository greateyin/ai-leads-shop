/**
 * 物流整合模組
 * 統一物流服務介面，支援多種物流供應商
 */

export * from "./ecpay-logistics";
export * from "./sf-express";
export * from "./newebpay-logistics";

/**
 * 物流供應商類型
 */
export type LogisticsProviderType = "ECPAY" | "SF_EXPRESS" | "BLACK_CAT" | "TCAT";

/**
 * 配送類型
 */
export type ShippingType = "HOME" | "CVS_PICKUP" | "CVS_FAMI" | "CVS_711" | "CVS_HILIFE";

/**
 * 物流訂單狀態
 */
export type LogisticsStatus =
  | "CREATED"
  | "AWAITING_PICKUP"
  | "IN_TRANSIT"
  | "ARRIVED_AT_STORE"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELLED";

/**
 * 收件人資訊
 */
export interface ReceiverInfo {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  zipCode?: string;
  storeId?: string;
  storeName?: string;
}

/**
 * 物流訂單建立請求
 */
export interface CreateLogisticsOrderRequest {
  orderId: string;
  orderNo: string;
  provider: LogisticsProviderType;
  shippingType: ShippingType;
  receiver: ReceiverInfo;
  items: Array<{
    name: string;
    quantity: number;
    weight?: number;
  }>;
  totalAmount: number;
  isCollection?: boolean;
  collectionAmount?: number;
  remark?: string;
}

/**
 * 物流訂單建立回應
 */
export interface CreateLogisticsOrderResponse {
  success: boolean;
  logisticsId?: string;
  trackingNumber?: string;
  labelUrl?: string;
  error?: string;
}

/**
 * 物流追蹤資訊
 */
export interface TrackingInfo {
  status: LogisticsStatus;
  statusText: string;
  updatedAt: string;
  history: Array<{
    status: string;
    description: string;
    timestamp: string;
    location?: string;
  }>;
}

/**
 * 物流服務介面
 */
export interface LogisticsService {
  /**
   * 建立物流訂單
   */
  createOrder(request: CreateLogisticsOrderRequest): Promise<CreateLogisticsOrderResponse>;

  /**
   * 查詢物流狀態
   */
  getTrackingInfo(trackingNumber: string): Promise<TrackingInfo>;

  /**
   * 列印託運單
   */
  printLabel(logisticsId: string): Promise<{ labelUrl: string }>;

  /**
   * 取消物流訂單
   */
  cancelOrder(logisticsId: string): Promise<{ success: boolean; message?: string }>;
}

/**
 * 物流服務工廠
 * @param provider - 物流供應商類型
 * @param config - 供應商配置
 * @returns 物流服務實例
 */
export function createLogisticsService(
  provider: LogisticsProviderType,
  config: Record<string, string>
): LogisticsService {
  switch (provider) {
    case "ECPAY":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ECPayLogisticsService } = require("./ecpay-logistics");
      return new ECPayLogisticsService(config);
    case "SF_EXPRESS":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SFExpressService } = require("./sf-express");
      return new SFExpressService(config);
    default:
      throw new Error(`Unsupported logistics provider: ${provider}`);
  }
}

/**
 * 計算運費
 * @param shippingType - 配送類型
 * @param totalAmount - 訂單金額
 * @param weight - 總重量 (公斤)
 * @returns 運費
 */
export function calculateShippingFee(
  shippingType: ShippingType,
  totalAmount: number,
  weight?: number
): number {
  // 基本運費邏輯，實際應從資料庫讀取設定
  const baseFees: Record<ShippingType, number> = {
    HOME: 100,
    CVS_PICKUP: 60,
    CVS_FAMI: 60,
    CVS_711: 60,
    CVS_HILIFE: 60,
  };

  const freeThreshold = 1000; // 免運門檻

  if (totalAmount >= freeThreshold) {
    return 0;
  }

  let fee = baseFees[shippingType] || 100;

  // 重量加價
  if (weight && weight > 5) {
    fee += Math.ceil((weight - 5) / 5) * 50;
  }

  return fee;
}
