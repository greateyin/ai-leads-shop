import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合併 Tailwind CSS 類別名稱
 * @param inputs - 類別名稱陣列
 * @returns 合併後的類別名稱字串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化貨幣
 * @param value - 數值
 * @param currency - 幣別代碼 (預設 TWD)
 * @returns 格式化後的貨幣字串
 */
export function formatCurrency(value: number, currency: string = "TWD"): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * 生成 URL-friendly slug
 * @param text - 原始文字
 * @returns slug 字串
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 驗證 Email 格式
 * @param email - Email 字串
 * @returns 是否為有效 Email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 延遲函式 (用於測試/模擬)
 * @param ms - 毫秒數
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成唯一訂單編號
 * @returns 訂單編號字串
 */
export function generateOrderNo(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}
