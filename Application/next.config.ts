import type { NextConfig } from "next";

/**
 * Next.js 配置
 * @see https://nextjs.org/docs/app/api-reference/next-config-js
 */
const nextConfig: NextConfig = {
  /* 啟用實驗性功能 */
  experimental: {
    /* 伺服器 Actions 配置 */
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  /* 圖片優化配置 */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  /* 環境變數 */
  env: {
    NEXT_PUBLIC_APP_NAME: "Manus AI Shop",
  },
};

export default nextConfig;
