import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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
const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

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
      <head>
        {ga4Id ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${ga4Id}');
              `}
            </Script>
          </>
        ) : null}
        {pixelId ? (
          <Script id="meta-pixel-init" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${pixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
        ) : null}
      </head>
      <body
        className={`${inter.className} antialiased font-sans`}
      >
        <Providers>{children}</Providers>
        {pixelId ? (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        ) : null}
      </body>
    </html>
  );
}
