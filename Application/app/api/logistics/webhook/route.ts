import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * ECPay 物流狀態回調 Schema
 */
const ecpayWebhookSchema = z.object({
    MerchantID: z.string(),
    MerchantTradeNo: z.string(),
    AllPayLogisticsID: z.string(),
    LogisticsType: z.string(),
    LogisticsSubType: z.string(),
    GoodsAmount: z.string(),
    UpdateStatusDate: z.string(),
    ReceiverName: z.string().optional(),
    ReceiverPhone: z.string().optional(),
    ReceiverCellPhone: z.string().optional(),
    ReceiverEmail: z.string().optional(),
    ReceiverAddress: z.string().optional(),
    CVSPaymentNo: z.string().optional(),
    CVSValidationNo: z.string().optional(),
    BookingNote: z.string().optional(),
    RtnCode: z.string(),
    RtnMsg: z.string(),
});

/**
 * 通用物流狀態回調 Schema
 */
const genericWebhookSchema = z.object({
    provider: z.enum(["ECPAY", "SF_EXPRESS", "SEVEN_ELEVEN", "FAMILY_MART"]),
    trackingNumber: z.string(),
    status: z.enum(["CREATED", "AWAITING_PICKUP", "IN_TRANSIT", "DELIVERED", "CANCELLED"]),
    statusMessage: z.string().optional(),
    timestamp: z.string().optional(),
    rawPayload: z.record(z.unknown()).optional(),
});

/**
 * 將供應商狀態轉換為系統狀態
 */
function mapProviderStatus(rtnCode: string): "CREATED" | "AWAITING_PICKUP" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED" {
    // ECPay 物流狀態碼對應
    switch (rtnCode) {
        case "300": // 已產生托運單
            return "CREATED";
        case "2030": // 等待取貨
        case "2067": // 已送達門市
            return "AWAITING_PICKUP";
        case "3001": // 配送中
        case "3003": // 已轉運
            return "IN_TRANSIT";
        case "2073": // 已取貨
        case "3022": // 已完成
            return "DELIVERED";
        case "2074": // 已退貨
        case "10027": // 取消
            return "CANCELLED";
        default:
            return "IN_TRANSIT";
    }
}

/**
 * POST /api/logistics/webhook
 * 物流供應商狀態回調端點
 */
