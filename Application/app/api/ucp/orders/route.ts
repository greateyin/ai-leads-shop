/**
 * UCP Orders API
 * POST /api/ucp/orders - 確認訂單（接收付款 token）
 * GET /api/ucp/orders?orderId=xxx - 查詢訂單狀態
 * 
 * 將 UCP Session 轉換為正式訂單
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { verifyUcpRequest, formatUcpError } from "@/lib/ucp/middleware";
import { ucpGuard } from "@/lib/ucp/guard";
import { withDeprecationHeaders } from "@/lib/ucp/deprecation";
import { getStripeConfigForTenant, createPaymentIntent } from "@/lib/payment/stripe";
import type { UcpOrder, UcpCheckoutSession, UcpMoney } from "@/lib/ucp/types";

// ===========================================
// Schema 定義
// ===========================================

const createOrderSchema = z.object({
    checkoutSessionId: z.string().uuid(),
    merchantId: z.string().uuid(),
    paymentToken: z.string().optional(), // 如果是嵌入式結帳，可能不需要
    paymentHandlerId: z.string().optional(),
});

// ===========================================
// 輔助函數
// ===========================================

function fromUcpMoney(money: UcpMoney): number {
    return money.value / 100;
}

function toUcpMoney(amount: number, currency: string): UcpMoney {
    return {
        value: Math.round(amount * 100),
        currency: currency.toUpperCase(),
    };
}

// ===========================================
// POST: 確認訂單
// ===========================================

export async function POST(request: NextRequest) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const body = await request.json();
        const validation = createOrderSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Invalid request format", {
                    details: validation.error.flatten(),
                }),
                { status: 400 }
            );
        }

        const { checkoutSessionId, merchantId, paymentToken, paymentHandlerId } = validation.data;

        // [安全] 強制驗證 UCP 請求（API Key + 商家啟用狀態）
        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        const shop = await db.shop.findFirst({
            where: { id: authResult.context!.shopId },
            select: { id: true, tenantId: true, currency: true, config: true },
        });

        if (!shop) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Merchant not found"),
                { status: 404 }
            );
        }

        // 取得 Checkout Session（加上 tenantId 一致性）
        const dbSession = await db.ucpCheckoutSession.findFirst({
            where: {
                id: checkoutSessionId,
                shopId: merchantId,
                tenantId: shop.tenantId,
            },
        });

        if (!dbSession) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Checkout session not found"),
                { status: 404 }
            );
        }


        const cartData = dbSession.cartData as unknown as UcpCheckoutSession["cart"];
        const buyerEmail = dbSession.buyerEmail || undefined;
        const shippingAddress = dbSession.shippingAddress as unknown as UcpCheckoutSession["shippingAddress"];

        // 檢查 Session 狀態
        if (dbSession.expiresAt < new Date()) {
            return NextResponse.json(
                formatUcpError("SESSION_EXPIRED", "Checkout session has expired"),
                { status: 400 }
            );
        }

        if (dbSession.status === "COMPLETED") {
            return NextResponse.json(
                formatUcpError("CONFLICT", "Order already created for this session"),
                { status: 409 }
            );
        }

        const tenantId = dbSession.tenantId;
        const currency = shop.currency;
        const totalAmount = fromUcpMoney(cartData.total);

        // 產生訂單編號
        const orderNo = `UCP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const orderId = generateId();

        // 建立訂單項目（加 tenantId 防禦深度，避免跨租戶商品資訊洩漏）
        const orderItems = await Promise.all(
            cartData.items.map(async (item) => {
                const product = await db.product.findFirst({
                    where: { id: item.offerId, tenantId },
                    select: { name: true, sku: true },
                });

                // 商品不存在或不屬於當前租戶時必須報錯，不可無聲建單
                if (!product) {
                    throw new Error(
                        `Product ${item.offerId} not found within tenant ${tenantId}`
                    );
                }

                const unitPrice = item.price ? fromUcpMoney(item.price) : 0;

                return {
                    id: generateId(),
                    tenantId,
                    productId: item.offerId,
                    name: product.name,
                    sku: product.sku || "",
                    quantity: item.quantity,
                    unitPrice,
                    discount: 0,
                    subtotal: unitPrice * item.quantity,
                };
            })
        );

        // 使用交易建立訂單
        const order = await db.$transaction(async (tx) => {
            // 建立訂單
            const newOrder = await tx.order.create({
                data: {
                    id: orderId,
                    tenantId,
                    shopId: shop.id,
                    orderNo,
                    status: "PENDING",
                    currency,
                    totalAmount,
                    shippingFee: cartData.shippingFee ? fromUcpMoney(cartData.shippingFee) : 0,
                    discountAmount: 0,
                    taxAmount: cartData.tax ? fromUcpMoney(cartData.tax) : 0,
                    paymentStatus: "PENDING",
                    shippingStatus: "PENDING",
                    items: {
                        create: orderItems,
                    },
                },
                include: {
                    items: true,
                },
            });

            // 建立地址（如果有運送地址）
            if (shippingAddress) {
                await tx.address.create({
                    data: {
                        id: generateId(),
                        tenantId,
                        userId: generateId(), // UCP 訂單可能沒有用戶帳號，使用 placeholder
                        orderId: newOrder.id,
                        type: "SHIPPING",
                        contactName: shippingAddress.name || "",
                        phone: shippingAddress.phoneNumber || "",
                        country: shippingAddress.regionCode,
                        state: shippingAddress.administrativeArea || "",
                        city: shippingAddress.locality,
                        postalCode: shippingAddress.postalCode,
                        addressLine1: shippingAddress.addressLines[0] || "",
                        addressLine2: shippingAddress.addressLines.slice(1).join(", ") || undefined,
                    },
                });
            }

            // 扣除庫存（加 tenantId 防禦深度，防止跨租戶庫存誤扣）
            // 必須檢查 updateMany 回傳的 count，count=0 代表商品不存在或不屬於當前租戶
            for (const item of cartData.items) {
                const result = await tx.product.updateMany({
                    where: { id: item.offerId, tenantId },
                    data: {
                        stock: {
                            decrement: item.quantity,
                        },
                    },
                });

                if (result.count === 0) {
                    throw new Error(
                        `Stock decrement failed: product ${item.offerId} not found within tenant ${tenantId}`
                    );
                }
            }

            return newOrder;
        });

        // 處理付款（如果提供了 token）
        let paymentStatus: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" = "PENDING";
        let transactionId: string | undefined;

        if (paymentToken && paymentHandlerId === "stripe") {
            const stripeConfig = await getStripeConfigForTenant(tenantId);
            if (stripeConfig) {
                try {
                    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
                    const result = await createPaymentIntent(stripeConfig, {
                        orderId: order.id,
                        amount: totalAmount,
                        currency: currency.toLowerCase(),
                        description: `UCP Order ${orderNo}`,
                        successUrl: `${baseUrl}/orders/${order.id}/success`,
                        cancelUrl: `${baseUrl}/orders/${order.id}/cancel`,
                        customerEmail: buyerEmail,
                    });
                    transactionId = result.paymentIntentId;
                    paymentStatus = "AUTHORIZED";

                    // 更新訂單付款狀態
                    await db.order.update({
                        where: { id: order.id },
                        data: { paymentStatus: "PENDING" }, // 等待 webhook 確認
                    });

                    // 建立付款記錄
                    await db.payment.create({
                        data: {
                            id: generateId(),
                            tenantId,
                            orderId: order.id,
                            provider: "STRIPE",
                            amount: totalAmount,
                            currency,
                            status: "INITIATED",
                            transactionNo: transactionId,
                        },
                    });
                } catch (error) {
                    console.error("[UCP Orders] Payment error:", error);
                    paymentStatus = "FAILED";
                }
            }
        }

        // 更新 Session 狀態
        await db.ucpCheckoutSession.update({
            where: { id: checkoutSessionId },
            data: {
                status: "COMPLETED",
                orderId: order.id,
            },
        });

        // 建構 UCP 訂單回應
        const ucpOrder: UcpOrder = {
            id: order.id,
            merchantId,
            merchantOrderId: order.orderNo,
            status: "CONFIRMED",
            cart: cartData,
            shippingAddress: shippingAddress,
            billingAddress: dbSession.billingAddress as unknown as UcpCheckoutSession["billingAddress"],
            payment: {
                status: paymentStatus,
                transactionId,
            },
            createdAt: order.createdAt.toISOString(),
            updatedAt: order.updatedAt.toISOString(),
        };

        return withDeprecationHeaders(
            NextResponse.json(ucpOrder, { status: 201 }),
            "/api/ucp/v1/checkout-sessions/{id}/complete"
        );
    } catch (error) {
        console.error("[UCP Orders] Error:", error);

        // 商品不存在或庫存扣減失敗 → 回傳可識別的 422 而非泛用 500
        const errMsg = error instanceof Error ? error.message : "";
        if (errMsg.includes("not found within tenant") || errMsg.includes("Stock decrement failed")) {
            return NextResponse.json(
                formatUcpError("INVALID_CART", errMsg),
                { status: 422 }
            );
        }

        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}

// ===========================================
// GET: 查詢訂單狀態
// ===========================================

export async function GET(request: NextRequest) {
    const disabled = ucpGuard();
    if (disabled) return disabled;

    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get("orderId");
        const merchantId = searchParams.get("merchantId");

        if (!orderId || !merchantId) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Missing orderId or merchantId"),
                { status: 400 }
            );
        }

        // [安全] 驗證 UCP 請求（API Key + 商家啟用狀態）
        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        // [安全] 查詢訂單加上 tenantId 一致性
        const order = await db.order.findFirst({
            where: {
                id: orderId,
                shopId: merchantId,
                tenantId: authResult.context!.tenantId,
            },
            include: {
                items: {
                    select: {
                        productId: true,
                        quantity: true,
                        unitPrice: true,
                    },
                },
                addresses: {
                    where: { type: "SHIPPING" },
                    take: 1,
                },
                shop: {
                    select: { currency: true },
                },
            },
        });

        if (!order) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Order not found"),
                { status: 404 }
            );
        }

        // 轉換訂單狀態
        const statusMap: Record<string, UcpOrder["status"]> = {
            PENDING: "PENDING",
            CONFIRMED: "CONFIRMED",
            PROCESSING: "PROCESSING",
            SHIPPED: "SHIPPED",
            DELIVERED: "DELIVERED",
            CANCELLED: "CANCELLED",
            REFUNDED: "REFUNDED",
        };

        const paymentStatusMap: Record<string, UcpOrder["payment"]["status"]> = {
            PENDING: "PENDING",
            PAID: "CAPTURED",
            FAILED: "FAILED",
            REFUNDED: "REFUNDED",
        };

        const currency = order.shop.currency;
        const shippingAddr = order.addresses[0];

        const ucpOrder: UcpOrder = {
            id: order.id,
            merchantId,
            merchantOrderId: order.orderNo,
            status: statusMap[order.status] || "PENDING",
            cart: {
                items: order.items.map((item) => ({
                    offerId: item.productId,
                    quantity: item.quantity,
                    price: toUcpMoney(Number(item.unitPrice), currency),
                })),
                subtotal: toUcpMoney(
                    Number(order.totalAmount) - Number(order.shippingFee) - Number(order.taxAmount),
                    currency
                ),
                shippingFee: Number(order.shippingFee) > 0
                    ? toUcpMoney(Number(order.shippingFee), currency)
                    : undefined,
                tax: Number(order.taxAmount) > 0
                    ? toUcpMoney(Number(order.taxAmount), currency)
                    : undefined,
                total: toUcpMoney(Number(order.totalAmount), currency),
            },
            shippingAddress: shippingAddr
                ? {
                    name: shippingAddr.contactName,
                    addressLines: [shippingAddr.addressLine1, shippingAddr.addressLine2].filter(Boolean) as string[],
                    locality: shippingAddr.city,
                    administrativeArea: shippingAddr.state || undefined,
                    postalCode: shippingAddr.postalCode,
                    regionCode: shippingAddr.country,
                    phoneNumber: shippingAddr.phone,
                }
                : undefined,
            payment: {
                status: paymentStatusMap[order.paymentStatus] || "PENDING",
            },
            createdAt: order.createdAt.toISOString(),
            updatedAt: order.updatedAt.toISOString(),
        };

        return withDeprecationHeaders(
            NextResponse.json(ucpOrder),
            "/api/ucp/v1/orders/{orderId}"
        );
    } catch (error) {
        console.error("[UCP Orders GET] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
