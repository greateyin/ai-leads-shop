/**
 * Seed script: 為目標 tenant 建立預設金流供應商
 *
 * 用法：
 *   npx tsx prisma/seed-payment-provider.ts
 *
 * 環境變數（可在 .env.local 設定）：
 *   NEWEBPAY_MERCHANT_ID, NEWEBPAY_HASH_KEY, NEWEBPAY_HASH_IV
 *   ECPAY_MERCHANT_ID, ECPAY_HASH_KEY, ECPAY_HASH_IV
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *
 * 若未設定環境變數，會使用 placeholder 值（需手動替換）
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import crypto from "crypto";
import { PrismaClient, PaymentProviderType } from "@prisma/client";

const db = new PrismaClient();

/** 支援的金流類型及其對應 env prefix */
const PROVIDER_CONFIGS: Record<
  string,
  { type: PaymentProviderType; name: string; envKeys: string[] }
> = {
  NEWEBPAY: {
    type: "NEWEBPAY",
    name: "藍新金流",
    envKeys: ["NEWEBPAY_MERCHANT_ID", "NEWEBPAY_HASH_KEY", "NEWEBPAY_HASH_IV"],
  },
  ECPAY: {
    type: "ECPAY",
    name: "綠界科技",
    envKeys: ["ECPAY_MERCHANT_ID", "ECPAY_HASH_KEY", "ECPAY_HASH_IV"],
  },
  STRIPE: {
    type: "STRIPE",
    name: "Stripe",
    envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
};

async function main() {
  // 1. 找出第一個 ACTIVE tenant
  const tenant = await db.tenant.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!tenant) {
    console.error("❌ 找不到 ACTIVE tenant");
    process.exit(1);
  }

  console.log(`🏪 Target tenant: ${tenant.name} (${tenant.id})`);

  // 2. 檢查是否已有 provider
  const existing = await db.paymentProvider.findFirst({
    where: { tenantId: tenant.id },
  });

  if (existing) {
    console.log(`⚠️  已有金流供應商: ${existing.name} (${existing.type})，跳過建立`);
    return;
  }

  // 3. 偵測哪組環境變數有值 → 決定 provider type
  let selectedKey = "NEWEBPAY"; // default
  for (const [key, cfg] of Object.entries(PROVIDER_CONFIGS)) {
    const allSet = cfg.envKeys.every((envKey) => !!process.env[envKey]);
    if (allSet) {
      selectedKey = key;
      break;
    }
  }

  const providerDef = PROVIDER_CONFIGS[selectedKey];

  // 4. 組裝 config JSON（env key → config key 對應表）
  const ENV_TO_CONFIG: Record<string, string> = {
    NEWEBPAY_MERCHANT_ID: "merchantId",
    NEWEBPAY_HASH_KEY: "hashKey",
    NEWEBPAY_HASH_IV: "hashIV",
    ECPAY_MERCHANT_ID: "merchantId",
    ECPAY_HASH_KEY: "hashKey",
    ECPAY_HASH_IV: "hashIV",
    STRIPE_SECRET_KEY: "secretKey",
    STRIPE_WEBHOOK_SECRET: "webhookSecret",
  };
  const config: Record<string, string> = {};
  for (const envKey of providerDef.envKeys) {
    const shortKey = ENV_TO_CONFIG[envKey] || envKey;
    config[shortKey] = process.env[envKey] || `<REPLACE_${envKey}>`;
  }
  config.isProduction = "false";

  // 5. 建立 provider
  const provider = await db.paymentProvider.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      type: providerDef.type,
      name: providerDef.name,
      config,
      isDefault: true,
    },
  });

  console.log(`✅ 已建立金流供應商: ${provider.name} (${provider.type})`);
  console.log(`   ID: ${provider.id}`);
  console.log(`   Config keys: ${Object.keys(config).join(", ")}`);

  // 檢查是否有 placeholder
  const placeholders = Object.entries(config).filter(([, v]) =>
    v.startsWith("<REPLACE_")
  );
  if (placeholders.length > 0) {
    console.log("");
    console.log("⚠️  以下欄位需手動替換為真實金鑰：");
    for (const [k, v] of placeholders) {
      console.log(`   ${k}: ${v}`);
    }
    console.log("");
    console.log("   可透過環境變數或直接 UPDATE payment_providers SET config = ... 修改");
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed 失敗:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
