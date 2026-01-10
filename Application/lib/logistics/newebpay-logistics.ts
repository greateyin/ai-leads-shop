/**
 * 藍新物流服務整合模組
 * 提供超商取貨、宅配等物流服務
 */

import {
  LogisticsService,
  CreateLogisticsOrderRequest,
  CreateLogisticsOrderResponse,
  TrackingInfo,
  LogisticsStatus,
} from "./index";

/**
 * 藍新物流配置介面
 */
interface NewebPayLogisticsConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  isProduction?: boolean;
}

/**
 * 藍新物流服務實作
 */
export class NewebPayLogisticsService implements LogisticsService {
  private config: NewebPayLogisticsConfig;
  private baseUrl: string;

  constructor(config: NewebPayLogisticsConfig) {
    this.config = config;
    this.baseUrl = config.isProduction
      ? "https://core.newebpay.com/API/CvsMap/cvs"
      : "https://ccore.newebpay.com/API/CvsMap/cvs";
  }

  /**
   * 建立物流訂單
   */
  async createOrder(request: CreateLogisticsOrderRequest): Promise<CreateLogisticsOrderResponse> {
    try {
      const payload = this.buildCreateOrderPayload(request);
      const response = await this.callApi("/CreateOrder", payload);

      if (response.Status === "SUCCESS") {
        const result = response.Result as { LogisticsID?: string; ShipNo?: string; PrintURL?: string } | undefined;
        return {
          success: true,
          logisticsId: result?.LogisticsID,
          trackingNumber: result?.ShipNo,
          labelUrl: result?.PrintURL,
        };
      }

      return {
        success: false,
        error: response.Message || "建立物流訂單失敗",
      };
    } catch (error) {
      console.error("NewebPay logistics error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "建立物流訂單失敗",
      };
    }
  }

  /**
   * 取得物流追蹤資訊
   */
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      const payload = {
        MerchantID: this.config.merchantId,
        ShipNo: trackingNumber,
      };

      const response = await this.callApi("/QueryOrder", payload);

      if (response.Status === "SUCCESS") {
        const result = response.Result as { ShipStatus?: string; ShipStatusDesc?: string; Events?: Array<{ Time: string; Status: string; Desc: string }> } | undefined;
        return {
          status: this.mapStatus(result?.ShipStatus),
          statusText: result?.ShipStatusDesc || "",
          updatedAt: new Date().toISOString(),
          history: this.parseTrackingHistory(result?.Events),
        };
      }

      return {
        status: "CREATED",
        statusText: "查詢失敗",
        updatedAt: new Date().toISOString(),
        history: [],
      };
    } catch (error) {
      console.error("NewebPay tracking error:", error);
      return {
        status: "CREATED",
        statusText: "查詢失敗",
        updatedAt: new Date().toISOString(),
        history: [],
      };
    }
  }

  /**
   * 列印託運單
   */
  async printLabel(logisticsId: string): Promise<{ labelUrl: string }> {
    try {
      const payload = {
        MerchantID: this.config.merchantId,
        LogisticsID: logisticsId,
      };

      const response = await this.callApi("/PrintLabel", payload);

      const result = response.Result as { PrintURL?: string } | undefined;
      return {
        labelUrl: result?.PrintURL || "",
      };
    } catch (error) {
      console.error("NewebPay label error:", error);
      return { labelUrl: "" };
    }
  }

  /**
   * 取消物流訂單
   */
  async cancelOrder(logisticsId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const payload = {
        MerchantID: this.config.merchantId,
        LogisticsID: logisticsId,
      };

      const response = await this.callApi("/CancelOrder", payload);
      return {
        success: response.Status === "SUCCESS",
        message: response.Message,
      };
    } catch (error) {
      console.error("NewebPay cancel error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "取消失敗",
      };
    }
  }

  /**
   * 建立物流訂單請求資料
   */
  private buildCreateOrderPayload(request: CreateLogisticsOrderRequest) {
    return {
      MerchantID: this.config.merchantId,
      MerchantOrderNo: request.orderNo,
      ShipType: this.mapShippingType(request.shippingType),
      ReceiverName: request.receiver.name,
      ReceiverPhone: request.receiver.phone,
      ReceiverAddress: request.receiver.address,
      ReceiverStoreID: request.receiver.storeId,
      GoodsName: request.items.map((i) => i.name).join(","),
      GoodsAmount: request.totalAmount,
      CollectionAmount: request.isCollection ? request.collectionAmount : 0,
    };
  }

  /**
   * 呼叫藍新物流 API
   */
  private async callApi(endpoint: string, payload: Record<string, unknown>): Promise<{
    Status: string;
    Message?: string;
    Result?: Record<string, unknown>;
  }> {
    const encryptedData = this.encryptData(payload);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        MerchantID_: this.config.merchantId,
        PostData_: encryptedData,
      }),
    });

    const result = await response.json();
    return this.decryptResponse(result);
  }

  /**
   * AES 加密請求資料
   */
  private encryptData(data: Record<string, unknown>): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto");
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      this.config.hashKey,
      this.config.hashIV
    );
    let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
  }

  /**
   * AES 解密回應資料
   */
  private decryptResponse(response: { Status: string; Message?: string; Result?: string }): {
    Status: string;
    Message?: string;
    Result?: Record<string, unknown>;
  } {
    if (!response.Result) {
      return { Status: response.Status, Message: response.Message };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require("crypto");
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        this.config.hashKey,
        this.config.hashIV
      );
      let decrypted = decipher.update(response.Result, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return {
        Status: response.Status,
        Message: response.Message,
        Result: JSON.parse(decrypted),
      };
    } catch {
      return { Status: response.Status, Message: response.Message };
    }
  }

  /**
   * 對應物流類型
   */
  private mapShippingType(type: string): string {
    const mapping: Record<string, string> = {
      CVS_711: "UNIMARTC2C",
      CVS_FAMI: "FAMIC2C",
      CVS_HILIFE: "HILIFEC2C",
      CVS_PICKUP: "OKMARTC2C",
      HOME: "HOME",
    };
    return mapping[type] || "HOME";
  }

  /**
   * 對應物流狀態
   */
  private mapStatus(status: string | undefined): LogisticsStatus {
    if (!status) return "CREATED";
    const mapping: Record<string, LogisticsStatus> = {
      "0": "CREATED",
      "1": "AWAITING_PICKUP",
      "2": "IN_TRANSIT",
      "3": "ARRIVED_AT_STORE",
      "4": "IN_TRANSIT",
      "5": "DELIVERED",
      "9": "CANCELLED",
    };
    return mapping[status] || "CREATED";
  }

  /**
   * 解析追蹤歷史
   */
  private parseTrackingHistory(events: Array<{ Time: string; Status: string; Desc: string }> | undefined) {
    if (!events) return [];

    return events.map((event) => ({
      timestamp: event.Time,
      status: event.Status,
      description: event.Desc,
    }));
  }
}

/**
 * 建立藍新物流服務實例
 */
export function createNewebPayLogisticsService(): NewebPayLogisticsService {
  const merchantId = process.env.NEWEBPAY_LOGISTICS_MERCHANT_ID;
  const hashKey = process.env.NEWEBPAY_LOGISTICS_HASH_KEY;
  const hashIV = process.env.NEWEBPAY_LOGISTICS_HASH_IV;

  if (!merchantId || !hashKey || !hashIV) {
    throw new Error("NewebPay logistics configuration is incomplete");
  }

  return new NewebPayLogisticsService({
    merchantId,
    hashKey,
    hashIV,
    isProduction: process.env.NODE_ENV === "production",
  });
}
