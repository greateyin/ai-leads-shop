import { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";

/**
 * Auth.js 型別擴展
 * 擴展 Session 與 JWT 以包含自定義欄位
 */
declare module "next-auth" {
  interface Session {
    user: {
      /** 用戶 ID */
      id: string;
      /** 當前租戶角色（來自 activeTenantRole 或 role） */
      role: string;
      /** 當前活動租戶 ID（來自 activeTenantId 或 tenantId） */
      tenantId: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: string;
    tenantId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    /** 用戶 ID */
    id: string;
    /** 用戶原始角色 */
    role: string;
    /** 用戶原始租戶 ID */
    tenantId: string;
    /** 當前活動租戶 ID（多租戶切換用） */
    activeTenantId?: string;
    /** 當前活動租戶角色（多租戶切換用） */
    activeTenantRole?: string;
  }
}
