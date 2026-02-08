/**
 * Google Merchant API — UCP Profile (Official Discovery Path)
 * GET /.well-known/merchant-api/ucp/profile.json
 *
 * Google 官方規範的 profile 探索路徑。
 * 委派給共用 profile handler。
 *
 * @see https://developers.google.com/merchant/api/guides/ucp/publish-profile
 */

import { NextRequest } from "next/server";
import { handleProfileGet } from "@/lib/ucp/handlers/profile";

export async function GET(request: NextRequest) {
    return handleProfileGet(request);
}
