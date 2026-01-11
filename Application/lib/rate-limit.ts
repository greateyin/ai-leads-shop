import { db } from "@/lib/db";
import { QuotaMetric } from "@prisma/client";

// Re-export for consumers
export { QuotaMetric };

/**
 * 檢查結果
 */
export interface LimitCheckResult {
    allowed: boolean;
    currentUsage: number;
    limit: number;
    remaining: number;
    resetAt?: Date;
}

/**
 * 檢查租戶是否超過配額限制
 */
export async function checkTenantLimit(
    tenantId: string,
    metric: QuotaMetric
): Promise<LimitCheckResult> {
    // 取得配額限制
    const limitConfig = await db.tenantApiLimit.findUnique({
        where: {
            tenantId_metric: { tenantId, metric },
        },
    });

    // 如果沒有設定限制，預設允許
    if (!limitConfig) {
        return {
            allowed: true,
            currentUsage: 0,
            limit: Infinity,
            remaining: Infinity,
        };
    }

    const limit = Number(limitConfig.limitValue);

    // 取得當前使用量
    const currentPeriod = getPeriodDates(metric);

    // 映射 QuotaMetric 到 MetricType
    const metricTypeMap: Record<string, "API_CALLS" | "AI_TOKENS"> = {
        REQUESTS_PER_MINUTE: "API_CALLS",
        AI_TOKENS_PER_MONTH: "AI_TOKENS",
        STORAGE_MB: "API_CALLS", // fallback
    };
    const mappedMetricType = metricTypeMap[metric] || "API_CALLS";

    const usageMetric = await db.tenantUsageMetric.findFirst({
        where: {
            tenantId,
            metricType: mappedMetricType,
            periodStart: { gte: currentPeriod.start },
            periodEnd: { lte: currentPeriod.end },
        },
    });

    const currentUsage = usageMetric ? Number(usageMetric.value) : 0;
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    return {
        allowed,
        currentUsage,
        limit,
        remaining,
        resetAt: currentPeriod.end,
    };
}

/**
 * 增加租戶使用量
 */
export async function incrementUsage(
    tenantId: string,
    metric: QuotaMetric,
    value: number = 1
): Promise<void> {
    const period = getPeriodDates(metric);

    // 使用 upsert 來創建或更新使用量記錄
    await db.$executeRaw`
    INSERT INTO tenant_usage_metrics (id, tenant_id, metric_type, value, period_start, period_end, created_at, updated_at)
    VALUES (gen_random_uuid(), ${tenantId}::uuid, ${metric}, ${value}, ${period.start}, ${period.end}, NOW(), NOW())
    ON CONFLICT (tenant_id, metric_type, period_start) 
    DO UPDATE SET value = tenant_usage_metrics.value + ${value}, updated_at = NOW()
  `;
}

/**
 * 取得指標對應的時間週期
 */
function getPeriodDates(metric: QuotaMetric): { start: Date; end: Date } {
    const now = new Date();

    switch (metric) {
        case "REQUESTS_PER_MINUTE":
            // 每分鐘週期
            const minuteStart = new Date(now);
            minuteStart.setSeconds(0, 0);
            const minuteEnd = new Date(minuteStart);
            minuteEnd.setMinutes(minuteEnd.getMinutes() + 1);
            return { start: minuteStart, end: minuteEnd };

        case "AI_TOKENS_PER_MONTH":
        case "STORAGE_MB":
            // 每月週期
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            return { start: monthStart, end: monthEnd };

        default:
            // 預設使用每月週期
            const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            return { start: defaultStart, end: defaultEnd };
    }
}

/**
 * 用於 API 路由的配額檢查中間件
 * 如果超過配額，拋出錯誤
 */
export async function requireWithinLimit(
    tenantId: string,
    metric: QuotaMetric
): Promise<void> {
    const result = await checkTenantLimit(tenantId, metric);

    if (!result.allowed) {
        const error = new Error(`Usage limit exceeded for ${metric}`) as Error & {
            code: string;
            statusCode: number;
            details: LimitCheckResult;
        };
        error.code = "USAGE_LIMIT_EXCEEDED";
        error.statusCode = 429;
        error.details = result;
        throw error;
    }
}

/**
 * 建立配額錯誤回應
 */
export function createLimitExceededResponse(result: LimitCheckResult, metric: string) {
    return {
        success: false,
        error: {
            code: "USAGE_LIMIT_EXCEEDED",
            message: `已達到 ${metric} 的使用上限`,
            details: {
                currentUsage: result.currentUsage,
                limit: result.limit,
                resetAt: result.resetAt?.toISOString(),
            },
        },
    };
}
