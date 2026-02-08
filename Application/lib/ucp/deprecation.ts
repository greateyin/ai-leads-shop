/**
 * UCP Deprecation Helper
 *
 * 為舊版 UCP 路由加入標準 Deprecation / Sunset / Link header，
 * 引導平台方遷移至 v1 路由。
 *
 * @module lib/ucp/deprecation
 * @see https://datatracker.ietf.org/doc/html/rfc8594 (Sunset Header)
 */

import { NextResponse } from "next/server";

/** Sunset 日期（舊路由預計下線時間） */
const SUNSET_DATE = "Sat, 31 May 2026 00:00:00 GMT";

/**
 * 為 NextResponse 加入 deprecation 相關 header
 * @param response - 要加入 header 的 NextResponse
 * @param v1Path - 對應的 v1 路由路徑（用於 Link header）
 * @returns 加入 header 後的同一 response
 */
export function withDeprecationHeaders(
    response: NextResponse,
    v1Path: string
): NextResponse {
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", SUNSET_DATE);
    response.headers.set(
        "Link",
        `<${v1Path}>; rel="successor-version"`
    );
    return response;
}
