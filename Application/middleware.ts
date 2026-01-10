import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * 受保護的路由前綴
 */
const protectedPaths = ["/dashboard"];

/**
 * 公開路由 (已登入用戶不應訪問)
 */
const authPaths = ["/login", "/register"];

/**
 * 全域 Middleware
 * 處理認證與路由保護
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 檢查是否為受保護路由
  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  // 檢查是否為認證路由
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  // 取得 session
  const session = await auth();

  // 未登入用戶訪問受保護路由 -> 導向登入頁
  if (isProtectedPath && !session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // 已登入用戶訪問認證路由 -> 導向儀表板
  if (isAuthPath && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

/**
 * Middleware 配置
 * 排除靜態資源與 API 路由
 */
export const config = {
  matcher: [
    /*
     * 匹配所有路徑，除了：
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
