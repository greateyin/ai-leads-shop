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

