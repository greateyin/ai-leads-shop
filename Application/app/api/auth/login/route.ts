import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";

/**
 * UserTenant 型別定義
 */
interface UserTenantWithTenant {
  id: string;
  role: string;
  isDefault: boolean;
  tenant: {
    id: string;
    name: string;
  };
}

/**
 * 登入請求驗證 Schema
 */
const loginSchema = z.object({
  email: z.string().email("請輸入有效的電子郵件"),
  password: z.string().min(1, "請輸入密碼"),
});

/**
 * POST /api/auth/login
 * 處理使用者登入並設定 session cookie
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
      include: { tenant: true },
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

    // 查詢用戶的租戶列表
    const userTenants = await db.userTenant.findMany({
      where: { userId: user.id },
      include: { tenant: true },
    });

    // 取得預設租戶
    const defaultTenant = userTenants.find((ut: UserTenantWithTenant) => ut.isDefault) || userTenants[0];

    // 建立 JWT token payload
    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId || "",
      activeTenantId: defaultTenant?.tenant?.id || user.tenantId || "",
      activeTenantRole: defaultTenant?.role || user.role,
    };

    // 編碼 JWT
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET is not configured");
    }

    // Auth.js v5 使用 salt 參數
    const salt = process.env.NODE_ENV === "production" 
      ? "__Secure-authjs.session-token" 
      : "authjs.session-token";

    const token = await encode({
      token: tokenPayload,
      secret,
      salt,
      maxAge: 30 * 24 * 60 * 60, // 30 天
    });

    // 設定 session cookie
    const cookieStore = await cookies();
    
    cookieStore.set(salt, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 天
    });

    // 返回用戶資料
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
        tenants: userTenants.map((ut: UserTenantWithTenant) => ({
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
