import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

/**
 * 重設密碼請求驗證 Schema
 */
const resetPasswordSchema = z.object({
  token: z.string().min(1, "重設 Token 為必填"),
  password: z
    .string()
    .min(8, "密碼至少 8 個字元")
    .regex(/[A-Z]/, "密碼需包含至少一個大寫字母")
    .regex(/[a-z]/, "密碼需包含至少一個小寫字母")
    .regex(/[0-9]/, "密碼需包含至少一個數字"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "確認密碼不一致",
  path: ["confirmPassword"],
});

/**
 * POST /api/auth/reset-password
 * 處理密碼重設
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = resetPasswordSchema.safeParse(body);

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

    const { token, password } = validation.data;

    // 查詢重設 token
    const resetToken = await db.resetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "重設連結無效或已過期",
          },
        },
        { status: 400 }
      );
    }

    // 檢查 token 是否過期
    if (resetToken.expiresAt < new Date()) {
      // 刪除過期的 token
      await db.resetToken.delete({
        where: { id: resetToken.id },
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TOKEN_EXPIRED",
            message: "重設連結已過期，請重新申請",
          },
        },
        { status: 400 }
      );
    }

    // 雜湊新密碼
    const passwordHash = await bcrypt.hash(password, 12);

    // 更新使用者密碼並刪除 token
    await db.$transaction([
      db.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      db.resetToken.delete({
        where: { id: resetToken.id },
      }),
    ]);

    // 記錄稽核日誌
    await db.auditLog.create({
      data: {
        tenantId: resetToken.user.tenantId || "system",
        userId: resetToken.userId,
        action: "PASSWORD_RESET",
        entityType: "User",
        entityId: resetToken.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: "密碼已成功重設，請使用新密碼登入",
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "重設密碼失敗",
        },
      },
      { status: 500 }
    );
  }
}
