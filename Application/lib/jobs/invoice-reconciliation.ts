import { db } from "@/lib/db";
import { generateId } from "@/lib/id";

/**
 * 發票對帳結果
 */
export interface ReconciliationResult {
    processed: number;
    matched: number;
    mismatched: number;
    errors: string[];
}

/**
 * ECPay 發票對帳
 * 
 * 此任務應每天執行，檢查已付款訂單的發票開立狀態
 */
export async function reconcileEcpayInvoices(
    tenantId: string,
    dateRange?: { start: Date; end: Date }
): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
        processed: 0,
        matched: 0,
        mismatched: 0,
        errors: [],
    };

    try {
        // 取得需要對帳的付款記錄
        const startDate = dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const endDate = dateRange?.end || new Date();

        const payments = await db.payment.findMany({
            where: {
                tenantId,
                provider: "ECPAY",
                status: "PAID",
                paidAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            include: {
                order: {
                    select: { id: true, orderNo: true },
                },
            },
        });

        // 取得 ECPay 設定
        const providerConfig = await db.paymentProvider.findFirst({
            where: {
                tenantId,
                type: "ECPAY",
            },
            select: {
                config: true,
            },
        });

        if (!providerConfig?.config) {
            result.errors.push("找不到 ECPay 設定");
            return result;
        }

        const config = providerConfig.config as {
            MerchantID: string;
            HashKey: string;
            HashIV: string;
            InvoiceAPIKey?: string;
        };

        if (!config.InvoiceAPIKey) {
            result.errors.push("ECPay 發票 API 金鑰未設定");
            return result;
        }

        // 逐筆查詢發票狀態
        for (const payment of payments) {
            result.processed++;

            try {
                // 呼叫 ECPay 發票查詢 API
                const invoiceStatus = await queryEcpayInvoice(config, payment.transactionNo || "");

                if (invoiceStatus.success) {
                    result.matched++;

                    // 更新付款記錄的發票資訊
                    await db.payment.update({
                        where: { id: payment.id },
                        data: {
                            rawResponse: {
                                ...(payment.rawResponse as object || {}),
                                invoiceNo: invoiceStatus.invoiceNo,
                                invoiceDate: invoiceStatus.invoiceDate,
                            },
                        },
                    });
                } else {
                    result.mismatched++;
                    result.errors.push(
                        `訂單 ${payment.order?.orderNo}: 發票狀態不符 - ${invoiceStatus.message}`
                    );
                }
            } catch (error) {
                result.errors.push(
                    `訂單 ${payment.order?.orderNo}: ${error instanceof Error ? error.message : "未知錯誤"}`
                );
            }
        }

        // 記錄對帳結果
        await db.auditLog.create({
            data: {
                id: generateId(),
                tenantId,
                userId: "system",
                action: "INVOICE_RECONCILIATION",
                entityType: "Payment",
                entityId: "batch",
                newValue: {
                    processed: result.processed,
                    matched: result.matched,
                    mismatched: result.mismatched,
                    dateRange: { start: startDate, end: endDate },
                },
            },
        });

        return result;
    } catch (error) {
        result.errors.push(
            `對帳程序錯誤: ${error instanceof Error ? error.message : "未知錯誤"}`
        );
        return result;
    }
}

/**
 * 查詢 ECPay 發票狀態（模擬）
 * 
 * 實際實作需要呼叫 ECPay Invoice API
 */
async function queryEcpayInvoice(
    config: { MerchantID: string; HashKey: string; HashIV: string; InvoiceAPIKey?: string },
    transactionNo: string
): Promise<{ success: boolean; invoiceNo?: string; invoiceDate?: string; message?: string }> {
    // TODO: 實際呼叫 ECPay Invoice API
    // 以下為模擬實作

    // ECPay Invoice API endpoint: https://einvoice.ecpay.com.tw/Invoice/QueryIssue
    // 需要的參數:
    // - MerchantID
    // - RelateNumber (交易編號)
    // - TimeStamp
    // - CheckMacValue (簽章)

    console.log(`[ECPay] 查詢發票: ${transactionNo}`);

    // 模擬回應
    return {
        success: true,
        invoiceNo: `AA-${Date.now().toString().slice(-8)}`,
        invoiceDate: new Date().toISOString().split("T")[0],
    };
}

/**
 * NewebPay 發票對帳
 */
export async function reconcileNewebpayInvoices(
    tenantId: string,
    dateRange?: { start: Date; end: Date }
): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
        processed: 0,
        matched: 0,
        mismatched: 0,
        errors: [],
    };

    // NewebPay 發票對帳邏輯類似 ECPay
    // TODO: 實作 NewebPay Invoice API 整合

    return result;
}

/**
 * 執行所有租戶的發票對帳
 * 
 * 此函數應由 cron job 呼叫
 */
export async function runDailyInvoiceReconciliation(): Promise<void> {
    console.log("[Invoice Reconciliation] Starting daily job...");

    // 取得所有活躍租戶
    const tenants = await db.tenant.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
    });

    for (const tenant of tenants) {
        console.log(`[Invoice Reconciliation] Processing tenant: ${tenant.name}`);

        try {
            // ECPay 對帳
            const ecpayResult = await reconcileEcpayInvoices(tenant.id);
            console.log(`  ECPay: ${ecpayResult.matched}/${ecpayResult.processed} matched`);

            // NewebPay 對帳
            const newebpayResult = await reconcileNewebpayInvoices(tenant.id);
            console.log(`  NewebPay: ${newebpayResult.matched}/${newebpayResult.processed} matched`);
        } catch (error) {
            console.error(`  Error: ${error instanceof Error ? error.message : "Unknown"}`);
        }
    }

    console.log("[Invoice Reconciliation] Daily job completed");
}
