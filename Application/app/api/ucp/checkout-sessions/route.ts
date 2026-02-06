/**
 * UCP Checkout Sessions API
 * POST /api/ucp/checkout-sessions - 建立結帳 Session
 * GET /api/ucp/checkout-sessions?sessionId=xxx - 查詢 Session
 * 
 * 處理 UCP 結帳流程的核心邏輯
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { verifyUcpRequest, formatUcpError } from "@/lib/ucp/middleware";
import type {
    UcpCheckoutSession,
    UcpPaymentHandler,
    UcpMoney,
    UcpCartItem,
    UcpAddress,
} from "@/lib/ucp/types";

// ===========================================
// Schema 定義
// ===========================================

const addressSchema = z.object({
    name: z.string().optional(),
    addressLines: z.array(z.string()).min(1),
    locality: z.string(),
    administrativeArea: z.string().optional(),
    postalCode: z.string(),
    regionCode: z.string().default("TW"),
    phoneNumber: z.string().optional(),
});

const cartItemSchema = z.object({
    offerId: z.string().uuid(),
    quantity: z.number().int().min(1),
    price: z.object({
        value: z.number().int(),
        currency: z.string(),
    }).optional(),
});

const createCheckoutSchema = z.object({
    merchantId: z.string().uuid(),
    cart: z.object({
        items: z.array(cartItemSchema).min(1).max(100),
        currency: z.string().default("TWD"),
    }),
    shippingAddress: addressSchema.optional(),
    billingAddress: addressSchema.optional(),
    buyerEmail: z.string().email().optional(),
    buyerPhone: z.string().optional(),
    metadata: z.record(z.string()).optional(),
});

// ===========================================
// 輔助函數
// ===========================================

function toUcpMoney(amount: number, currency: string): UcpMoney {
    return {
        value: Math.round(amount * 100),
        currency: currency.toUpperCase(),
    };
}

function fromUcpMoney(money: UcpMoney): number {
    return money.value / 100;
}

function ucpAddressToInternal(addr: UcpAddress) {
    return {
        contactName: addr.name || "",
        phone: addr.phoneNumber || "",
        country: addr.regionCode,
        state: addr.administrativeArea || "",
        city: addr.locality,
        postalCode: addr.postalCode,
        addressLine1: addr.addressLines[0] || "",
        addressLine2: addr.addressLines.slice(1).join(", ") || undefined,
    };
}

/**
 * 根據商家配置取得可用的 Payment Handlers
 */
async function getPaymentHandlers(
    tenantId: string
): Promise<UcpPaymentHandler[]> {
    const handlers: UcpPaymentHandler[] = [];

    // 查詢已啟用的金流供應商
    const providers = await db.paymentProvider.findMany({
        where: { tenantId },
        select: { type: true, config: true, isDefault: true },
    });

    for (const provider of providers) {
        if (provider.type === "STRIPE") {
            handlers.push({
                id: "stripe",
                type: "CARD",
                name: "Credit/Debit Card",
                supportedNetworks: ["VISA", "MASTERCARD", "JCB", "AMEX"],
            });
        } else if (provider.type === "PAYPAL") {
            handlers.push({
                id: "paypal",
                type: "WALLET",
                name: "PayPal",
            });
        }
    }

    // 如果沒有配置任何金流，預設使用 Stripe
    if (handlers.length === 0) {
        handlers.push({
            id: "stripe",
            type: "CARD",
            name: "Credit/Debit Card",
            supportedNetworks: ["VISA", "MASTERCARD", "JCB", "AMEX"],
        });
    }

    return handlers;
}

