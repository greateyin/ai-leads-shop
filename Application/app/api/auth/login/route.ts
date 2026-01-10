import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth";

/**
 * 登入請求驗證 Schema
 */
const loginSchema = z.object({
  email: z.string().email("請輸入有效的電子郵件"),
  password: z.string().min(1, "請輸入密碼"),
});

/**
 * POST /api/auth/login
 * 處理使用者登入
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "驗證失敗",
            details: validation.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // 查詢使用者
    const user = await db.user.findUnique({
      where: { email },
      include: {
        tenant: true,
        userTenants: {
          include: { tenant: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "電子郵件或密碼錯誤",
          },
        },
        { status: 401 }
      );
    }

    // 驗證密碼
    if (!user.passwordHash) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "此帳號使用第三方登入，請使用對應的登入方式",
          },
        },
        { status: 401 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "電子郵件或密碼錯誤",
          },
        },
        { status: 401 }
      );
    }

    // 使用 Auth.js signIn
    try {
      await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
    } catch {
      // signIn 可能會 throw，這裡處理
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
        tenants: user.userTenants.map((ut) => ({
          id: ut.tenant.id,
          name: ut.tenant.name,
          role: ut.role,
          isDefault: ut.isDefault,
        })),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "登入處理失敗",
        },
      },
      { status: 500 }
    );
  }
}
