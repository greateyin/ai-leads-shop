"use client";

import { useEffect } from "react";

/** UTM 參數鍵值 */
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

/** localStorage 儲存鍵 */
const UTM_STORAGE_KEY = "initial_utm_params";

/**
 * UTM 參數介面
 */
export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  /** 記錄時間 */
  captured_at?: string;
  /** 進站頁面 */
  landing_page?: string;
}

/**
 * 從 URL 擷取 UTM 參數並存入 localStorage
 * 僅在首次進站（尚無紀錄）時儲存，避免被後續內部導航覆蓋
 */
function captureUtmFromUrl(): UtmParams | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const utm: UtmParams = {};
  let hasUtm = false;

  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) {
      utm[key] = value;
      hasUtm = true;
    }
  }

  if (!hasUtm) return null;

  utm.captured_at = new Date().toISOString();
  utm.landing_page = window.location.pathname;

  return utm;
}

/**
 * 取得已儲存的 UTM 參數
 * @returns 已儲存的 UTM 物件，若無則回傳 null
 */
export function getSavedUtm(): UtmParams | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(UTM_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * UTM 持久化元件
 * 掛載在 Layout 層級，首次進站時自動擷取 URL 中的 UTM 參數並存入 localStorage
 * 結帳時可透過 getSavedUtm() 取得後回傳至訂單 metadata
 */
export function UtmPersistence() {
  useEffect(() => {
    // 已有紀錄則不覆蓋（first-touch attribution）
    const existing = getSavedUtm();
    if (existing) return;

    const utm = captureUtmFromUrl();
    if (utm) {
      try {
        localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
      } catch {
        // localStorage 不可用時靜默失敗
      }
    }
  }, []);

  return null;
}