// ===========================================
// POST: 建立結帳 Session
// ===========================================

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validation = createCheckoutSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Invalid request format", {
                    details: validation.error.flatten(),
                }),
                { status: 400 }
            );
        }

        const { merchantId, cart, shippingAddress, billingAddress, buyerEmail, metadata } =
            validation.data;

        // [安全] 驗證請求 — 不允許繞過驗證的 fallback
        const authResult = await verifyUcpRequest(request);
        if (!authResult.success) {
            return NextResponse.json(
                formatUcpError("UNAUTHORIZED", authResult.error || "Authentication failed"),
                { status: 401 }
            );
        }

        const { tenantId, shopId } = authResult.context!;

        // 取得商店幣別
        const shop = await db.shop.findFirst({
            where: { id: shopId },
            select: { currency: true },
        });
        const currency = shop?.currency || cart.currency;

        // 驗證所有商品並計算價格
        const productIds = cart.items.map((item) => item.offerId);
        const products = await db.product.findMany({
            where: {
                id: { in: productIds },
                shopId,
                status: "PUBLISHED",
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                price: true,
                stock: true,
            },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));

        // 驗證庫存並計算小計
        const validatedItems: UcpCartItem[] = [];
        let subtotal = 0;

        for (const item of cart.items) {
            const product = productMap.get(item.offerId);
            if (!product) {
                return NextResponse.json(
                    formatUcpError("NOT_FOUND", `Product ${item.offerId} not found`),
                    { status: 404 }
                );
            }

            if (product.stock < item.quantity) {
                return NextResponse.json(
                    formatUcpError("INSUFFICIENT_STOCK", `Insufficient stock for ${product.name}`, {
                        offerId: item.offerId,
                        requested: item.quantity,
                        available: product.stock,
                    }),
                    { status: 400 }
                );
            }

            const unitPrice = Number(product.price);
            const itemPrice = toUcpMoney(unitPrice, currency);
            subtotal += unitPrice * item.quantity;

            validatedItems.push({
                offerId: item.offerId,
                quantity: item.quantity,
                price: itemPrice,
            });
        }

        // 計算運費（可擴展為動態計算）
        const shippingFee = shippingAddress ? 60 : 0; // 預設運費 60 元
        const tax = 0; // 台灣內含稅，不另計
        const total = subtotal + shippingFee + tax;

        // 取得 Payment Handlers
        const paymentHandlers = await getPaymentHandlers(tenantId);

        // 建立 Session（使用記憶體暫存，未來可改用資料庫）
        // 由於尚未新增資料庫表，先使用簡化版本
        const sessionId = generateId();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 分鐘後過期

        // 建構回應
        const session: UcpCheckoutSession = {
            id: sessionId,
            merchantId,
            status: "PENDING",
            cart: {
                items: validatedItems,
                subtotal: toUcpMoney(subtotal, currency),
                shippingFee: shippingFee > 0 ? toUcpMoney(shippingFee, currency) : undefined,
                tax: tax > 0 ? toUcpMoney(tax, currency) : undefined,
                total: toUcpMoney(total, currency),
            },
            shippingAddress,
            billingAddress,
            paymentHandlers,
            expiresAt: expiresAt.toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // 儲存 Session 資料到資料庫
        await db.ucpCheckoutSession.create({
            data: {
                id: sessionId,
                tenantId,
                shopId,
                platformId: authResult.context?.platformId || "google",
                status: "PENDING",
                cartData: JSON.parse(JSON.stringify(session.cart)),
                shippingAddress: shippingAddress ? JSON.parse(JSON.stringify(shippingAddress)) : undefined,
                billingAddress: billingAddress ? JSON.parse(JSON.stringify(billingAddress)) : undefined,
                paymentHandlers: JSON.parse(JSON.stringify(paymentHandlers)),
                buyerEmail,
                metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
                expiresAt,
            },
        });

        return NextResponse.json(session, { status: 201 });
    } catch (error) {
        console.error("[UCP Checkout] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}

// ===========================================
// GET: 查詢 Session 狀態
// ===========================================

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get("sessionId");
        const merchantId = searchParams.get("merchantId");

        if (!sessionId || !merchantId) {
            return NextResponse.json(
                formatUcpError("INVALID_REQUEST", "Missing sessionId or merchantId"),
                { status: 400 }
            );
        }

        // 從資料庫取得 Session
        const dbSession = await db.ucpCheckoutSession.findFirst({
            where: {
                id: sessionId,
                shopId: merchantId,
            },
        });

        if (!dbSession) {
            return NextResponse.json(
                formatUcpError("NOT_FOUND", "Session not found"),
                { status: 404 }
            );
        }


        const cartData = dbSession.cartData as unknown as UcpCheckoutSession["cart"];
        const paymentHandlers = dbSession.paymentHandlers as unknown as UcpPaymentHandler[];

        // 檢查是否過期
        const isExpired = dbSession.expiresAt < new Date();
        const status = isExpired ? "EXPIRED" : dbSession.status;

        const session: UcpCheckoutSession = {
            id: dbSession.id,
            merchantId,
            status: status as UcpCheckoutSession["status"],
            cart: cartData,
            shippingAddress: dbSession.shippingAddress as unknown as UcpAddress | undefined,
            billingAddress: dbSession.billingAddress as unknown as UcpAddress | undefined,
            paymentHandlers,
            expiresAt: dbSession.expiresAt.toISOString(),
            createdAt: dbSession.createdAt.toISOString(),
            updatedAt: dbSession.updatedAt.toISOString(),
            orderId: dbSession.orderId || undefined,
        };

        return NextResponse.json(session);
    } catch (error) {
        console.error("[UCP Checkout GET] Error:", error);
        return NextResponse.json(
            formatUcpError("INTERNAL_ERROR", "Internal server error"),
            { status: 500 }
        );
    }
}
