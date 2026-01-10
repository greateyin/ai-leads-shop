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
 * @deprecated 使用 createTenantPrisma 取代
 */
export function withTenantFilter(tenantId: string) {
  return {
    where: {
      tenantId,
    },
  };
}

/**
 * 需要 tenant 過濾的模型列表
 * 這些模型都包含 tenantId 欄位
 * 
 * 排除項目：
 * - Tenant: 沒有 tenantId 欄位（自身為租戶）
 * - Account, Session, VerificationToken, ResetToken: Auth.js 管理，不含 tenantId
 * - FeatureFlag: tenantId 可空（支援全域旗標）
 */
const TENANT_MODELS = [
  // 核心模型
  "User",
  "UserTenant",
  "Shop",
  // 商品相關
  "ProductCategory",
  "ProductCategoryAssignment",
  "Product",
  "ProductVariant",
  "ProductAsset",
  // 購物車與訂單
  "Cart",
  "CartItem",
  "Order",
  "OrderItem",
  "Address",
  // 金流
  "PaymentProvider",
  "Payment",
  "PaymentNotification",
  "PaymentRefund",
  // 物流
  "ShippingProvider",
  "ShippingMethod",
  "ShippingOrder",
  // 部落格
  "BlogPost",
  "BlogCategory",
  "BlogTag",
  "BlogCategoryAssignment",
  "BlogTagAssignment",
  // AI 與分析
  "AiInteraction",
  "AiAttribution",
  "AnalyticsEvent",
  // 計費與帳務
  "TenantBillingAccount",
  "TenantInvoice",
  "TenantUsageMetric",
  "TenantApiLimit",
  // 稽核與追蹤
  "AuditLog",
  "TrackingSettings",
] as const;

type TenantModel = (typeof TENANT_MODELS)[number];

/**
 * 建立具有租戶過濾功能的 Prisma 客戶端
 * 自動在所有查詢中注入 tenantId 過濾
 * 
 * @example
 * ```typescript
 * const tenantDb = createTenantPrisma("tenant-id-123");
 * const products = await tenantDb.product.findMany(); // 自動過濾 tenantId
 * ```
 */
export function createTenantPrisma(tenantId: string) {
  return db.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        // 檢查是否為需要 tenant 過濾的模型
        if (!model || !TENANT_MODELS.includes(model as TenantModel)) {
          return query(args);
        }

        // 讀取操作：自動添加 tenantId 過濾條件
        const readOperations = [
          "findMany",
          "findFirst",
          "findUnique",
          "findFirstOrThrow",
          "findUniqueOrThrow",
          "count",
          "aggregate",
          "groupBy",
        ];

        if (readOperations.includes(operation)) {
          args.where = { ...args.where, tenantId };
        }

        // 更新/刪除操作：確保只能操作自己租戶的資料
        const writeOperations = ["update", "updateMany", "delete", "deleteMany"];

        if (writeOperations.includes(operation)) {
          args.where = { ...args.where, tenantId };
        }

        // 建立操作：自動注入 tenantId
        if (operation === "create") {
          args.data = { ...args.data, tenantId };
        }

        if (operation === "createMany") {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((item: Record<string, unknown>) => ({
              ...item,
              tenantId,
            }));
          }
        }

        // upsert 操作：同時處理 create 和 update
        if (operation === "upsert") {
          args.where = { ...args.where, tenantId };
          args.create = { ...args.create, tenantId };
          args.update = { ...args.update };
        }

        return query(args);
      },
    },
  });
}

/**
 * 類型：租戶感知的 Prisma 客戶端
 */
export type TenantPrismaClient = ReturnType<typeof createTenantPrisma>;
