import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 用量計算結果
 */
export interface UsageCalculationResult {
    tenantId: string;
    metrics: {
        aiTokens: number;
        storageMb: number;
        ordersCount: number;
        productsCount: number;
        apiCalls: number;
    };
    period: {
        start: Date;
        end: Date;
    };
}

/**
 * 計算單一租戶的使用量
 */
export async function calculateTenantUsage(
    tenantId: string,
    period?: { start: Date; end: Date }
): Promise<UsageCalculationResult> {
    const now = new Date();
    const periodStart = period?.start || new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = period?.end || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. 計算 AI 互動次數（作為 token 用量估算）
    const aiInteractionCount = await db.aiInteraction.count({
        where: {
            tenantId,
            createdAt: {
                gte: periodStart,
                lte: periodEnd,
            },
        },
    });
    // 估算 tokens: 每次互動平均 500 tokens
    const aiTokens = aiInteractionCount * 500;

    // 2. 計算訂單數量
    const ordersCount = await db.order.count({
        where: {
            tenantId,
            createdAt: {
                gte: periodStart,
                lte: periodEnd,
            },
        },
    });

    // 3. 計算商品數量
    const productsCount = await db.product.count({
        where: {
            tenantId,
            deletedAt: null,
        },
    });

    // 4. 計算儲存空間 (從 product_assets 估算)
    const storageResult = await db.$queryRaw<[{ total_size: bigint | null }]>`
    SELECT COALESCE(SUM(
      CASE 
        WHEN url LIKE '%/files/%' THEN 
          COALESCE(
            (SELECT size FROM files WHERE id = SUBSTRING(url FROM '/files/([^/]+)')::uuid),
            0
          )
        ELSE 0
      END
    ), 0) as total_size
    FROM product_assets
    WHERE tenant_id = ${tenantId}::uuid
  `;
    const storageMb = Number(storageResult[0]?.total_size || 0) / (1024 * 1024);

    // 5. 計算 API 呼叫次數 (從 analytics_events 估算)
    const apiCalls = await db.analyticsEvent.count({
        where: {
            tenantId,
            eventName: { startsWith: "api_" },
            createdAt: {
                gte: periodStart,
                lte: periodEnd,
            },
        },
    });

    return {
        tenantId,
        metrics: {
            aiTokens,
            storageMb: Math.round(storageMb * 100) / 100,
            ordersCount,
            productsCount,
            apiCalls,
        },
        period: {
            start: periodStart,
            end: periodEnd,
        },
    };
}

/**
 * 更新租戶使用量指標
 */
export async function updateTenantUsageMetrics(
    usage: UsageCalculationResult
): Promise<void> {
    const { tenantId, metrics, period } = usage;

    // 使用 upsert 更新各項指標
    const metricsToUpdate = [
        { type: "AI_TOKENS_PER_MONTH", value: metrics.aiTokens },
        { type: "STORAGE_MB", value: metrics.storageMb },
        { type: "ORDERS_COUNT", value: metrics.ordersCount },
        { type: "PRODUCTS_COUNT", value: metrics.productsCount },
    ];

    for (const metric of metricsToUpdate) {
        await db.tenantUsageMetric.upsert({
            where: {
                tenantId_metricType_periodStart: {
                    tenantId,
                    metricType: metric.type as "API_CALLS" | "AI_TOKENS",
                    periodStart: period.start,
                },
            },
            update: {
                value: metric.value,
                updatedAt: new Date(),
            },
            create: {
                id: generateId(),
                tenantId,
                metricType: metric.type as "API_CALLS" | "AI_TOKENS",
                value: metric.value,
                periodStart: period.start,
                periodEnd: period.end,
            },
        });
    }
}

/**
 * 檢查租戶是否超過配額
 */
