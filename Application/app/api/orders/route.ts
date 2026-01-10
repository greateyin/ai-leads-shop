import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateOrderNo } from "@/lib/utils";
import { generateId } from "@/lib/id";

/**
 * 訂單建立 Schema
 */
const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      variantId: z.string().optional(),
      quantity: z.number().int().min(1),
    })
  ),
  shippingAddressId: z.string().optional(),
  shippingAddress: z
    .object({
      contactName: z.string(),
      phone: z.string(),
      city: z.string(),
      postalCode: z.string(),
      addressLine1: z.string(),
      addressLine2: z.string().optional(),
    })
    .optional(),
  paymentProvider: z.enum(["ECPAY", "NEWEBPAY", "STRIPE"]).optional(),
});

/**
 * GET /api/orders
 * 取得訂單列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const orderNo = searchParams.get("orderNo");

    const where = {
      tenantId: session.user.tenantId,
      ...(status && { status: status as never }),
      ...(orderNo && { orderNo: { contains: orderNo } }),
    };

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { product: true } },
          addresses: true,
          payments: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      db.order.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: orders,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("取得訂單列表錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得訂單列表失敗" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orders
 * 建立新訂單
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = createOrderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
        },
        { status: 400 }
      );
    }

    const { items, shippingAddress } = validation.data;

    // 取得商店
    const shop = await db.shop.findFirst({
      where: { tenantId: session.user.tenantId },
    });

    if (!shop) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到商店" } },
        { status: 404 }
      );
    }

    // 取得商品資訊並計算金額
    const productIds = items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds }, tenantId: session.user.tenantId },
      include: { variants: true },
    });

    let totalAmount = 0;
    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error(`商品 ${item.productId} 不存在`);

      const variant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId)
        : null;

      const unitPrice = variant ? Number(variant.price) : Number(product.price);
      const subtotal = unitPrice * item.quantity;
      totalAmount += subtotal;

      return {
        id: generateId(),
        tenantId: session.user.tenantId,
        productId: product.id,
        variantId: item.variantId,
        name: product.name,
        sku: variant?.sku || product.sku,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      };
    });

    // 建立訂單
    const order = await db.order.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        shopId: shop.id,
        userId: session.user.id,
        orderNo: generateOrderNo(),
        totalAmount,
        currency: shop.currency,
        items: { create: orderItems },
        ...(shippingAddress && {
          addresses: {
            create: {
              id: generateId(),
              tenantId: session.user.tenantId,
              userId: session.user.id,
              type: "SHIPPING",
              ...shippingAddress,
              country: "TW",
            },
          },
        }),
      },
      include: {
        items: true,
        addresses: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: order,
      message: "訂單建立成功",
    });
  } catch (error) {
    console.error("建立訂單錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立訂單失敗" } },
      { status: 500 }
    );
  }
}
