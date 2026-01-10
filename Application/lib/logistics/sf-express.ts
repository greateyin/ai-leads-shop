/**
 * 順豐速運 SDK 封裝
 * @see https://open.sf-express.com/
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
 * 順豐配置
 */
interface SFExpressConfig {
  partnerId: string;
  checkWord: string;
  monthlyCard?: string;
  isProduction?: boolean;
}

/**
 * 順豐速運服務
 */
export class SFExpressService implements LogisticsService {
  private config: SFExpressConfig;
  private baseUrl: string;

  constructor(config: SFExpressConfig) {
    this.config = config;
    this.baseUrl = config.isProduction
      ? "https://bsp-oisp.sf-express.com/bsp-oisp/sfexpressService"
      : "https://sfapi-sbox.sf-express.com/std/service";
  }

  /**
   * 建立物流訂單
   */
  async createOrder(
    request: CreateLogisticsOrderRequest
  ): Promise<CreateLogisticsOrderResponse> {
    const orderContent = {
      language: "zh-TW",
      orderId: request.orderNo,
      cargoDetails: request.items.map((item) => ({
        name: item.name,
        count: item.quantity,
        weight: item.weight || 0.5,
      })),
      contactInfoList: [
        {
          contactType: 1, // 寄件人
          company: "Manus AI Shop",
          contact: "客服中心",
          tel: "0800123456",
          address: "台北市信義區信義路五段7號",
          country: "TW",
          postCode: "110",
        },
        {
          contactType: 2, // 收件人
          contact: request.receiver.name,
          tel: request.receiver.phone,
          address: request.receiver.address || "",
          country: "TW",
          postCode: request.receiver.zipCode || "",
        },
      ],
      expressTypeId: 1, // 標準快遞
      payMethod: 1, // 寄方付
      isDoCall: 1, // 需要叫件
      ...(this.config.monthlyCard && { monthlyCard: this.config.monthlyCard }),
    };

    try {
      const response = await this.callAPI("EXP_RECE_CREATE_ORDER", orderContent);

      if (response.success === "true") {
        const msgData = response.msgData as { orderResponse?: Array<{ orderId?: string; waybillNoInfoList?: Array<{ waybillNo?: string }> }> } | undefined;
        const orderResponse = msgData?.orderResponse?.[0];
        return {
          success: true,
          logisticsId: orderResponse?.orderId,
          trackingNumber: orderResponse?.waybillNoInfoList?.[0]?.waybillNo,
        };
      }

      return {
        success: false,
        error: (response.errorMsg as string) || "建立物流訂單失敗",
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
    try {
      const response = await this.callAPI("EXP_RECE_SEARCH_ROUTES", {
        language: "zh-TW",
        trackingType: 1,
        trackingNumber: [trackingNumber],
        methodType: 1,
      });

      const msgData = response.msgData as { routeResps?: Array<{ routes?: Array<{ opCode?: string; remark?: string; acceptTime?: string; acceptAddress?: string }> }> } | undefined;
      if (response.success === "true" && msgData?.routeResps?.length) {
        const routes = msgData.routeResps[0].routes || [];
        const latestRoute = routes[0];

        return {
          status: this.mapSFStatus(latestRoute?.opCode || ""),
          statusText: latestRoute?.remark || "處理中",
          updatedAt: latestRoute?.acceptTime || new Date().toISOString(),
          history: routes.map((route: Record<string, string>) => ({
            status: route.opCode,
            description: route.remark,
            timestamp: route.acceptTime,
            location: route.acceptAddress,
          })),
        };
      }

      return {
        status: "CREATED",
        statusText: "查詢中",
        updatedAt: new Date().toISOString(),
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
    try {
      const response = await this.callAPI("EXP_RECE_PRINT_WAYBILLS", {
        version: "2.0",
        fileType: "pdf",
        sync: true,
        templateCode: "fm_150_standard_HKTWMO",
        documents: [
          {
            masterWaybillNo: logisticsId,
          },
        ],
      });

      if (response.success === "true") {
        const msgData = response.msgData as { obj?: { files?: Array<{ url?: string }> } } | undefined;
        return {
          labelUrl: msgData?.obj?.files?.[0]?.url || "",
        };
      }

      return { labelUrl: "" };
    } catch {
      return { labelUrl: "" };
    }
  }

  /**
   * 取消物流訂單
   */
  async cancelOrder(
    logisticsId: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await this.callAPI("EXP_RECE_UPDATE_ORDER", {
        orderId: logisticsId,
        dealType: 2, // 取消訂單
      });

      return {
        success: response.success === "true",
        message: response.errorMsg as string | undefined,
      };
    } catch {
      return {
        success: false,
        message: "取消訂單失敗",
      };
    }
  }

  /**
   * 呼叫順豐 API
   */
  private async callAPI(
    serviceCode: string,
    msgData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgDataStr = JSON.stringify(msgData);

    const signStr = `${msgDataStr}${timestamp}${this.config.checkWord}`;
    const msgDigest = crypto
      .createHash("md5")
      .update(signStr)
      .digest("base64");

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        partnerID: this.config.partnerId,
        requestID: `REQ${Date.now()}`,
        serviceCode,
        timestamp,
        msgDigest,
        msgData: msgDataStr,
      }),
    });

    return response.json();
  }

  /**
   * 對應順豐狀態到統一狀態
   */
  private mapSFStatus(opCode: string): LogisticsStatus {
    const statusMap: Record<string, LogisticsStatus> = {
      "50": "AWAITING_PICKUP",
      "51": "AWAITING_PICKUP",
      "52": "IN_TRANSIT",
      "54": "IN_TRANSIT",
      "80": "DELIVERED",
      "607": "RETURNED",
    };
    return statusMap[opCode] || "CREATED";
  }
}
