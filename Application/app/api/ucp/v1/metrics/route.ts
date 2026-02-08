/**
 * UCP v1 — Metrics Endpoint (Internal)
 * GET /api/ucp/v1/metrics
 *
 * 回傳 UCP 各路由的錯誤率、延遲等指標。
 * 此端點僅供內部監控使用，不對外公開。
 *
 * @module app/api/ucp/v1/metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { getUcpMetrics } from "@/lib/ucp/metrics";

/**
 * GET /api/ucp/v1/metrics
 * @param request - 內部監控請求
 * @returns 各路由的計量快照
 */
export async function GET(request: NextRequest) {
    // 安全保護：必須設定 UCP_METRICS_TOKEN 且請求攜帶相符 token
    const token = request.headers.get("X-Internal-Token");
    const expectedToken = process.env.UCP_METRICS_TOKEN;

    // Closed by default：未設定 token 或 token 不符皆拒絕
    if (!expectedToken || token !== expectedToken) {
        return NextResponse.json(
            { error: { code: "FORBIDDEN", message: "Access denied" } },
            { status: 403 }
        );
    }

    const metrics = getUcpMetrics();

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        routes: metrics,
        summary: {
            totalRequests: metrics.reduce((sum, m) => sum + m.total, 0),
            totalErrors: metrics.reduce((sum, m) => sum + m.errors, 0),
            overallErrorRate:
                metrics.reduce((sum, m) => sum + m.total, 0) > 0
                    ? metrics.reduce((sum, m) => sum + m.errors, 0) /
                      metrics.reduce((sum, m) => sum + m.total, 0)
                    : 0,
        },
    });
}
