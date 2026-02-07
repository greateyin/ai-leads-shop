import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";
import { generateOrderNo } from "@/lib/utils";
import { generateId } from "@/lib/id";
import { sendGuestOrderConfirmationEmail } from "@/lib/email";
import { withStaffAuth, type AuthenticatedSession } from "@/lib/api/with-auth";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant";

/**
 * 訂單建立 Schema
 * 支援登入用戶和訪客結帳 (Guest Checkout)
 */
const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      variantId: z.string().optional(),
      quantity: z.number().int().min(1),
    })
  ),
  // Guest checkout fields (required if not logged in)
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  guestName: z.string().optional(),
  // Shipping address
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
  // Shop ID for guest checkout (since we don't have session.user.tenantId)
  shopSlug: z.string().optional(),
  // UTM 行銷歸因欄位（由前端 checkout 附加）
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
});

/**
 * GET /api/orders
 * 取得訂單列表（需要 OWNER / ADMIN / STAFF 角色）
 */
export const GET = withStaffAuth(async (request: NextRequest, session: AuthenticatedSession) => {
  try {
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
});

/**
 * POST /api/orders
 * 建立新訂單 - 支援登入用戶和訪客結帳 (Guest Checkout)
 * 注意：此端點不使用 withAuth，因訪客結帳不需登入
 */
export async function POST(request: NextRequest) {
  try {
    const { session } = await authWithTenant({ requireTenant: false });
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

    const {
      items,
      shippingAddress,
      guestEmail,
      guestPhone,
      guestName,
      shopSlug,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
    } = validation.data;

    // Determine if this is a guest checkout or authenticated checkout
    // [安全] 判斷是否為訪客結帳：無 session 或無 tenantId
    const isGuestCheckout = !session?.user?.tenantId;

    // For guest checkout, we need either shopSlug or the shop context
    let shop;
    let tenantId: string;
    let userId: string | null = null;

    if (isGuestCheckout) {
      // Guest checkout - require guestEmail for order tracking
      if (!guestEmail) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_INPUT",
              message: "訪客結帳需要提供電子郵件",
            },
          },
          { status: 400 }
        );
      }

      // [安全] 從 request host 解析租戶，不信任 client 傳入的 shopSlug/productId
      const tenant = await resolveTenantFromRequest(request);

      if (!tenant) {
        // fail-closed：無法辨識租戶時拒絕下單
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "無法辨識商店來源" },
          },
          { status: 403 }
        );
      }

      tenantId = tenant.tenantId;

      // 以 host 解析的 tenantId 查詢商店（shopSlug 僅作為同租戶內的次要篩選）
      if (shopSlug) {
        shop = await db.shop.findFirst({
          where: { slug: shopSlug, tenantId },
          include: { tenant: true },
        });
      } else {
        shop = await db.shop.findFirst({
          where: { id: tenant.shopId },
          include: { tenant: true },
        });
      }

      if (!shop) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "找不到商店" },
          },
          { status: 404 }
        );
      }
    } else {
      // Authenticated checkout
      tenantId = session!.user.tenantId;
      userId = session!.user.id;

      shop = await db.shop.findFirst({
        where: { tenantId },
      });

      if (!shop) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "找不到商店" } },
          { status: 404 }
        );
      }
    }

    // 取得商品資訊並計算金額
    const productIds = items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        tenantId,
        status: "PUBLISHED", // Only allow orders for published products
      },
      include: { variants: true },
    });

    // Validate all products exist and are available
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `商品 ${item.productId} 不存在或未上架`,
            },
          },
          { status: 400 }
        );
      }
    }

    let totalAmount = 0;
    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;

      const variant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId)
        : null;

      const unitPrice = variant ? Number(variant.price) : Number(product.price);
      const subtotal = unitPrice * item.quantity;
      totalAmount += subtotal;

      return {
        id: generateId(),
        tenantId,
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
        tenantId,
        shopId: shop.id,
        userId, // null for guest checkout
        orderNo: generateOrderNo(),
        totalAmount,
        currency: shop.currency,
        // Store guest info + UTM 歸因資料 in metadata
        metadata: {
          ...(isGuestCheckout && {
            guestEmail,
            guestPhone: guestPhone || null,
            guestName: guestName || shippingAddress?.contactName || null,
          }),
          // UTM 行銷歸因（有任一欄位就寫入）
          ...(utmSource || utmMedium || utmCampaign || utmTerm || utmContent
            ? {
                utmSource: utmSource || null,
                utmMedium: utmMedium || null,
                utmCampaign: utmCampaign || null,
                utmTerm: utmTerm || null,
                utmContent: utmContent || null,
              }
            : {}),
        },
        items: { create: orderItems },
        ...(shippingAddress && {
          addresses: {
            create: {
              id: generateId(),
              tenantId,
              ...(userId && { userId }), // Only include userId if not null
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

    // 發送訪客訂單確認郵件 (非阻塞)
    if (isGuestCheckout && guestEmail) {
      sendGuestOrderConfirmationEmail({
        email: guestEmail,
        orderNo: order.orderNo,
        guestName: guestName || shippingAddress?.contactName,
        totalAmount,
        currency: shop.currency,
        items: orderItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.subtotal,
        })),
        shippingAddress: shippingAddress
          ? {
            contactName: shippingAddress.contactName,
            phone: shippingAddress.phone,
            city: shippingAddress.city,
            addressLine1: shippingAddress.addressLine1,
          }
          : undefined,
      }).catch((err) => {
        console.error("[Orders] 發送訂單確認郵件失敗:", err);
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...order,
        isGuestOrder: isGuestCheckout,
        guestEmail: isGuestCheckout ? guestEmail : undefined,
      },
      message: isGuestCheckout
        ? "訂單建立成功，請查收確認郵件"
        : "訂單建立成功",
    });
  } catch (error) {
    console.error("建立訂單錯誤:", error);
    // Return more detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : "建立訂單失敗";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: errorMessage } },
      { status: 500 }
    );
  }
}
