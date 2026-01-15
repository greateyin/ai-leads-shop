import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 訂單更新 Schema
 */
const updateOrderSchema = z.object({
  status: z
    .enum(["PENDING", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED", "REFUNDING"])
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

    // 狀態機驗證 (FSM Logic)
    // Prisma OrderStatus: PENDING, PAID, PROCESSING, SHIPPED, COMPLETED, CANCELLED, REFUNDING
    if (validation.data.status && validation.data.status !== order.status) {
      // 權限檢查：只有 STAFF 或 OWNER 可以變更訂單狀態 (Spec)
      const userTenant = await db.userTenant.findUnique({
        where: { userId_tenantId: { userId: session.user.id, tenantId: session.user.tenantId } },
      });
      // 假設 session.user.role 已經是 OWNER，或 userTenant.role 是 STAFF/ADMIN
      // 這裡簡化檢查：若 user 是 OWNER (session) 或有 userTenant 關聯 (STAFF)
      // 注意：session.user.role 是全域角色 (OWNER, CUSTOMER)，UserTenant 是租戶內角色
      // 這裡依賴 session 檢查：
      const isOwner = session.user.role === "OWNER";
      const isStaff = userTenant?.role === "STAFF" || userTenant?.role === "ADMIN";

      if (!isOwner && !isStaff) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "您沒有權限變更訂單狀態" } },
          { status: 403 }
        );
      }

      const validTransitions: Record<string, string[]> = {
        PENDING: ["PAID", "CANCELLED"],
        PAID: ["PROCESSING", "REFUNDING", "CANCELLED"],
        PROCESSING: ["SHIPPED", "REFUNDING"],
        SHIPPED: ["COMPLETED", "REFUNDING"], // RETURNED is in shippingStatus, not orderStatus
        COMPLETED: ["REFUNDING"],
        CANCELLED: [],
        REFUNDING: [], // REFUNDING 只能轉為成功退款 (通常由 webhook 觸發 paymentStatus change，orderStatus 可能維持 REFUNDING 或變更，這裡暫不處理)
      };

      const allowedComponents = validTransitions[order.status] || [];
      if (!allowedComponents.includes(validation.data.status)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_STATE_TRANSITION",
              message: `訂單狀態無法從 ${order.status} 變更為 ${validation.data.status}`,
            },
          },
          { status: 400 }
        );
      }
    }

    // ShippingStatus 狀態機驗證 (Spec Section 5 DTO)
    // ShippingStatus: PENDING → PREPARING → DELIVERING → DELIVERED, RETURNED allowed from DELIVERING/DELIVERED
    if (validation.data.shippingStatus && validation.data.shippingStatus !== order.shippingStatus) {
      const validShippingTransitions: Record<string, string[]> = {
        PENDING: ["PREPARING"],
        PREPARING: ["DELIVERING"],
        DELIVERING: ["DELIVERED", "RETURNED"],
        DELIVERED: ["RETURNED"],
        RETURNED: [],
      };

      const allowedShippingStates = validShippingTransitions[order.shippingStatus] || [];
      if (!allowedShippingStates.includes(validation.data.shippingStatus)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_STATE_TRANSITION",
              message: `物流狀態無法從 ${order.shippingStatus} 變更為 ${validation.data.shippingStatus}`,
            },
          },
          { status: 400 }
        );
      }
    }

    const updatedOrder = await db.order.update({
      where: { id, tenantId: session.user.tenantId },
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
        id: generateId(),
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
