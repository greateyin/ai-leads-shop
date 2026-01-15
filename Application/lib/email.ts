/**
 * Email Service using Resend
 * 基於 single-class-0.8.0 的 Resend 電郵服務模式
 */

import { Resend } from "resend";
import { db } from "@/lib/db";

// 緩存 Resend client
let resendClient: Resend | null = null;

/**
 * 取得 Resend Client
 * 優先使用系統設定，若無則使用環境變數
 */
export async function getResendClient(): Promise<Resend> {
    if (resendClient) {
        return resendClient;
    }

    // 嘗試從 TrackingSettings 取得 Resend API Key (可擴充)
    // 目前使用環境變數
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured");
    }

    resendClient = new Resend(apiKey);
    return resendClient;
}

/**
 * 取得發送者郵件地址
 */
export function getFromEmail(): string {
    return process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
}

/**
 * 取得應用程式名稱
 */
export function getAppName(): string {
    return process.env.NEXT_PUBLIC_APP_NAME || "AIsell";
}

/**
 * 發送驗證郵件
 */
export async function sendVerificationEmail(
    email: string,
    token: string,
    userName?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const resend = await getResendClient();
        const appName = getAppName();
        const fromEmail = getFromEmail();
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;

        const { error } = await resend.emails.send({
            from: `${appName} <${fromEmail}>`,
            to: email,
            subject: `驗證您的 ${appName} 帳號`,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">歡迎加入 ${appName}！</h1>
          <p>Hi ${userName || "用戶"},</p>
          <p>請點擊下方按鈕驗證您的電子郵件地址：</p>
          <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            驗證電子郵件
          </a>
          <p style="color: #666; font-size: 14px;">或複製此連結至瀏覽器：<br/>${verifyUrl}</p>
          <p style="color: #999; font-size: 12px;">此連結將於 24 小時後失效。</p>
        </div>
      `,
        });

        if (error) {
            console.error("[Email] 發送驗證郵件失敗:", error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error("[Email] 發送驗證郵件錯誤:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * 發送付款成功通知
 */
export async function sendPaymentSuccessEmail(
    email: string,
    orderNo: string,
    totalAmount: number,
    currency: string = "TWD"
): Promise<{ success: boolean; error?: string }> {
    try {
        const resend = await getResendClient();
        const appName = getAppName();
        const fromEmail = getFromEmail();
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

        const { error } = await resend.emails.send({
            from: `${appName} <${fromEmail}>`,
            to: email,
            subject: `[${appName}] 訂單 ${orderNo} 付款成功`,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">付款成功！</h1>
          <p>感謝您的訂購，您的訂單已付款成功。</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>訂單編號：</strong>${orderNo}</p>
            <p><strong>付款金額：</strong>${currency} ${totalAmount.toLocaleString()}</p>
          </div>
          <a href="${baseUrl}/orders" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px;">
            查看訂單
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">如有任何問題，請聯繫客服。</p>
        </div>
      `,
        });

        if (error) {
            console.error("[Email] 發送付款成功通知失敗:", error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error("[Email] 發送付款成功通知錯誤:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * 發送密碼重設郵件
 */
export async function sendPasswordResetEmail(
    email: string,
    token: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const resend = await getResendClient();
        const appName = getAppName();
        const fromEmail = getFromEmail();
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const resetUrl = `${baseUrl}/auth/reset?token=${token}`;

        const { error } = await resend.emails.send({
            from: `${appName} <${fromEmail}>`,
            to: email,
            subject: `[${appName}] 重設您的密碼`,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">重設密碼</h1>
          <p>您收到此郵件是因為您（或他人）請求重設您的密碼。</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            重設密碼
          </a>
          <p style="color: #666; font-size: 14px;">如果您沒有請求重設密碼，請忽略此郵件。</p>
          <p style="color: #999; font-size: 12px;">此連結將於 1 小時後失效。</p>
        </div>
      `,
        });

        if (error) {
            console.error("[Email] 發送密碼重設郵件失敗:", error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error("[Email] 發送密碼重設郵件錯誤:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * 通用發送郵件函數
 * 用於發送自定義郵件（如邀請信）
 */
export async function sendEmail(options: {
    to: string;
    subject: string;
    html: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const resend = await getResendClient();
        const appName = getAppName();
        const fromEmail = getFromEmail();

        const { error } = await resend.emails.send({
            from: `${appName} <${fromEmail}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
        });

        if (error) {
            console.error("[Email] 發送郵件失敗:", error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error("[Email] 發送郵件錯誤:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * 發送訪客訂單確認郵件
 * 用於訪客結帳後發送確認信
 */
export async function sendGuestOrderConfirmationEmail(options: {
    email: string;
    orderNo: string;
    guestName?: string;
    totalAmount: number;
    currency?: string;
    items: Array<{
        name: string;
        quantity: number;
        price: number;
    }>;
    shippingAddress?: {
        contactName: string;
        phone?: string;
        city: string;
        addressLine1: string;
    };
}): Promise<{ success: boolean; error?: string }> {
    try {
        const resend = await getResendClient();
        const appName = getAppName();
        const fromEmail = getFromEmail();
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const currency = options.currency || "TWD";
        const displayName = options.guestName || "貴賓";

        // 建立訂單項目 HTML
        const itemsHtml = options.items
            .map(
                (item) => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${currency} ${item.price.toLocaleString()}</td>
          </tr>
        `
            )
            .join("");

        // 建立收件地址 HTML
        const addressHtml = options.shippingAddress
            ? `
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 16px;">
            <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 14px;">📦 收件資訊</h3>
            <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">
              <strong>收件人：</strong>${options.shippingAddress.contactName}
            </p>
            ${options.shippingAddress.phone ? `<p style="margin: 4px 0; color: #4b5563; font-size: 14px;"><strong>電話：</strong>${options.shippingAddress.phone}</p>` : ""}
            <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">
              <strong>地址：</strong>${options.shippingAddress.city} ${options.shippingAddress.addressLine1}
            </p>
          </div>
        `
            : "";

        const { error } = await resend.emails.send({
            from: `${appName} <${fromEmail}>`,
            to: options.email,
            subject: `[${appName}] 訂單確認 ${options.orderNo}`,
            html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>訂單確認</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
              <h1 style="color: #111827; font-size: 24px; font-weight: 700; margin: 0;">${appName}</h1>
            </div>

            <div style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600;">訂單已確認</span>
              </div>

              <h2 style="color: #111827; font-size: 22px; font-weight: 600; margin: 0 0 16px 0; text-align: center;">
                感謝您的訂購，${displayName}！
              </h2>

              <p style="color: #4b5563; font-size: 16px; line-height: 26px; margin-bottom: 24px; text-align: center;">
                您的訂單已成功建立，我們將盡快處理。
              </p>

              <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; color: #0369a1; font-size: 14px;">
                  <strong>訂單編號：</strong> ${options.orderNo}
                </p>
                <p style="margin: 0; color: #0369a1; font-size: 18px; font-weight: 700;">
                  <strong>總金額：</strong> ${currency} ${options.totalAmount.toLocaleString()}
                </p>
              </div>

              <h3 style="color: #374151; font-size: 14px; margin: 24px 0 12px 0;">📋 訂單明細</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">商品</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">數量</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">小計</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              ${addressHtml}

              <div style="text-align: center; margin-top: 32px;">
                <a href="${baseUrl}" style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                  繼續購物
                </a>
              </div>

              <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-top: 24px;">
                <p style="color: #92400e; font-size: 14px; margin: 0;">
                  💡 <strong>提示：</strong>註冊帳號可以追蹤訂單狀態並享有會員優惠！
                </p>
              </div>

              <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
                如有任何問題，請回覆此郵件與我們聯繫。
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
        });

        if (error) {
            console.error("[Email] 發送訪客訂單確認郵件失敗:", error);
            return { success: false, error: error.message };
        }

        console.log(`[Email] 已發送訂單確認郵件至 ${options.email}`);
        return { success: true };
    } catch (error) {
        console.error("[Email] 發送訪客訂單確認郵件錯誤:", error);
        return { success: false, error: String(error) };
    }
}
