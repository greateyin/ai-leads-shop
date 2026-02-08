/**
 * Google Merchant UCP Profile Endpoint (Legacy Path)
 * GET /.well-known/ucp/profile.json
 *
 * 回傳符合 Google Shopping APIs v1 規範的 profile。
 * 官方路徑為 /.well-known/merchant-api/ucp/profile.json，此為相容別名。
 *
 * @see docs/02_System_Analysis/06_UCP_Google_Alignment_Plan.md §2
 */

import { NextRequest } from "next/server";
import { handleProfileGet } from "@/lib/ucp/handlers/profile";

/**
 * GET /.well-known/ucp/profile.json
 * Google 平台透過此端點取得商家的 UCP 能力宣告
 */
export async function GET(request: NextRequest) {
    return handleProfileGet(request);
}
