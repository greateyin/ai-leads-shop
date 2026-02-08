import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";

/**
 * 訂單查詢 Schema
 */
const lookupSchema = z.object({
    email: z.string().email("請輸入有效的電子郵件"),
    orderNo: z.string().min(1, "請輸入訂單編號"),
    /** @deprecated 單店制後不再使用；tenant 邊界改由 request host 解析。保留僅為前端向後相容。 */
    shopSlug: z.string().optional(),
});

/**
 * POST /api/orders/lookup
 * 訪客訂單查詢 - 透過 email + 訂單號查詢訂單狀態
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validation = lookupSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: validation.error.errors[0].message,
                    },
                },
                { status: 400 }
            );
        }

        const { email, orderNo } = validation.data;

        // [安全] 從 request host 解析租戶，不信任 client 傳入的 shopSlug
        // TODO: 加入 rate limiting（IP / email 維度），降低暴力枚舉風險
        const tenant = await resolveTenantFromRequest(request);

        if (!tenant) {
            // fail-closed：無法辨識租戶時拒絕查詢
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "FORBIDDEN", message: "無法辨識商店來源" },
                },
                { status: 403 }
            );
        }

        // 查詢訂單（以 host 解析的 tenantId 限定 scope）
        const order = await db.order.findFirst({
            where: {
                orderNo,
                tenantId: tenant.tenantId,
                // 查詢訪客訂單：比對 metadata 中的 guestEmail
                // 或查詢登入用戶的訂單：比對 user.email
                OR: [
                    {
                        metadata: {
                            path: ["guestEmail"],
                            equals: email,
                        },
                    },
                    {
                        user: {
                            email,
                        },
                    },
                ],
            },
            select: {
                id: true,
                orderNo: true,
                status: true,
                paymentStatus: true,
                shippingStatus: true,
                totalAmount: true,
                shippingFee: true,
                currency: true,
                metadata: true,
                createdAt: true,
                updatedAt: true,
                items: {
                    select: {
                        id: true,
                        name: true,
                        quantity: true,
                        unitPrice: true,
                        subtotal: true,
                    },
                },
                addresses: {
                    where: { type: "SHIPPING" },
                    select: {
                        contactName: true,
                        phone: true,
                        city: true,
                        addressLine1: true,
                    },
                },
                shop: {
                    select: {
                        name: true,
                        slug: true,
                    },
                },
            },
        });

        if (!order) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "NOT_FOUND",
                        message: "找不到符合的訂單，請確認電子郵件和訂單編號是否正確",
                    },
                },
                { status: 404 }
            );
        }

        // 處理回傳資料
        const metadata = order.metadata as Record<string, unknown> | null;
        const guestName = metadata?.guestName as string | undefined;

        return NextResponse.json({
            success: true,
            data: {
                ...order,
                guestName,
                totalAmount: Number(order.totalAmount),
                shippingFee: Number(order.shippingFee),
                items: order.items.map((item) => ({
                    ...item,
                    unitPrice: Number(item.unitPrice),
                    subtotal: Number(item.subtotal),
                })),
            },
        });
    } catch (error) {
        console.error("訂單查詢錯誤:", error);
        return NextResponse.json(
            {
                success: false,
                error: { code: "INTERNAL_ERROR", message: "查詢訂單失敗" },
            },
            { status: 500 }
        );
    }
}
