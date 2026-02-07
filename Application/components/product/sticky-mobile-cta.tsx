"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trackingEvents } from "@/components/tracking/tracking-scripts";

/**
 * StickyMobileCTA 元件的 Props
 */
interface StickyMobileCTAProps {
  /** 商品 ID */
  productId: string;
  /** 商品名稱 */
  productName: string;
  /** 商品價格 */
  price: number;
  /** 庫存數量 */
  stock: number;
}

/**
 * 手機底部固定購買列
 * 僅在 <768px 時顯示，提供快速加入購物車與立即購買
 * 黏在螢幕底部，不受頁面捲動影響
 */
export function StickyMobileCTA({
  productId,
  productName,
  price,
  stock,
}: StickyMobileCTAProps) {
  const [isAdded, setIsAdded] = useState(false);

  /** 快速加入購物車 */
  const handleQuickAdd = () => {
    const cartKey = "guest_cart";
    const existingCart = localStorage.getItem(cartKey);
    const cart = existingCart ? JSON.parse(existingCart) : [];

    const existingIndex = cart.findIndex(
      (item: { productId: string }) => item.productId === productId
    );

    if (existingIndex >= 0) {
      cart[existingIndex].quantity += 1;
    } else {
      cart.push({
        productId,
        variantId: null,
        productName,
        price,
        quantity: 1,
        addedAt: new Date().toISOString(),
      });
    }

    localStorage.setItem(cartKey, JSON.stringify(cart));

    // 追蹤 add_to_cart 事件
    trackingEvents.addToCart({
      id: productId,
      name: productName,
      price,
      quantity: 1,
    });

    // 顯示成功回饋
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);

    // 觸發購物車更新
    window.dispatchEvent(new Event("cart-updated"));
  };

  if (stock === 0) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border px-4 py-3 safe-area-bottom">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-muted-foreground">已售完</div>
          <Button disabled className="rounded-full px-8" size="lg">
            缺貨中
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3 safe-area-bottom">
      <div className="flex items-center gap-3">
        {/* 價格 */}
        <div className="flex-shrink-0">
          <div className="text-xl font-bold text-primary">
            NT$ {price.toLocaleString()}
          </div>
        </div>

        {/* 按鈕組 */}
        <div className="flex-1 flex gap-2">
          <Button
            variant={isAdded ? "default" : "outline"}
            className="flex-1 rounded-full border-2"
            onClick={handleQuickAdd}
          >
            {isAdded ? "✓ 已加入" : "加入購物車"}
          </Button>
          <Button
            variant="gradient"
            className="flex-1 rounded-full shadow-lg shadow-primary/20"
            onClick={() => {
              handleQuickAdd();
              window.location.href = `/checkout?productId=${productId}&quantity=1`;
            }}
          >
            立即購買
          </Button>
        </div>
      </div>
    </div>
  );
}
