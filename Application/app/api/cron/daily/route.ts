import { NextRequest, NextResponse } from "next/server";
import { runDailyInvoiceReconciliation } from "@/lib/jobs/invoice-reconciliation";
import { runUsageCalculation } from "@/lib/jobs/usage-calculation";

/**
 * GET /api/cron/daily
 * 
 * 每日 Cron Job - 由 Vercel Cron 或外部排程器呼叫
 * 
 * 執行內容:
 * - 發票對帳
 * - 用量計算
 * 
 * 安全性: 使用 CRON_SECRET 驗證
 */
export async function GET(request: NextRequest) {
    // 驗證 Cron Secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const results: Record<string, unknown> = {
        startedAt: new Date().toISOString(),
        jobs: {},
    };

    try {
        // 1. 執行發票對帳
        console.log("[Cron] Starting invoice reconciliation...");
        await runDailyInvoiceReconciliation();
        results.jobs = { ...results.jobs as object, invoiceReconciliation: "completed" };
    } catch (error) {
        console.error("[Cron] Invoice reconciliation failed:", error);
        results.jobs = {
            ...results.jobs as object,
            invoiceReconciliation: `failed: ${error instanceof Error ? error.message : "Unknown"}`,
        };
    }

    try {
        // 2. 執行用量計算
        console.log("[Cron] Starting usage calculation...");
        await runUsageCalculation();
        results.jobs = { ...results.jobs as object, usageCalculation: "completed" };
    } catch (error) {
        console.error("[Cron] Usage calculation failed:", error);
        results.jobs = {
            ...results.jobs as object,
            usageCalculation: `failed: ${error instanceof Error ? error.message : "Unknown"}`,
        };
    }

    results.completedAt = new Date().toISOString();

    return NextResponse.json({
        success: true,
        data: results,
    });
}

// Vercel Cron 配置需要在 vercel.json 中設定:
// {
//   "crons": [
//     {
//       "path": "/api/cron/daily",
//       "schedule": "0 2 * * *"  // 每天凌晨 2 點 (UTC)
//     }
//   ]
// }
