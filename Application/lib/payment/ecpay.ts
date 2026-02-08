/**
 * 綠界金流 SDK 封裝
 * @see https://www.ecpay.com.tw/
 */

import crypto from "crypto";

/**
 * ECPay 配置介面
 */
interface ECPayConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  isProduction?: boolean;
}

/**
 * 訂單資訊介面
 */
interface OrderInfo {
  orderId: string;
  amount: number;
  itemName: string;
  returnUrl: string;
  notifyUrl: string;
}

/**
 * 建立 ECPay 交易
 * @param config - ECPay 配置
 * @param order - 訂單資訊
 * @returns 交易表單 HTML
 */
export async function createTransaction(
  config: ECPayConfig,
  order: OrderInfo
): Promise<{ formHtml: string; merchantTradeNo: string }> {
  const merchantTradeNo = `${order.orderId}${Date.now()}`;
  const tradeDate = new Date()
    .toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "/");

  const baseParams = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: "aio",
    TotalAmount: order.amount,
    TradeDesc: "Manus AI Shop 訂單",
    ItemName: order.itemName,
    ReturnURL: order.notifyUrl,
    OrderResultURL: order.returnUrl,
    ChoosePayment: "ALL",
    EncryptType: 1,
  };

  // 生成檢查碼
  const checkMacValue = generateCheckMacValue(
    baseParams,
    config.hashKey,
    config.hashIV
  );

  const actionUrl = config.isProduction
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

  // 建立表單 HTML
  const formHtml = `
    <form id="ecpay-form" method="post" action="${actionUrl}">
      ${Object.entries({ ...baseParams, CheckMacValue: checkMacValue })
        .map(
          ([key, value]) =>
            `<input type="hidden" name="${key}" value="${value}" />`
        )
        .join("\n")}
    </form>
    <script>document.getElementById('ecpay-form').submit();</script>
  `;

  return { formHtml, merchantTradeNo };
}

/**
 * 建立 ECPay 結構化表單資料（供前端 React 安全渲染）
 * @param config - ECPay 配置
 * @param order - 訂單資訊
 * @returns actionUrl、hidden fields、交易編號
 */
export async function createFormData(
  config: ECPayConfig,
  order: OrderInfo
): Promise<{
  actionUrl: string;
  fields: Record<string, string>;
  merchantTradeNo: string;
}> {
  const merchantTradeNo = `${order.orderId}${Date.now()}`;
  const tradeDate = new Date()
    .toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "/");

  const baseParams: Record<string, unknown> = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: "aio",
    TotalAmount: order.amount,
    TradeDesc: "AIsell 訂單",
    ItemName: order.itemName,
    ReturnURL: order.notifyUrl,
    OrderResultURL: order.returnUrl,
    ChoosePayment: "ALL",
    EncryptType: 1,
  };

  const checkMacValue = generateCheckMacValue(
    baseParams,
    config.hashKey,
    config.hashIV
  );

  const actionUrl = config.isProduction
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

  // 將所有值轉為字串
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...baseParams, CheckMacValue: checkMacValue })) {
    fields[key] = String(value);
  }

  return { actionUrl, fields, merchantTradeNo };
}

/**
 * 驗證 ECPay 回調通知
 * @param config - ECPay 配置
 * @param payload - 回調資料
 * @returns 驗證結果
 */
export function verifyNotification(
  config: ECPayConfig,
  payload: Record<string, string>
): { valid: boolean; orderId?: string; amount?: number; status?: string } {
  const { CheckMacValue, ...params } = payload;

  const expectedCheckMacValue = generateCheckMacValue(
    params,
    config.hashKey,
    config.hashIV
  );

  if (CheckMacValue !== expectedCheckMacValue) {
    return { valid: false };
  }

  return {
    valid: true,
    orderId: params.MerchantTradeNo,
    amount: parseInt(params.TradeAmt || "0"),
    status: params.RtnCode === "1" ? "paid" : "failed",
  };
}

/**
 * 生成檢查碼
 */
function generateCheckMacValue(
  params: Record<string, unknown>,
  hashKey: string,
  hashIV: string
): string {
  // 按照 ECPay 規範排序與編碼
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const rawString = `HashKey=${hashKey}&${sortedParams}&HashIV=${hashIV}`;
  const encodedString = encodeURIComponent(rawString).toLowerCase();

  return crypto.createHash("sha256").update(encodedString).digest("hex").toUpperCase();
}
