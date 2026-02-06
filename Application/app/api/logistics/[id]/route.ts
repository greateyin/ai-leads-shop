import { NextRequest, NextResponse } from "next/server";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";

/**
 * GET /api/logistics/[id]
 * 取得單一物流訂單詳情
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { session } = await authWithTenant();
        if (!session) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const { id } = await params;

        const shippingOrder = await db.shippingOrder.findFirst({
            where: {
                id,
                tenantId: session.user.tenantId,
            },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNo: true,
                        status: true,
                        shippingStatus: true,
                        totalAmount: true,
                        user: { select: { name: true, email: true } },
                        addresses: { where: { type: "SHIPPING" } },
                    },
                },
                provider: true,
                method: true,
            },
        });

        if (!shippingOrder) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "找不到物流訂單" } },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: shippingOrder,
        });
    } catch (error) {
        console.error("取得物流訂單詳情錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "取得物流訂單詳情失敗" } },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/logistics/[id]
 * 更新物流訂單狀態（手動）
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { session } = await authWithTenant();
        if (!session) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        const { id } = await params;
        const body = await request.json();
        const { status, trackingNumber } = body as { status?: string; trackingNumber?: string };

        const shippingOrder = await db.shippingOrder.findFirst({
            where: {
                id,
                tenantId: session.user.tenantId,
            },
        });

        if (!shippingOrder) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "找不到物流訂單" } },
                { status: 404 }
            );
        }

        // 更新物流訂單
        const updatedShippingOrder = await db.shippingOrder.update({
            where: { id, tenantId: session.user.tenantId },
            data: {
                ...(status && { status: status as "CREATED" | "AWAITING_PICKUP" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED" }),
                ...(trackingNumber && { trackingNumber }),
            },
            include: {
                provider: true,
                method: true,
            },
        });

        // 同步更新訂單 shippingStatus
        if (status) {
            const orderShippingStatus = status === "DELIVERED" ? "DELIVERED"
                : status === "IN_TRANSIT" ? "DELIVERING"
                    : status === "CANCELLED" ? "RETURNED"
                        : "PREPARING";

            // [安全] 加 tenantId 限制防止跨租戶更新
            await db.order.updateMany({
                where: { id: shippingOrder.orderId, tenantId: session.user.tenantId },
                data: { shippingStatus: orderShippingStatus },
            });
        }

        return NextResponse.json({
            success: true,
            data: updatedShippingOrder,
            message: "物流訂單更新成功",
        });
    } catch (error) {
        console.error("更新物流訂單錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "更新物流訂單失敗" } },
            { status: 500 }
        );
    }
}
