"use client";

import { useEffect, useRef } from "react";
import { trackingEvents } from "@/components/tracking/tracking-scripts";

/**
 * TrackViewItem 元件的 Props
 */
interface TrackViewItemProps {
  /** 商品 ID */
  productId: string;
  /** 商品名稱 */
  productName: string;
  /** 商品價格 */
  price: number;
  /** 商品分類（選填） */
  category?: string;
}

/**
 * 商品詳情頁 view_item 追蹤元件
 * 掛載時自動觸發 GA4 view_item / Meta ViewContent / TikTok ViewContent
 * 使用 ref 確保只觸發一次
 */
export function TrackViewItem({
  productId,
  productName,
  price,
  category,
}: TrackViewItemProps) {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    trackingEvents.viewItem({
      id: productId,
      name: productName,
      price,
      quantity: 1,
      category,
    });
  }, [productId, productName, price, category]);

  return null;
}
