"use client";

import { useEffect, useRef } from "react";
import { trackingEvents } from "@/components/tracking/tracking-scripts";

/**
 * 商品列表項目介面
 */
interface ProductListItem {
  /** 商品 ID */
  id: string;
  /** 商品名稱 */
  name: string;
  /** 商品價格 */
  price: number;
  /** 商品分類（選填） */
  category?: string;
}

/**
 * TrackViewItemList 元件的 Props
 */
interface TrackViewItemListProps {
  /** 列表名稱（例如「全部商品」、「分類: 服飾」） */
  listName: string;
  /** 列表中的商品 */
  items: ProductListItem[];
}

/**
 * 商品列表頁 view_item_list 追蹤元件
 * 掛載時自動觸發 GA4 view_item_list / Meta ViewContent / TikTok ViewContent
 * 使用 ref 確保只觸發一次
 */
export function TrackViewItemList({ listName, items }: TrackViewItemListProps) {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current || items.length === 0) return;
    hasFired.current = true;

    trackingEvents.viewItemList(
      listName,
      items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        category: item.category,
      }))
    );
  }, [listName, items]);

  return null;
}
