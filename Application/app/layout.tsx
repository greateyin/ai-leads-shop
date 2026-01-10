import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ogImageEnv = process.env.NEXT_PUBLIC_OG_IMAGE_URL;
const ogImageUrl = ogImageEnv
  ? ogImageEnv.startsWith("http")
    ? ogImageEnv
    : `${siteUrl}${ogImageEnv.startsWith("/") ? "" : "/"}${ogImageEnv}`
  : undefined;
// 追蹤腳本已移至 (public)/layout.tsx，由租戶動態載入

/**
 * 應用程式全域 Metadata
 */
export const metadata: Metadata = {
  title: {
    default: "AIsell",
    template: "%s | AIsell",
  },
  description: "AI 驅動的輕量級電商平台，讓您輕鬆建立線上商店",
  keywords: ["電商", "AI", "線上商店", "SaaS"],
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "AIsell",
    description: "AI 驅動的輕量級電商平台，讓您輕鬆建立線上商店",
    url: siteUrl,
    siteName: "AIsell",
    locale: "zh_TW",
    type: "website",
    images: ogImageUrl
      ? [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "Manus AI Shop",
        },
      ]
      : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: "AIsell",
    description: "AI 驅動的輕量級電商平台，讓您輕鬆建立線上商店",
    images: ogImageUrl ? [ogImageUrl] : undefined,
  },
};

/**
 * 根 Layout 元件
 * 初始化 SessionProvider、ThemeProvider 等全域提供者
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <body className={`${inter.className} antialiased font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
