import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { sendVerificationEmail } from "@/lib/email";

/**
 * 重新發送驗證郵件 Schema
 */
const resendSchema = z.object({
    email: z.string().email("請輸入有效的電子郵件"),
});

/**
 * POST /api/auth/resend-verification
 * 重新發送驗證郵件
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validation = resendSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "請提供有效的電子郵件",
                    },
                },
                { status: 400 }
            );
        }

        const { email } = validation.data;

        // 查找用戶
        const user = await db.user.findUnique({
            where: { email },
            select: { id: true, name: true, emailVerified: true },
        });

        if (!user) {
            // 安全考量：不透露用戶是否存在
            return NextResponse.json({
                success: true,
                message: "如果該郵件已註冊，您將收到驗證郵件",
            });
        }

        if (user.emailVerified) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "ALREADY_VERIFIED",
                        message: "此電子郵件已驗證",
                    },
                },
                { status: 400 }
            );
        }

        // 刪除舊的驗證 token
        await db.verificationToken.deleteMany({
            where: { identifier: email },
        });

        // 產生新的驗證 token
        const token = generateId();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小時

        await db.verificationToken.create({
            data: {
                identifier: email,
                token,
                expires,
            },
        });

        // 發送驗證郵件
        const result = await sendVerificationEmail(email, token, user.name || undefined);

        if (!result.success) {
            console.error("[Auth] 發送驗證郵件失敗:", result.error);
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "EMAIL_SEND_FAILED",
                        message: "發送驗證郵件失敗，請稍後再試",
                    },
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "驗證郵件已發送，請檢查您的信箱",
        });
    } catch (error) {
        console.error("[Auth] resend-verification 錯誤:", error);
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "系統錯誤，請稍後再試",
                },
            },
            { status: 500 }
        );
    }
}
