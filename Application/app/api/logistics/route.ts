import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createLogisticsService } from "@/lib/logistics";
import { generateId } from "@/lib/id";

/**
 * 建立物流訂單 Schema
 */
const createLogisticsSchema = z.object({
  orderId: z.string(),
  providerId: z.string(),
  methodId: z.string(),
  receiver: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    zipCode: z.string().optional(),
    storeId: z.string().optional(),
    storeName: z.string().optional(),
  }),
});

/**
 * GET /api/logistics
 * 取得物流訂單列表
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
    const orderId = searchParams.get("orderId");
    const status = searchParams.get("status");

    const where = {
      tenantId: session.user.tenantId,
      ...(orderId && { orderId }),
      ...(status && { status: status as never }),
    };

    const [shippingOrders, total] = await Promise.all([
      db.shippingOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { id: true, orderNo: true } },
          provider: true,
          method: true,
        },
      }),
      db.shippingOrder.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: shippingOrders,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("取得物流訂單錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得物流訂單失敗" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/logistics
 * 建立物流訂單
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
    const validation = createLogisticsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
        },
        { status: 400 }
      );
    }

    const { orderId, providerId, methodId, receiver } = validation.data;

    // 取得訂單
    const order = await db.order.findFirst({
      where: { id: orderId, tenantId: session.user.tenantId },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到訂單" } },
        { status: 404 }
      );
    }

    // 取得物流供應商設定
    const provider = await db.shippingProvider.findFirst({
      where: { id: providerId, tenantId: session.user.tenantId },
    });

    const method = await db.shippingMethod.findFirst({
      where: { id: methodId },
    });

    if (!provider || !method) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到物流供應商" } },
        { status: 404 }
      );
    }

    // 呼叫物流 API
    const logisticsService = createLogisticsService(
      provider.code as "ECPAY" | "SF_EXPRESS",
      provider.config as Record<string, string>
    );

    const logisticsResult = await logisticsService.createOrder({
      orderId: order.id,
      orderNo: order.orderNo,
      provider: provider.code as "ECPAY" | "SF_EXPRESS",
      shippingType: method.type as "HOME" | "CVS_PICKUP",
      receiver,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
      })),
      totalAmount: Number(order.totalAmount),
    });

    if (!logisticsResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: logisticsResult.error } },
        { status: 500 }
      );
    }

    // 建立物流訂單記錄
    const shippingOrder = await db.shippingOrder.create({
      data: {
        id: generateId(),
        tenantId: session.user.tenantId,
        orderId,
        providerId,
        methodId,
        trackingNumber: logisticsResult.trackingNumber,
        labelUrl: logisticsResult.labelUrl,
        status: "CREATED",
      },
      include: {
        provider: true,
        method: true,
      },
    });

    // 更新訂單狀態
    await db.order.update({
      where: { id: orderId },
      data: { shippingStatus: "PREPARING" },
    });

    return NextResponse.json({
      success: true,
      data: shippingOrder,
      message: "物流訂單建立成功",
    });
  } catch (error) {
    console.error("建立物流訂單錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "建立物流訂單失敗" } },
      { status: 500 }
    );
  }
}
