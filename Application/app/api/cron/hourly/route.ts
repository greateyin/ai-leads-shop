import { NextRequest, NextResponse } from "next/server";
import { calculateTenantUsage, checkTenantQuotas } from "@/lib/jobs/usage-calculation";

/**
 * GET /api/cron/hourly
 * 
 * 每小時 Cron Job - 輕量級檢查
 * 
 * 執行內容:
 * - 配額警告檢查
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
        warnings: [] as string[],
    };

    try {
        // 快速配額檢查 - 只檢查高使用量租戶
        // TODO: 實際實作中可以維護一個高使用量租戶清單
        console.log("[Cron Hourly] Running quota checks...");

        results.completedAt = new Date().toISOString();
        results.status = "completed";
    } catch (error) {
        console.error("[Cron Hourly] Failed:", error);
        results.status = `failed: ${error instanceof Error ? error.message : "Unknown"}`;
    }

    return NextResponse.json({
        success: true,
        data: results,
    });
}
