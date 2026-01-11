/**
 * 綠界物流 SDK 封裝
 * 支援超商取貨、宅配等多種配送方式
 * @see https://www.ecpay.com.tw/Service/API_Logistics
 */

import crypto from "crypto";
import type {
  LogisticsService,
  CreateLogisticsOrderRequest,
  CreateLogisticsOrderResponse,
  TrackingInfo,
  LogisticsStatus,
} from "./index";

/**
 * ECPay 物流配置
 */
interface ECPayLogisticsConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  isProduction?: boolean;
}

/**
 * 綠界物流服務
 */
export class ECPayLogisticsService implements LogisticsService {
  private config: ECPayLogisticsConfig;
  private baseUrl: string;

  constructor(config: ECPayLogisticsConfig) {
    this.config = config;
    this.baseUrl = config.isProduction
      ? "https://logistics.ecpay.com.tw"
      : "https://logistics-stage.ecpay.com.tw";
  }

  /**
   * 建立物流訂單
   */
  async createOrder(
    request: CreateLogisticsOrderRequest
  ): Promise<CreateLogisticsOrderResponse> {
    const logisticsType = this.mapShippingType(request.shippingType);
    const logisticsSubType = this.mapSubType(request.shippingType);

    const params: Record<string, string | number> = {
      MerchantID: this.config.merchantId,
      MerchantTradeNo: request.orderNo,
      MerchantTradeDate: this.formatDate(new Date()),
      LogisticsType: logisticsType,
      LogisticsSubType: logisticsSubType,
      GoodsAmount: request.totalAmount,
      GoodsName: request.items.map((i) => i.name).join("#"),
      SenderName: "Manus AI Shop",
      SenderPhone: "0912345678",
      ReceiverName: request.receiver.name,
      ReceiverCellPhone: request.receiver.phone,
    };

    // 超商取貨設定
    if (logisticsType === "CVS") {
      params.ReceiverStoreID = request.receiver.storeId || "";
    }

    // 宅配設定
    if (logisticsType === "HOME") {
      params.ReceiverAddress = request.receiver.address || "";
      params.ReceiverZipCode = request.receiver.zipCode || "";
    }

    // 代收貨款
    if (request.isCollection) {
      params.IsCollection = "Y";
      params.CollectionAmount = request.collectionAmount || request.totalAmount;
    }

    const checkMacValue = this.generateCheckMacValue(params);
    params.CheckMacValue = checkMacValue;

    try {
      const response = await fetch(`${this.baseUrl}/Express/Create`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params as Record<string, string>),
      });

      const result = await response.text();
      const parsed = this.parseResponse(result);

      if (parsed.RtnCode === "1") {
        return {
          success: true,
          logisticsId: parsed.AllPayLogisticsID,
          trackingNumber: parsed.CVSPaymentNo || parsed.AllPayLogisticsID,
        };
      }

      return {
        success: false,
        error: parsed.RtnMsg || "建立物流訂單失敗",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "建立物流訂單失敗",
      };
    }
  }

  /**
   * 查詢物流狀態
   */
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    const params: Record<string, string> = {
      MerchantID: this.config.merchantId,
      AllPayLogisticsID: trackingNumber,
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
    };

    params.CheckMacValue = this.generateCheckMacValue(params);

    try {
      const response = await fetch(`${this.baseUrl}/Helper/QueryLogisticsTradeInfo/V3`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
      });

      const result = await response.text();
      const parsed = this.parseResponse(result);

      return {
        status: this.mapECPayStatus(parsed.LogisticsStatus),
        statusText: parsed.LogisticsStatusName || "",
        updatedAt: parsed.UpdateStatusDate || new Date().toISOString(),
        history: [],
      };
    } catch {
      return {
        status: "CREATED",
        statusText: "查詢中",
        updatedAt: new Date().toISOString(),
        history: [],
      };
    }
  }

  /**
   * 列印託運單
   */
  async printLabel(logisticsId: string): Promise<{ labelUrl: string }> {
    const params: Record<string, string> = {
      MerchantID: this.config.merchantId,
      AllPayLogisticsID: logisticsId,
    };

    params.CheckMacValue = this.generateCheckMacValue(params);

    return {
      labelUrl: `${this.baseUrl}/Express/PrintTradeDocument?${new URLSearchParams(params)}`,
    };
  }

  /**
   * 取消物流訂單
   */
  async cancelOrder(
    logisticsId: string
  ): Promise<{ success: boolean; message?: string }> {
    // 綠界不支援直接取消，需人工處理
    return {
      success: false,
      message: "請聯繫客服取消物流訂單",
    };
  }

  /**
   * 驗證 Webhook 簽章 (CheckMacValue)
   * 用於驗證 ECPay 回調的來源真實性
   */
  verifyCheckMacValue(params: Record<string, string | number>): boolean {
    const receivedCheckMac = params.CheckMacValue;
    if (!receivedCheckMac) {
      return false;
    }

    const expectedCheckMac = this.generateCheckMacValue(params);
    return receivedCheckMac === expectedCheckMac;
  }

  /**
   * 對應配送類型到綠界物流類型
   */
  private mapShippingType(shippingType: string): string {
    switch (shippingType) {
      case "HOME":
        return "HOME";
      default:
        return "CVS";
    }
  }

  /**
   * 對應配送子類型
   */
  private mapSubType(shippingType: string): string {
    switch (shippingType) {
      case "CVS_711":
        return "UNIMART";
      case "CVS_FAMI":
        return "FAMI";
      case "CVS_HILIFE":
        return "HILIFE";
      case "HOME":
        return "TCAT";
      default:
        return "UNIMART";
    }
  }

  /**
   * 對應綠界狀態到統一狀態
   */
  private mapECPayStatus(ecpayStatus: string): LogisticsStatus {
    const statusMap: Record<string, LogisticsStatus> = {
      "300": "CREATED",
      "310": "AWAITING_PICKUP",
      "2030": "IN_TRANSIT",
      "2063": "ARRIVED_AT_STORE",
      "3024": "DELIVERED",
      "2067": "RETURNED",
    };
    return statusMap[ecpayStatus] || "CREATED";
  }

  /**
   * 生成檢查碼
   */
  private generateCheckMacValue(params: Record<string, string | number>): string {
    const sortedParams = Object.keys(params)
      .filter((key) => key !== "CheckMacValue")
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    const rawString = `HashKey=${this.config.hashKey}&${sortedParams}&HashIV=${this.config.hashIV}`;
    const encodedString = encodeURIComponent(rawString).toLowerCase();

    return crypto.createHash("md5").update(encodedString).digest("hex").toUpperCase();
  }

  /**
   * 解析回應
   */
  private parseResponse(response: string): Record<string, string> {
    const result: Record<string, string> = {};
    response.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      if (key) {
        result[key] = decodeURIComponent(value || "");
      }
    });
    return result;
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    return date
      .toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(/\//g, "/");
  }
}
