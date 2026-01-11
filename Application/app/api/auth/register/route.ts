import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { generateId } from "@/lib/id";

/**
 * 註冊請求 Schema
 */
const registerSchema = z.object({
  shopName: z.string().min(1, "商店名稱為必填"),
  email: z.string().email("請輸入有效的電子郵件"),
  password: z.string().min(8, "密碼至少需要 8 個字元"),
});

/**
 * POST /api/auth/register
 * 註冊新用戶與商店
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 驗證輸入
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: validation.error.errors[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { shopName, email, password } = validation.data;

    // 檢查 Email 是否已存在
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONFLICT",
            message: "此電子郵件已被註冊",
          },
        },
        { status: 409 }
      );
    }

    // 建立租戶、商店與用戶
    const passwordHash = await hashPassword(password);
    const shopSlug = slugify(shopName);

    const result = await db.$transaction(async (tx) => {
      // 建立租戶
      const tenant = await tx.tenant.create({
        data: {
          id: generateId(),
          name: shopName,
          subdomain: shopSlug + "-" + Date.now().toString(36),
          plan: "SEED",
        },
      });

      // 建立用戶
      const user = await tx.user.create({
        data: {
          id: generateId(),
          email,
          passwordHash,
          name: shopName,
          role: "OWNER",
          tenantId: tenant.id,
        },
      });

      // 建立商店
      const shop = await tx.shop.create({
        data: {
          id: generateId(),
          tenantId: tenant.id,
          ownerId: user.id,
          name: shopName,
          slug: shopSlug + "-" + Date.now().toString(36),
        },
      });

      return { userId: user.id, tenantId: tenant.id, shopId: shop.id, userName: user.name, userEmail: email };
    });

    // 發送驗證郵件
    try {
      const { sendVerificationEmail } = await import("@/lib/email");

      // 產生驗證 token
      const verificationToken = generateId();
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小時

      await db.verificationToken.create({
        data: {
          identifier: email,
          token: verificationToken,
          expires,
        },
      });

      await sendVerificationEmail(email, verificationToken, result.userName || undefined);
    } catch (emailError) {
      // 郵件發送失敗不影響註冊流程
      console.error("[Register] 發送驗證郵件失敗:", emailError);
    }

    return NextResponse.json({
      success: true,
      data: { userId: result.userId, tenantId: result.tenantId, shopId: result.shopId },
      message: "註冊成功，請檢查您的信箱進行驗證",
    });
  } catch (error) {
    console.error("註冊錯誤:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "註冊失敗，請稍後再試",
        },
      },
      { status: 500 }
    );
  }
}
