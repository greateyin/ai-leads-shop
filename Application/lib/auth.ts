import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Line from "next-auth/providers/line";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// 動態取得環境變數
const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;
const facebookClientId = process.env.AUTH_FACEBOOK_ID;
const facebookClientSecret = process.env.AUTH_FACEBOOK_SECRET;
const lineClientId = process.env.AUTH_LINE_ID;
const lineClientSecret = process.env.AUTH_LINE_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

/**
 * Auth.js v5 配置
 * 支援 Google、Facebook、LINE OAuth、Resend Magic Link 與 Email/Password 登入
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db) as Adapter,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/auth/verify-request", // Magic link 驗證頁
  },
  providers: [
    // Google OAuth (僅當環境變數存在時啟用)
    ...(googleClientId && googleClientSecret
      ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
      : []),
    // Facebook OAuth
    ...(facebookClientId && facebookClientSecret
      ? [
        Facebook({
          clientId: facebookClientId,
          clientSecret: facebookClientSecret,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
      : []),
    // LINE OAuth
    ...(lineClientId && lineClientSecret
      ? [
        Line({
          clientId: lineClientId,
          clientSecret: lineClientSecret,
        }),
      ]
      : []),
    // Resend Magic Link
    ...(resendApiKey
      ? [
        Resend({
          apiKey: resendApiKey,
          from: resendFromEmail,
        }),
      ]
      : []),
    /** Email/Password 認證 */
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
          include: { tenant: true },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId || "",
        };
      },
    }),
  ],
  callbacks: {
    /**
     * JWT Callback - 將用戶資訊寫入 token
     * 每次請求都會執行，從 DB 取得最新的 activeTenantId
     */
    async jwt({ token, user, trigger }) {
      // 初次登入時設定基本資訊
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role || "CUSTOMER";
        token.tenantId = (user as { tenantId?: string }).tenantId || "";
      }

      // 每次請求都從 DB 讀取最新的 activeTenantId
      // 這確保租戶切換後立即生效，且被移除成員無法繼續存取
      if (token.id) {
        try {
          const userTenant = await db.userTenant.findFirst({
            where: { userId: token.id as string, isDefault: true },
          });
          if (userTenant) {
            token.activeTenantId = userTenant.tenantId;
            token.activeTenantRole = userTenant.role;
          } else {
            // [安全] 無有效 userTenant 關聯 → 清空租戶存取權
            // 不可 fallback 到 user.tenantId，否則被移除的成員仍能存取
            token.activeTenantId = "";
            token.activeTenantRole = "CUSTOMER";
          }
        } catch {
          // [安全] DB 錯誤時拒絕租戶存取，避免授權漂移
          token.activeTenantId = "";
          token.activeTenantRole = "CUSTOMER";
        }
      }

      return token;
    },
    /**
     * Session Callback - 將 token 資訊寫入 session
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.activeTenantRole as string) || (token.role as string);
        session.user.tenantId = (token.activeTenantId as string) || (token.tenantId as string);
      }
      return session;
    },
    /**
     * SignIn Callback - OAuth 新用戶處理
     */
    async signIn({ user, account }) {
      // OAuth 登入時，確保用戶有預設角色
      if (account?.provider !== "credentials" && user.id) {
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true, tenantId: true },
        });
        if (dbUser) {
          (user as { role?: string }).role = dbUser.role;
          (user as { tenantId?: string }).tenantId = dbUser.tenantId || "";
        }
      }
      return true;
    },
  },
});

/**
 * 驗證密碼並回傳 hash
 * @param password - 明文密碼
 * @returns bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * 驗證密碼是否正確
 * @param password - 明文密碼
 * @param hash - bcrypt hash
 * @returns 是否匹配
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
