import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";

/**
 * 忘記密碼請求驗證 Schema
 */
const forgotPasswordSchema = z.object({
  email: z.string().email("請輸入有效的電子郵件"),
});

/**
 * POST /api/auth/forgot-password
 * 處理忘記密碼請求，發送重設密碼郵件
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = forgotPasswordSchema.safeParse(body);

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

    const { email } = validation.data;

    // 查詢使用者
    const user = await db.user.findUnique({
      where: { email },
    });

    // 即使使用者不存在，也回傳成功以防止列舉攻擊
    if (!user) {
      return NextResponse.json({
        success: true,
        data: {
          message: "如果此電子郵件已註冊，您將收到重設密碼的郵件",
        },
      });
    }

    // 刪除舊的重設 token
    await db.resetToken.deleteMany({
      where: { userId: user.id },
    });

    // 產生新的重設 token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 小時後過期

    await db.resetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // TODO: 發送重設密碼郵件
    // 在實際環境中，這裡應該呼叫郵件服務發送包含 token 的重設連結
    // 例如: await sendResetPasswordEmail(email, token);
    console.log(`[DEV] Reset token for ${email}: ${token}`);

    return NextResponse.json({
      success: true,
      data: {
        message: "如果此電子郵件已註冊，您將收到重設密碼的郵件",
      },
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "處理請求失敗",
        },
      },
      { status: 500 }
    );
  }
}
