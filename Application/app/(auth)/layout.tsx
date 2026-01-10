import Link from "next/link";

/**
 * 認證頁面 Layout
 * 用於登入、註冊等公開頁面
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* 簡易導航 */}
      <header className="absolute left-0 right-0 top-0 z-50 p-4">
        <Link href="/" className="text-xl font-bold">
          Manus AI Shop
        </Link>
      </header>

      {/* 主內容 */}
      {children}
    </div>
  );
}