export async function checkTenantQuotas(
    tenantId: string
): Promise<{ exceeded: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    // 取得當月使用量
    const usage = await calculateTenantUsage(tenantId);

    // 取得配額限制
    const limits = await db.tenantApiLimit.findMany({
        where: { tenantId },
    });

    const limitMap = new Map(limits.map((l) => [l.metric, Number(l.limitValue)]));

    // 檢查各項指標
    const aiTokenLimit = limitMap.get("AI_TOKENS_PER_MONTH");
    if (aiTokenLimit && usage.metrics.aiTokens > aiTokenLimit * 0.8) {
        warnings.push(`AI Token 使用量已達 ${Math.round((usage.metrics.aiTokens / aiTokenLimit) * 100)}%`);
    }

    const storageLimit = limitMap.get("STORAGE_MB");
    if (storageLimit && usage.metrics.storageMb > storageLimit * 0.8) {
        warnings.push(`儲存空間使用量已達 ${Math.round((usage.metrics.storageMb / storageLimit) * 100)}%`);
    }

    const exceeded =
        (aiTokenLimit && usage.metrics.aiTokens > aiTokenLimit) ||
        (storageLimit && usage.metrics.storageMb > storageLimit);

    return {
        exceeded: exceeded || false,
        warnings,
    };
}

/**
 * 執行所有租戶的用量計算
 * 
 * 此函數應由 cron job 定期呼叫（每小時或每天）
 */
export async function runUsageCalculation(): Promise<void> {
    console.log("[Usage Calculation] Starting batch job...");

    // 取得所有活躍租戶
    const tenants = await db.tenant.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
    });

    for (const tenant of tenants) {
        try {
            // 計算用量
            const usage = await calculateTenantUsage(tenant.id);

            // 更新指標
            await updateTenantUsageMetrics(usage);

            // 檢查配額
            const quotaCheck = await checkTenantQuotas(tenant.id);

            if (quotaCheck.warnings.length > 0) {
                console.log(`[Usage] ${tenant.name}: ${quotaCheck.warnings.join(", ")}`);

                // TODO: 發送警告通知給租戶管理員
            }

            if (quotaCheck.exceeded) {
                console.log(`[Usage] ${tenant.name}: Quota exceeded!`);

                // TODO: 發送配額超出通知
                // TODO: 可選擇性限制服務
            }
        } catch (error) {
            console.error(
                `[Usage] Error for ${tenant.name}: ${error instanceof Error ? error.message : "Unknown"}`
            );
        }
    }

    console.log("[Usage Calculation] Batch job completed");
}

/**
 * 生成租戶月度帳單
 */
export async function generateMonthlyInvoice(
    tenantId: string,
    billingPeriod: { year: number; month: number }
): Promise<string | null> {
    const periodStart = new Date(billingPeriod.year, billingPeriod.month - 1, 1);
    const periodEnd = new Date(billingPeriod.year, billingPeriod.month, 0, 23, 59, 59, 999);

    // 取得計費帳戶
    const billingAccount = await db.tenantBillingAccount.findUnique({
        where: { tenantId },
    });

    if (!billingAccount) {
        return null;
    }

    // 取得用量
    const usage = await calculateTenantUsage(tenantId, {
        start: periodStart,
        end: periodEnd,
    });

    // 計算費用 (根據方案)
    let baseAmount = 0;
    let usageAmount = 0;

    switch (billingAccount.plan) {
        case "SEED":
            baseAmount = 0; // 免費方案
            break;
        case "GROWTH":
            baseAmount = 990; // 月費
            break;
        case "PRO":
            baseAmount = 2990; // 月費
            break;
    }

    // AI Token 超額費用
    const aiTokenLimit = billingAccount.plan === "SEED" ? 10000 : billingAccount.plan === "GROWTH" ? 100000 : 1000000;
    if (usage.metrics.aiTokens > aiTokenLimit) {
        const extraTokens = usage.metrics.aiTokens - aiTokenLimit;
        usageAmount += Math.ceil(extraTokens / 1000) * 0.1; // 每 1000 tokens 0.1 元
    }

    const totalAmount = baseAmount + usageAmount;

    // 創建發票
    const invoice = await db.tenantInvoice.create({
        data: {
            id: generateId(),
            tenantId,
            invoiceNo: `INV-${billingPeriod.year}${String(billingPeriod.month).padStart(2, "0")}-${Date.now().toString().slice(-6)}`,
            periodStart,
            periodEnd,
            amount: totalAmount,
            currency: billingAccount.currency || "TWD",
            status: "DRAFT",
        },
    });

    return invoice.id;
}
