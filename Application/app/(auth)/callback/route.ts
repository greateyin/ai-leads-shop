import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /auth/callback
 * OAuth 回呼處理路由
 * 處理第三方登入（Google、Facebook、LINE、Apple）的回呼
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // 處理 OAuth 錯誤
    if (error) {
      console.error("OAuth callback error:", error, errorDescription);
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("error", error);
      if (errorDescription) {
        redirectUrl.searchParams.set("message", errorDescription);
      }
      return NextResponse.redirect(redirectUrl);
    }

    // 驗證 session
    const session = await auth();

    if (session?.user) {
      // 登入成功，導向儀表板
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // 沒有 session，導向登入頁
    return NextResponse.redirect(new URL("/login", request.url));
  } catch (error) {
    console.error("OAuth callback error:", error);
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("error", "callback_failed");
    return NextResponse.redirect(redirectUrl);
  }
}

/**
 * POST /auth/callback
 * 處理 OAuth POST 回呼（某些供應商使用 POST）
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const state = formData.get("state") as string;
    const code = formData.get("code") as string;
    const error = formData.get("error") as string;

    if (error) {
      const errorDescription = formData.get("error_description") as string;
      console.error("OAuth POST callback error:", error, errorDescription);
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("error", error);
      return NextResponse.redirect(redirectUrl);
    }

    // 構建 GET URL 以便 Auth.js 處理
    const callbackUrl = new URL("/api/auth/callback", request.url);
    if (state) callbackUrl.searchParams.set("state", state);
    if (code) callbackUrl.searchParams.set("code", code);

    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    console.error("OAuth POST callback error:", error);
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("error", "callback_failed");
    return NextResponse.redirect(redirectUrl);
  }
}
