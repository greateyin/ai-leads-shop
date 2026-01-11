import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/auth/verify
 * 驗證電子郵件（透過 token）
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get("token");

        if (!token) {
            return NextResponse.redirect(new URL("/login?error=InvalidToken", request.url));
        }

        // 查找驗證 token
        const verificationToken = await db.verificationToken.findFirst({
            where: { token },
        });

        if (!verificationToken) {
            return NextResponse.redirect(new URL("/login?error=InvalidToken", request.url));
        }

        // 檢查是否過期
        if (verificationToken.expires < new Date()) {
            // 刪除過期 token
            await db.verificationToken.delete({
                where: {
                    identifier_token: {
                        identifier: verificationToken.identifier,
                        token: verificationToken.token,
                    },
                },
            });
            return NextResponse.redirect(new URL("/login?error=TokenExpired", request.url));
        }

        // 更新用戶 emailVerified
        const user = await db.user.findUnique({
            where: { email: verificationToken.identifier },
        });

        if (!user) {
            return NextResponse.redirect(new URL("/login?error=UserNotFound", request.url));
        }

        // 設定 emailVerified
        await db.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
        });

        // 刪除已使用的 token
        await db.verificationToken.delete({
            where: {
                identifier_token: {
                    identifier: verificationToken.identifier,
                    token: verificationToken.token,
                },
            },
        });

        // 重定向到成功頁面
        return NextResponse.redirect(new URL("/login?verified=true", request.url));
    } catch (error) {
        console.error("[Auth] verify 錯誤:", error);
        return NextResponse.redirect(new URL("/login?error=VerificationFailed", request.url));
    }
}
