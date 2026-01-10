import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 訂單更新 Schema
 */
const updateOrderSchema = z.object({
  status: z
    .enum(["PENDING", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"])
    .optional(),
  shippingStatus: z
    .enum(["PENDING", "PREPARING", "DELIVERING", "DELIVERED", "RETURNED"])
    .optional(),
});

/**
 * GET /api/orders/[id]
 * 取得單一訂單詳情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const order = await db.order.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, coverImageUrl: true } },
            variant: true,
          },
        },
        addresses: true,
        payments: true,
        shippingOrders: {
          include: { provider: true, method: true },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到訂單" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("取得訂單詳情錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "取得訂單失敗" } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/orders/[id]
 * 更新訂單狀態
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateOrderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
        },
        { status: 400 }
      );
    }

    const order = await db.order.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "找不到訂單" } },
        { status: 404 }
      );
    }

    const updatedOrder = await db.order.update({
      where: { id },
      data: validation.data,
      include: {
        items: true,
        addresses: true,
        payments: true,
      },
    });

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "UPDATE_ORDER",
        entityType: "Order",
        entityId: id,
        oldValue: { status: order.status, shippingStatus: order.shippingStatus },
        newValue: validation.data,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedOrder,
      message: "訂單更新成功",
    });
  } catch (error) {
    console.error("更新訂單錯誤:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新訂單失敗" } },
      { status: 500 }
    );
  }
}
