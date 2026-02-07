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
  /** 商品規格列表（選填，有規格時顯示選擇器） */
  variants?: Array<{
    id: string;
    name: string | null;
    sku: string;
    price: number | string | null;
  }>;
}

/**
 * 手機底部固定購買列
 * 僅在 <768px 時顯示，提供快速加入購物車與立即購買
 * 黏在螢幕底部，不受頁面捲動影響
 * 支援規格選擇：有 variants 時會展開規格選擇面板
 */
export function StickyMobileCTA({
  productId,
  productName,
  price,
  stock,
  variants = [],
}: StickyMobileCTAProps) {
  const [isAdded, setIsAdded] = useState(false);
  /** 已選規格 ID（有規格時預設選第一個） */
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null
  );
  /** 規格選擇面板是否展開 */
  const [showVariantPicker, setShowVariantPicker] = useState(false);

  /** 取得目前選中規格的顯示價格 */
  const displayPrice = selectedVariantId
    ? Number(variants.find((v) => v.id === selectedVariantId)?.price) || price
    : price;

  /** 快速加入購物車 */
  const handleQuickAdd = () => {
    // 有規格但未選擇時，展開選擇面板
    if (variants.length > 0 && !selectedVariantId) {
      setShowVariantPicker(true);
      return;
    }

    const cartKey = "guest_cart";
    const existingCart = localStorage.getItem(cartKey);
    const cart = existingCart ? JSON.parse(existingCart) : [];

    const existingIndex = cart.findIndex(
      (item: { productId: string; variantId: string | null }) =>
        item.productId === productId && item.variantId === selectedVariantId
    );

    if (existingIndex >= 0) {
      cart[existingIndex].quantity += 1;
    } else {
      cart.push({
        productId,
        variantId: selectedVariantId,
        productName,
        price: displayPrice,
        quantity: 1,
        addedAt: new Date().toISOString(),
      });
    }

    localStorage.setItem(cartKey, JSON.stringify(cart));

    // 追蹤 add_to_cart 事件
    trackingEvents.addToCart({
      id: productId,
      name: productName,
      price: displayPrice,
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
    <>
      {/* 規格選擇面板（backdrop + bottom sheet） */}
      {showVariantPicker && variants.length > 0 && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowVariantPicker(false)}
          />
          {/* Bottom sheet */}
          <div className="absolute bottom-0 inset-x-0 bg-background rounded-t-2xl p-4 pb-8 safe-area-bottom animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">選擇規格</h3>
              <button
                onClick={() => setShowVariantPicker(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVariantId(v.id);
                    setShowVariantPicker(false);
                  }}
                  className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                    selectedVariantId === v.id
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-foreground hover:border-primary/50"
                  }`}
                >
                  {v.name || v.sku}
                  {v.price && ` NT$ ${Number(v.price).toLocaleString()}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 固定底部 CTA 列 */}
      <div className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3 safe-area-bottom">
        <div className="flex items-center gap-3">
          {/* 價格 */}
          <div className="flex-shrink-0">
            <div className="text-xl font-bold text-primary">
              NT$ {displayPrice.toLocaleString()}
            </div>
            {/* 已選規格提示 */}
            {variants.length > 0 && selectedVariantId && (
              <button
                onClick={() => setShowVariantPicker(true)}
                className="text-xs text-muted-foreground underline"
              >
                {variants.find((v) => v.id === selectedVariantId)?.name || "已選規格"}
              </button>
            )}
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
                const variantParam = selectedVariantId ? `&variantId=${selectedVariantId}` : "";
                window.location.href = `/checkout?productId=${productId}&quantity=1${variantParam}`;
              }}
            >
              立即購買
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
