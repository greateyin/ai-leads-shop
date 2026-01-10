import { PrismaClient } from "@prisma/client";

/**
 * 全域 Prisma Client 實例
 * 使用單例模式避免開發環境中建立過多連線
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/**
 * 根據 tenantId 過濾資料的中間件
 * 用於多租戶資料隔離
 */
export function withTenantFilter(tenantId: string) {
  return {
    where: {
      tenantId,
    },
  };
}
