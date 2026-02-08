import { db } from "@/lib/db";
import { PaymentProviderType } from "@prisma/client";

/**
 * 付款表單資料（結構化，供前端渲染 auto-submit form）
 */
export interface PaymentFormData {
  /** 表單送出目標 URL（金流閘道） */
  actionUrl: string;
  /** 表單 hidden fields（key-value） */
  fields: Record<string, string>;
  /** 金流供應商 */
  provider: PaymentProviderType;
}

/**
 * Stripe 付款資料
 */
export interface StripePaymentData {
  /** Stripe client secret for Payment Element */
  clientSecret: string;
  /** Stripe publishable key */
  publishableKey: string;
  provider: "STRIPE";
}

/** 統一付款動作回傳型別 */
export type PaymentAction =
  | { type: "form_redirect"; data: PaymentFormData }
  | { type: "stripe"; data: StripePaymentData }
  | { type: "none" };

/**
 * 取得租戶的預設（或第一個可用）金流供應商
 * @param tenantId - 租戶 ID
 * @returns 金流供應商記錄，包含 id、type、config
 */
export async function getDefaultProvider(tenantId: string) {
  // 優先找 isDefault = true 的
  const provider = await db.paymentProvider.findFirst({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, type: true, config: true, name: true },
  });

  return provider;
}

/**
 * 取得指定供應商的配置
 * @param tenantId - 租戶 ID
 * @param providerType - 金流供應商類型
 * @returns 金流配置 JSON
 */
export async function getProviderConfig(
    tenantId: string,
    providerType: PaymentProviderType
): Promise<Record<string, string> | null> {
    const provider = await db.paymentProvider.findFirst({
        where: {
            tenantId,
            type: providerType,
        },
        select: { config: true },
    });

    if (!provider?.config) {
        return null;
    }

    return provider.config as Record<string, string>;
}
