/**
 * UCP Observability — 請求計量與錯誤追蹤
 *
 * 輕量級 in-process 計量器，紀錄 UCP 請求次數、錯誤率、延遲。
 * 可透過 GET /api/ucp/v1/metrics (內部用) 查詢，或接入外部監控。
 *
 * @module lib/ucp/metrics
 */

/** 單一計量桶 */
interface MetricBucket {
    /** 請求總數 */
    total: number;
    /** 錯誤數（4xx / 5xx） */
    errors: number;
    /** 延遲樣本（ms），最近 100 筆 */
    latencies: number[];
}

/** 按路由分桶 */
const buckets: Record<string, MetricBucket> = {};

/**
 * 取得或建立指定路由的計量桶
 * @param route - 路由標識（如 "POST /checkout-sessions"）
 */
function getBucket(route: string): MetricBucket {
    if (!buckets[route]) {
        buckets[route] = { total: 0, errors: 0, latencies: [] };
    }
    return buckets[route];
}

/**
 * 記錄一次 UCP 請求
 * @param route - 路由標識
 * @param statusCode - HTTP 回應狀態碼
 * @param durationMs - 請求處理時間（毫秒）
 */
export function recordUcpRequest(
    route: string,
    statusCode: number,
    durationMs: number
): void {
    const bucket = getBucket(route);
    bucket.total++;
    if (statusCode >= 400) {
        bucket.errors++;
    }
    bucket.latencies.push(durationMs);
    // 只保留最近 100 筆延遲樣本
    if (bucket.latencies.length > 100) {
        bucket.latencies.shift();
    }
}

/**
 * 計算 P95 延遲
 * @param latencies - 延遲樣本陣列
 * @returns P95 值（ms），無樣本時回 0
 */
function p95(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    const sorted = [...latencies].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[idx];
}

/** 單一路由的快照 */
export interface RouteMetrics {
    route: string;
    total: number;
    errors: number;
    errorRate: number;
    p95LatencyMs: number;
    avgLatencyMs: number;
}

/**
 * 取得所有路由的指標快照
 * @returns 各路由的計量快照
 */
export function getUcpMetrics(): RouteMetrics[] {
    return Object.entries(buckets).map(([route, bucket]) => ({
        route,
        total: bucket.total,
        errors: bucket.errors,
        errorRate: bucket.total > 0 ? bucket.errors / bucket.total : 0,
        p95LatencyMs: p95(bucket.latencies),
        avgLatencyMs:
            bucket.latencies.length > 0
                ? bucket.latencies.reduce((a, b) => a + b, 0) / bucket.latencies.length
                : 0,
    }));
}

/**
 * 重置所有計量（用於測試）
 */
export function resetUcpMetrics(): void {
    for (const key of Object.keys(buckets)) {
        delete buckets[key];
    }
}

/**
 * 高階 wrapper：自動計量 route handler
 *
 * @example
 * ```ts
 * export const POST = withUcpMetrics("POST /checkout-sessions", async (req) => {
 *     // handler logic...
 * });
 * ```
 *
 * @param route - 路由標識
 * @param handler - 原始 handler 函式
 * @returns 包裝後的 handler
 */
export function withUcpMetrics<TArgs extends unknown[]>(
    route: string,
    handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
    return async (...args: TArgs): Promise<Response> => {
        const start = Date.now();
        try {
            const response = await handler(...args);
            recordUcpRequest(route, response.status, Date.now() - start);
            return response;
        } catch (error) {
            recordUcpRequest(route, 500, Date.now() - start);
            throw error;
        }
    };
}
