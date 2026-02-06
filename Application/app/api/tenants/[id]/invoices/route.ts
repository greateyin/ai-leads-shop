import { NextRequest, NextResponse } from "next/server";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";

/**
 * GET /api/tenants/[id]/invoices
 * 取得租戶發票列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await authWithTenant({ requireTenant: false });
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "請先登入" },
        },
        { status: 401 }
      );
    }

    const { id: tenantId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");

    // 驗證使用者權限
    const userTenant = await db.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId,
        },
      },
    });

    if (!userTenant || !["OWNER", "ADMIN"].includes(userTenant.role)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "無權限查看發票" },
        },
        { status: 403 }
      );
    }

    // 構建查詢條件
    const where = {
      tenantId,
      ...(status && { status: status as "DRAFT" | "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" }),
    };

    // 取得發票列表
    const [invoices, total] = await Promise.all([
      db.tenantInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.tenantInvoice.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: invoices.map((inv) => ({
          id: inv.id,
          invoiceNo: inv.invoiceNo,
          amount: inv.amount,
          currency: inv.currency,
          status: inv.status,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          dueDate: inv.dueDate,
          paidAt: inv.paidAt,
          invoiceUrl: inv.invoiceUrl,
          createdAt: inv.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get invoices error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得發票列表失敗" },
      },
      { status: 500 }
    );
  }
}
