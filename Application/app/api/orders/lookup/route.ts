import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * 訂單查詢 Schema
 */
const lookupSchema = z.object({
    email: z.string().email("請輸入有效的電子郵件"),
    orderNo: z.string().min(1, "請輸入訂單編號"),
    shopSlug: z.string().min(1, "缺少商店識別"),
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

        const { email, orderNo, shopSlug } = validation.data;

        // [安全] 透過 shopSlug 限定 tenant scope，防止跨租戶訂單枚舉
        // TODO: 加入 rate limiting（IP / email 維度），降低暴力枚舉風險
        const shop = await db.shop.findFirst({
            where: { slug: shopSlug },
            select: { tenantId: true },
        });

        if (!shop) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "NOT_FOUND", message: "找不到符合的訂單，請確認電子郵件和訂單編號是否正確" },
                },
                { status: 404 }
            );
        }

        // 查詢訂單（限定 tenant scope）
        const order = await db.order.findFirst({
            where: {
                orderNo,
                tenantId: shop.tenantId,
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
