/**
 * 藍新金流 SDK 封裝
 * @see https://www.newebpay.com/
 */

import crypto from "crypto";

/**
 * NewebPay 配置介面
 */
interface NewebPayConfig {
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
  itemDesc: string;
  email: string;
  returnUrl: string;
  notifyUrl: string;
  clientBackUrl?: string;
}

/**
 * 交易資料介面
 */
interface TradeInfo {
  MerchantID: string;
  RespondType: string;
  TimeStamp: string;
  Version: string;
  MerchantOrderNo: string;
  Amt: number;
  ItemDesc: string;
  Email: string;
  ReturnURL: string;
  NotifyURL: string;
  ClientBackURL?: string;
}

/**
 * 建立 NewebPay 交易
 * @param config - NewebPay 配置
 * @param order - 訂單資訊
 * @returns 交易表單 HTML 與交易編號
 */
export async function createTransaction(
  config: NewebPayConfig,
  order: OrderInfo
): Promise<{ formHtml: string; merchantOrderNo: string }> {
  const merchantOrderNo = `${order.orderId}${Date.now().toString(36)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const tradeInfo: TradeInfo = {
    MerchantID: config.merchantId,
    RespondType: "JSON",
    TimeStamp: timestamp,
    Version: "2.0",
    MerchantOrderNo: merchantOrderNo,
    Amt: order.amount,
    ItemDesc: order.itemDesc,
    Email: order.email,
    ReturnURL: order.returnUrl,
    NotifyURL: order.notifyUrl,
    ...(order.clientBackUrl && { ClientBackURL: order.clientBackUrl }),
  };

  // AES 加密
  const tradeInfoEncrypted = aesEncrypt(
    JSON.stringify(tradeInfo),
    config.hashKey,
    config.hashIV
  );

  // SHA256 雜湊
  const tradeSha = sha256Hash(tradeInfoEncrypted, config.hashKey, config.hashIV);

  const actionUrl = config.isProduction
    ? "https://core.newebpay.com/MPG/mpg_gateway"
    : "https://ccore.newebpay.com/MPG/mpg_gateway";

  // 建立表單 HTML
  const formHtml = `
    <form id="newebpay-form" method="post" action="${actionUrl}">
      <input type="hidden" name="MerchantID" value="${config.merchantId}" />
      <input type="hidden" name="TradeInfo" value="${tradeInfoEncrypted}" />
      <input type="hidden" name="TradeSha" value="${tradeSha}" />
      <input type="hidden" name="Version" value="2.0" />
    </form>
    <script>document.getElementById('newebpay-form').submit();</script>
  `;

  return { formHtml, merchantOrderNo };
}

/**
 * 建立 NewebPay 結構化表單資料（供前端 React 安全渲染）
 * @param config - NewebPay 配置
 * @param order - 訂單資訊
 * @returns actionUrl、hidden fields、交易編號
 */
export async function createFormData(
  config: NewebPayConfig,
  order: OrderInfo
): Promise<{
  actionUrl: string;
  fields: Record<string, string>;
  merchantOrderNo: string;
}> {
  const merchantOrderNo = `${order.orderId}${Date.now().toString(36)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const tradeInfo: TradeInfo = {
    MerchantID: config.merchantId,
    RespondType: "JSON",
    TimeStamp: timestamp,
    Version: "2.0",
    MerchantOrderNo: merchantOrderNo,
    Amt: order.amount,
    ItemDesc: order.itemDesc,
    Email: order.email,
    ReturnURL: order.returnUrl,
    NotifyURL: order.notifyUrl,
    ...(order.clientBackUrl && { ClientBackURL: order.clientBackUrl }),
  };

  const tradeInfoEncrypted = aesEncrypt(
    JSON.stringify(tradeInfo),
    config.hashKey,
    config.hashIV
  );
  const tradeSha = sha256Hash(tradeInfoEncrypted, config.hashKey, config.hashIV);

  const actionUrl = config.isProduction
    ? "https://core.newebpay.com/MPG/mpg_gateway"
    : "https://ccore.newebpay.com/MPG/mpg_gateway";

  return {
    actionUrl,
    fields: {
      MerchantID: config.merchantId,
      TradeInfo: tradeInfoEncrypted,
      TradeSha: tradeSha,
      Version: "2.0",
    },
    merchantOrderNo,
  };
}

/**
 * 驗證 NewebPay 回調通知
 * @param config - NewebPay 配置
 * @param payload - 回調資料
 * @returns 驗證結果與解密資料
 */
export function verifyNotification(
  config: NewebPayConfig,
  payload: { TradeInfo: string; TradeSha: string }
): {
  valid: boolean;
  data?: {
    orderId: string;
    amount: number;
    status: string;
    message: string;
  };
} {
  const { TradeInfo, TradeSha } = payload;

  // 驗證 SHA256
  const expectedSha = sha256Hash(TradeInfo, config.hashKey, config.hashIV);
  if (TradeSha !== expectedSha) {
    return { valid: false };
  }

  // 解密 TradeInfo
  try {
    const decrypted = aesDecrypt(TradeInfo, config.hashKey, config.hashIV);
    const data = JSON.parse(decrypted);

    return {
      valid: true,
      data: {
        orderId: data.Result?.MerchantOrderNo || "",
        amount: parseInt(data.Result?.Amt || "0"),
        status: data.Status === "SUCCESS" ? "paid" : "failed",
        message: data.Message || "",
      },
    };
  } catch {
    return { valid: false };
  }
}

/**
 * 查詢交易狀態
 * @param config - NewebPay 配置
 * @param merchantOrderNo - 商店訂單編號
 * @param amount - 訂單金額
 */
export async function queryTransaction(
  config: NewebPayConfig,
  merchantOrderNo: string,
  amount: number
): Promise<{
  success: boolean;
  status?: string;
  tradeNo?: string;
  payTime?: string;
}> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const postData = {
    MerchantID: config.merchantId,
    Version: "1.3",
    RespondType: "JSON",
    TimeStamp: timestamp,
    MerchantOrderNo: merchantOrderNo,
    Amt: amount,
  };

  const postDataEncrypted = aesEncrypt(
    JSON.stringify(postData),
    config.hashKey,
    config.hashIV
  );

  const queryUrl = config.isProduction
    ? "https://core.newebpay.com/API/QueryTradeInfo"
    : "https://ccore.newebpay.com/API/QueryTradeInfo";

  try {
    const response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        MerchantID: config.merchantId,
        Version: "1.3",
        RespondType: "JSON",
        CheckValue: generateCheckValue(
          config.merchantId,
          merchantOrderNo,
          amount,
          config.hashKey,
          config.hashIV
        ),
        TimeStamp: timestamp,
        MerchantOrderNo: merchantOrderNo,
        Amt: amount.toString(),
      }),
    });

    const data = await response.json();

    if (data.Status === "SUCCESS") {
      return {
        success: true,
        status: data.Result.TradeStatus,
        tradeNo: data.Result.TradeNo,
        payTime: data.Result.PayTime,
      };
    }

    return { success: false };
  } catch {
    return { success: false };
  }
}

