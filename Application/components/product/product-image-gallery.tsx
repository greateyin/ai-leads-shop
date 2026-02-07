"use client";

import { useState } from "react";

/**
 * 商品圖片素材介面
 */
interface ProductAsset {
  /** 素材 ID */
  id: string;
  /** 圖片網址 */
  url: string;
  /** 圖片替代文字 */
  altText?: string | null;
}

/**
 * ProductImageGallery 元件的 Props
 */
interface ProductImageGalleryProps {
  /** 封面圖片網址 */
  coverImageUrl: string | null;
  /** 商品名稱（用於 alt） */
  productName: string;
  /** 附加圖片素材 */
  assets: ProductAsset[];
}

/**
 * 商品圖片畫廊元件
 * 支援主圖切換、縮圖點擊切換、觸控滑動
 * RWD：手機全寬、桌機固定比例
 */
export function ProductImageGallery({
  coverImageUrl,
  productName,
  assets,
}: ProductImageGalleryProps) {
  // 組合所有圖片：封面 + 附加素材
  const allImages = [
    ...(coverImageUrl
      ? [{ id: "cover", url: coverImageUrl, altText: productName }]
      : []),
    ...assets,
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const currentImage = allImages[selectedIndex] || null;

  // 無圖片時的 placeholder
  if (allImages.length === 0) {
    return (
      <div className="aspect-square relative overflow-hidden rounded-3xl bg-secondary/30 shadow-2xl shadow-primary/5">
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <span className="text-4xl mb-4">🖼️</span>
          <span>無圖片</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 主圖 */}
      <div className="aspect-square relative overflow-hidden rounded-3xl bg-secondary/30 shadow-2xl shadow-primary/5 transition-transform duration-500 hover:scale-[1.02]">
        <img
          src={currentImage?.url}
          alt={currentImage?.altText || productName}
          className="object-cover w-full h-full transition-opacity duration-300"
        />

        {/* 圖片指示器（手機） */}
        {allImages.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden">
            {allImages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === selectedIndex
                    ? "bg-white w-6"
                    : "bg-white/50 hover:bg-white/75"
                }`}
                aria-label={`切換到第 ${idx + 1} 張圖片`}
              />
            ))}
          </div>
        )}

        {/* 左右切換箭頭（桌機） */}
        {allImages.length > 1 && (
          <>
            <button
              onClick={() =>
                setSelectedIndex((prev) =>
                  prev === 0 ? allImages.length - 1 : prev - 1
                )
              }
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur rounded-full items-center justify-center shadow-lg hover:bg-white transition-colors"
              aria-label="上一張圖片"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() =>
                setSelectedIndex((prev) =>
                  prev === allImages.length - 1 ? 0 : prev + 1
                )
              }
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur rounded-full items-center justify-center shadow-lg hover:bg-white transition-colors"
              aria-label="下一張圖片"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* 縮圖列（桌機顯示） */}
      {allImages.length > 1 && (
        <div className="hidden md:grid grid-cols-5 gap-3">
          {allImages.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setSelectedIndex(idx)}
              className={`aspect-square rounded-xl overflow-hidden bg-secondary/30 transition-all ${
                idx === selectedIndex
                  ? "ring-2 ring-primary ring-offset-2 shadow-md"
                  : "ring-2 ring-transparent hover:ring-primary/30 opacity-70 hover:opacity-100"
              }`}
              aria-label={`選擇第 ${idx + 1} 張圖片`}
            >
              <img
                src={img.url}
                alt={img.altText || productName}
                className="object-cover w-full h-full"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
