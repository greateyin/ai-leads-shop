/**
 * Google Merchant Shopping APIs v1 — Order Callbacks (Inbound)
 * POST /api/ucp/v1/callbacks/orders
 *
 * 接收來自 Google 等平台的訂單動作請求（取消、退款等）。
 * 此端點在 profile.json 中宣告為 orderManagement.callbackUrl。
 *
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §6
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyUcpRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { sendOrderCallback } from "@/lib/ucp/handlers/callbacks";

// ===========================================
// Schema
// ===========================================

const orderActionSchema = z.object({
    orderId: z.string().uuid(),
    action: z.enum(["CANCEL", "REFUND", "RETURN"]),
    reason: z.string().optional(),
});

// ===========================================
// POST: 接收平台訂單動作
// ===========================================

/**
 * POST /api/ucp/v1/callbacks/orders
 *
 * 平台要求對訂單執行動作（取消、退款、退貨）。
 * 商家端處理後回覆結果。
 */
export async function POST(request: NextRequest) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const body = await request.json();
        const validation = orderActionSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Invalid request format", {
                    details: validation.error.flatten(),
                }),
                { status: 400 }
            );
        }

        // 驗證 UCP 請求
        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        const { tenantId, merchantId } = authResult.context!;
        const { orderId, action, reason } = validation.data;

        // 查詢訂單
        const order = await db.order.findFirst({
            where: { id: orderId, shopId: merchantId, tenantId },
            select: {
                id: true,
                status: true,
                orderNo: true,
            },
        });

        if (!order) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Order not found"),
                { status: 404 }
            );
        }

        const previousStatus = order.status;

        // 根據動作執行對應邏輯
        switch (action) {
            case "CANCEL": {
                if (order.status === "CANCELLED") {
                    return NextResponse.json(
                        formatUcpError("CONFLICT", "Order is already cancelled"),
                        { status: 409 }
                    );
                }

                // 僅允許 PENDING / CONFIRMED 訂單取消
                if (!["PENDING", "CONFIRMED"].includes(order.status)) {
                    return NextResponse.json(
                        formatUcpError(
                            "INVALID_REQUEST",
                            `Cannot cancel order in ${order.status} status`
                        ),
                        { status: 400 }
                    );
                }

                await db.order.update({
                    where: { id: orderId },
                    data: { status: "CANCELLED" },
                });

                // 發送 callback 通知平台
                await sendOrderCallback(orderId, "CANCELLED", previousStatus, { reason });
                break;
            }

            case "REFUND": {
                if (order.status === "REFUNDING") {
                    return NextResponse.json(
                        formatUcpError("CONFLICT", "Order is already in refunding process"),
                        { status: 409 }
                    );
                }

                await db.order.update({
                    where: { id: orderId },
                    data: { status: "REFUNDING", paymentStatus: "REFUNDED" },
                });

                await sendOrderCallback(orderId, "REFUNDING", previousStatus, { reason });
                break;
            }

            case "RETURN": {
                // 退貨需要訂單已完成
                if (order.status !== "COMPLETED") {
                    return NextResponse.json(
                        formatUcpError(
                            "INVALID_REQUEST",
                            `Cannot return order in ${order.status} status`
                        ),
                        { status: 400 }
                    );
                }

                // 退貨在此系統中進入退款流程
                await db.order.update({
                    where: { id: orderId },
                    data: { status: "REFUNDING", paymentStatus: "REFUNDED" },
                });

                await sendOrderCallback(orderId, "REFUNDING", previousStatus, { reason });
                break;
            }
        }

        return NextResponse.json({
            orderId,
            action,
            status: "ACCEPTED",
            message: `Order ${action.toLowerCase()} processed successfully`,
        });
    } catch (error) {
        console.error("[UCP v1 Callback] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