/**
 * 請求退款
 * @param config - NewebPay 配置
 * @param merchantOrderNo - 商店訂單編號
 * @param amount - 退款金額
 * @param reason - 退款原因
 */
export async function requestRefund(
  config: NewebPayConfig,
  merchantOrderNo: string,
  amount: number,
  reason?: string
): Promise<{ success: boolean; message?: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const postData = {
    RespondType: "JSON",
    Version: "1.0",
    Amt: amount,
    MerchantOrderNo: merchantOrderNo,
    TimeStamp: timestamp,
    ...(reason && { NotifyURL: reason }),
  };

  const postDataEncrypted = aesEncrypt(
    JSON.stringify(postData),
    config.hashKey,
    config.hashIV
  );

  const refundUrl = config.isProduction
    ? "https://core.newebpay.com/API/CreditCard/Cancel"
    : "https://ccore.newebpay.com/API/CreditCard/Cancel";

  try {
    const response = await fetch(refundUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        MerchantID_: config.merchantId,
        PostData_: postDataEncrypted,
      }),
    });

    const data = await response.json();
    return {
      success: data.Status === "SUCCESS",
      message: data.Message,
    };
  } catch {
    return { success: false, message: "退款請求失敗" };
  }
}

/**
 * AES-256-CBC 加密
 */
function aesEncrypt(data: string, key: string, iv: string): string {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    key.padEnd(32, " ").slice(0, 32),
    iv.padEnd(16, " ").slice(0, 16)
  );
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

/**
 * AES-256-CBC 解密
 */
function aesDecrypt(encryptedData: string, key: string, iv: string): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    key.padEnd(32, " ").slice(0, 32),
    iv.padEnd(16, " ").slice(0, 16)
  );
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * SHA256 雜湊
 */
function sha256Hash(data: string, key: string, iv: string): string {
  const hashString = `HashKey=${key}&${data}&HashIV=${iv}`;
  return crypto.createHash("sha256").update(hashString).digest("hex").toUpperCase();
}

/**
 * 生成查詢用 CheckValue
 */
function generateCheckValue(
  merchantId: string,
  merchantOrderNo: string,
  amount: number,
  hashKey: string,
  hashIV: string
): string {
  const checkString = `IV=${hashIV}&Amt=${amount}&MerchantID=${merchantId}&MerchantOrderNo=${merchantOrderNo}&Key=${hashKey}`;
  return crypto.createHash("sha256").update(checkString).digest("hex").toUpperCase();
}
