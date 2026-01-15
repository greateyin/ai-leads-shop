"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 登入頁面
 * 支援 Email/Password 與 OAuth 登入
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 處理表單提交
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("帳號或密碼錯誤");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("登入失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * OAuth 登入處理
   */
  const handleOAuthSignIn = (provider: string) => {
    signIn(provider, { callbackUrl: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-12 sm:px-6 lg:px-8">
      {/* 背景裝飾 */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

      <div className="w-full max-w-md space-y-8 rounded-2xl bg-card p-8 shadow-xl ring-1 ring-black/5 sm:p-10">
        <div className="space-y-2 text-center">
          <Link href="/" className="inline-block">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-2xl font-bold text-transparent">
              AIsell
            </span>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">歡迎回來</h2>
          <p className="text-sm text-muted-foreground">
            登入您的帳號以繼續管理商店
          </p>
        </div>

        <div className="grid gap-3">
          <Button
            variant="outline"
            onClick={() => handleOAuthSignIn("google")}
            className="h-11 justify-start gap-3 bg-white hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            使用 Google 繼續
          </Button>
          <Button
            variant="outline"
            onClick={() => handleOAuthSignIn("facebook")}
            className="h-11 justify-start gap-3 bg-white hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            使用 Facebook 繼續
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-muted" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              或使用電子郵件
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">電子郵件</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密碼</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:text-primary/80"
              >
                忘記密碼？
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11"
            />
          </div>

          <Button type="submit" className="h-11 w-full text-base" variant="gradient" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeWidth="3" strokeLinecap="round" /></svg>
                登入中...
              </span>
            ) : "登入"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          還沒有帳號？{" "}
          <Link href="/register" className="font-semibold text-primary hover:text-primary/80">
            立即註冊
          </Link>
        </p>
      </div>
    </div>
  );
}
