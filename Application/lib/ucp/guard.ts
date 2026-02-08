/**
 * UCP Kill Switch Guard
 *
 * 透過環境變數 `UCP_ENABLED` 控制 UCP 功能開關。
 * 設為 `"false"` 時，所有 UCP API 立即回 503 Service Unavailable。
 * 預設為啟用（未設定或非 "false" 均視為啟用）。
 *
 * @module lib/ucp/guard
 */

import { NextResponse } from "next/server";

/**
 * 檢查 UCP 是否啟用
 * @returns true = 啟用, false = 已關閉
 */
export function isUcpEnabled(): boolean {
    return process.env.UCP_ENABLED !== "false";
}

/**
 * UCP Kill Switch 回應
 * @returns 503 Service Unavailable JSON response
 */
export function ucpDisabledResponse(): NextResponse {
    return NextResponse.json(
        {
            error: {
                code: "SERVICE_UNAVAILABLE",
                message: "UCP service is temporarily disabled",
            },
        },
        {
            status: 503,
            headers: {
                "Retry-After": "300",
            },
        }
    );
}

/**
 * Guard：若 UCP 已關閉則回傳 503，否則回傳 null 表示放行
 * @returns NextResponse (503) 或 null
 */
export function ucpGuard(): NextResponse | null {
    if (!isUcpEnabled()) {
        return ucpDisabledResponse();
    }
    return null;
}