export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get("content-type") || "";

        let payload: Record<string, unknown>;

        // 處理 ECPay 使用 form-urlencoded 格式
        if (contentType.includes("application/x-www-form-urlencoded")) {
            const formData = await request.formData();
            payload = Object.fromEntries(formData.entries()) as Record<string, unknown>;
        } else {
            payload = await request.json();
        }

        console.log("[Logistics Webhook] Received payload:", JSON.stringify(payload));

        // 嘗試解析為 ECPay 格式
        const ecpayResult = ecpayWebhookSchema.safeParse(payload);

        if (ecpayResult.success) {
            const data = ecpayResult.data;

            // 從 trackingNumber 或 MerchantTradeNo 找到物流訂單
            const shippingOrder = await db.shippingOrder.findFirst({
                where: {
                    OR: [
                        { trackingNumber: data.AllPayLogisticsID },
                        { order: { orderNo: data.MerchantTradeNo } },
                    ],
                },
                include: {
                    order: {
                        select: { id: true, userId: true, user: { select: { email: true } } },
                    },
                    provider: {
                        select: { config: true },
                    },
                },
            });

            if (!shippingOrder) {
                console.warn(`[Logistics Webhook] 找不到物流訂單: ${data.AllPayLogisticsID}`);
                return new NextResponse("1|OK"); // ECPay 需要回 1|OK
            }

            // 驗證 CheckMacValue 簽章
            const providerConfig = shippingOrder.provider?.config as { hashKey?: string; hashIV?: string } | null;
            if (providerConfig?.hashKey && providerConfig?.hashIV) {
                const { ECPayLogisticsService } = await import("@/lib/logistics/ecpay-logistics");
                const ecpayService = new ECPayLogisticsService({
                    merchantId: data.MerchantID,
                    hashKey: providerConfig.hashKey,
                    hashIV: providerConfig.hashIV,
                });

                // 驗證簽章
                if (!ecpayService.verifyCheckMacValue(payload as Record<string, string>)) {
                    console.error(`[Logistics Webhook] 簽章驗證失敗: ${data.AllPayLogisticsID}`);
                    return new NextResponse("0|CheckMacValue Error", { status: 400 });
                }
                console.log(`[Logistics Webhook] 簽章驗證成功: ${data.AllPayLogisticsID}`);
            } else {
                console.warn(`[Logistics Webhook] 無法驗證簽章，缺少 hashKey/hashIV 設定`);
            }

            const newStatus = mapProviderStatus(data.RtnCode);

            // 更新物流訂單狀態 (tenantId 确认在 findFirst 時已驗證)
            await db.shippingOrder.update({
                where: { id: shippingOrder.id, tenantId: shippingOrder.tenantId },
                data: {
                    status: newStatus,
                    trackingNumber: data.AllPayLogisticsID || shippingOrder.trackingNumber,
                },
            });

            // 更新訂單 shippingStatus
            const orderShippingStatus = newStatus === "DELIVERED" ? "DELIVERED"
                : newStatus === "IN_TRANSIT" ? "DELIVERING"
                    : newStatus === "AWAITING_PICKUP" ? "PREPARING"
                        : newStatus === "CANCELLED" ? "RETURNED"
                            : "PREPARING";

            await db.order.update({
                where: { id: shippingOrder.orderId, tenantId: shippingOrder.tenantId },
                data: { shippingStatus: orderShippingStatus },
            });

            // 記錄審計日誌
            await db.auditLog.create({
                data: {
                    id: generateId(),
                    tenantId: shippingOrder.tenantId,
                    userId: shippingOrder.order.userId || "",
                    action: "UPDATE",
                    entityType: "ShippingOrder",
                    entityId: shippingOrder.id,
                    oldValue: { status: shippingOrder.status },
                    newValue: { status: newStatus, rtnCode: data.RtnCode, rtnMsg: data.RtnMsg },
                },
            });

            // TODO: 發送通知給顧客
            console.log(`[Logistics Webhook] 物流訂單 ${shippingOrder.id} 狀態更新: ${shippingOrder.status} → ${newStatus}`);

            return new NextResponse("1|OK");
        }

        // 嘗試解析為通用格式
        const genericResult = genericWebhookSchema.safeParse(payload);

        if (genericResult.success) {
            const data = genericResult.data;

            const shippingOrder = await db.shippingOrder.findFirst({
                where: { trackingNumber: data.trackingNumber },
                include: {
                    order: {
                        select: { id: true, userId: true },
                    },
                },
            });

            if (!shippingOrder) {
                console.warn(`[Logistics Webhook] 找不到物流訂單: ${data.trackingNumber}`);
                return NextResponse.json({ success: false, error: "ShippingOrder not found" }, { status: 404 });
            }

            // 更新物流訂單狀態 (tenantId 確認在 findFirst 時已驗證)
            await db.shippingOrder.update({
                where: { id: shippingOrder.id, tenantId: shippingOrder.tenantId },
                data: { status: data.status as "CREATED" | "AWAITING_PICKUP" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED" },
            });

            // 更新訂單 shippingStatus
            const orderShippingStatus = data.status === "DELIVERED" ? "DELIVERED"
                : data.status === "IN_TRANSIT" ? "DELIVERING"
                    : data.status === "CANCELLED" ? "RETURNED"
                        : "PREPARING";

            await db.order.update({
                where: { id: shippingOrder.orderId, tenantId: shippingOrder.tenantId },
                data: { shippingStatus: orderShippingStatus },
            });

            console.log(`[Logistics Webhook] 物流訂單 ${shippingOrder.id} 狀態更新: ${data.status}`);

            return NextResponse.json({ success: true });
        }

        // 無法解析
        console.error("[Logistics Webhook] 無法解析 payload");
        return NextResponse.json({ success: false, error: "Invalid payload format" }, { status: 400 });

    } catch (error) {
        console.error("[Logistics Webhook] 錯誤:", error);
        return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
    }
}
