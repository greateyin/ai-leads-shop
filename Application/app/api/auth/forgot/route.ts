import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

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
    // IP-based 速率限制
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    const { checkRateLimit, AUTH_RATE_LIMITS, createRateLimitResponse } = await import("@/lib/auth-rate-limit");
    const rateLimitResult = checkRateLimit(`forgot:${ip}`, AUTH_RATE_LIMITS.FORGOT_PASSWORD);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(createRateLimitResponse(rateLimitResult), { status: 429 });
    }

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
    // 對 token 進行 SHA-256 雜湊後儲存，原始 token 發送給使用者
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 小時後過期

    await db.resetToken.create({
      data: {
        id: generateId(),
        userId: user.id,
        token: tokenHash, // 儲存雜湊後的 token
        expiresAt,
      },
    });

    // 發送重設密碼郵件
    try {
      const { sendPasswordResetEmail } = await import("@/lib/email");
      const result = await sendPasswordResetEmail(email, token);
      if (!result.success) {
        console.error("[Auth] 發送重設密碼郵件失敗:", result.error);
      }
    } catch (emailError) {
      console.error("[Auth] 發送重設密碼郵件錯誤:", emailError);
      // 不影響主流程，繼續回傳成功訊息
    }

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
