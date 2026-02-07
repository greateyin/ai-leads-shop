"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { trackingEvents } from "@/components/tracking/tracking-scripts";

interface AddToCartButtonProps {
    productId: string;
    productName: string;
    price: number;
    stock: number;
    variants?: Array<{
        id: string;
        name: string | null;
        sku: string;
        price: number | string | null;
    }>;
}

export function AddToCartButton({
    productId,
    productName,
    price,
    stock,
    variants = [],
}: AddToCartButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [quantity, setQuantity] = useState(1);
    const [selectedVariantId, setSelectedVariantId] = useState(
        variants.length > 0 ? variants[0].id : null
    );
    const [isAdded, setIsAdded] = useState(false);

    const handleAddToCart = () => {
        // 使用 localStorage 儲存購物車（訪客模式）
        const cartKey = "guest_cart";
        const existingCart = localStorage.getItem(cartKey);
        const cart = existingCart ? JSON.parse(existingCart) : [];

        // 檢查商品是否已在購物車
        const existingItemIndex = cart.findIndex(
            (item: { productId: string; variantId: string | null }) =>
                item.productId === productId &&
                item.variantId === selectedVariantId
        );

        if (existingItemIndex >= 0) {
            // 更新數量
            cart[existingItemIndex].quantity += quantity;
        } else {
            // 新增商品
            cart.push({
                productId,
                variantId: selectedVariantId,
                productName,
                price,
                quantity,
                addedAt: new Date().toISOString(),
            });
        }

        localStorage.setItem(cartKey, JSON.stringify(cart));

        // 追蹤 add_to_cart 事件
        trackingEvents.addToCart({
            id: productId,
            name: productName,
            price,
            quantity,
        });

        // 顯示成功訊息
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);

        // 觸發購物車更新事件
        window.dispatchEvent(new Event("cart-updated"));
    };

    const handleBuyNow = () => {
        // 加入購物車後直接前往結帳
        handleAddToCart();
        startTransition(() => {
            router.push(`/checkout?productId=${productId}&quantity=${quantity}${selectedVariantId ? `&variantId=${selectedVariantId}` : ""}`);
        });
    };

    return (
        <div className="space-y-6 rounded-2xl bg-secondary/10 p-6 border border-border/50">
            {/* 規格選擇 */}
            {variants.length > 0 && (
                <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">選擇規格</label>
                    <div className="relative">
                        <select
                            value={selectedVariantId || ""}
                            onChange={(e) => setSelectedVariantId(e.target.value)}
                            className="w-full appearance-none rounded-lg border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow cursor-pointer"
                        >
                            {variants.map((variant) => (
                                <option key={variant.id} value={variant.id}>
                                    {variant.name || variant.sku}
                                    {variant.price && ` - NT$ ${Number(variant.price).toLocaleString()}`}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-4 items-end">
                {/* 數量 */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">數量</label>
                    <input
                        type="number"
                        min="1"
                        max={stock || 99}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24 rounded-lg border border-input bg-background px-4 py-3 text-sm text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </div>

                {/* 購買按鈕 */}
                <div className="flex-1 flex gap-3">
                    <Button
                        size="lg"
                        variant={isAdded ? "default" : "gradient"}
                        className="flex-1 h-[46px] rounded-lg text-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all w-full"
                        disabled={stock === 0 || isPending}
                        onClick={handleAddToCart}
                    >
                        {isAdded ? "✓ 已加入" : "加入購物車"}
                    </Button>
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-[46px] w-[46px] rounded-lg border-2 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                    </Button>
                </div>
            </div>

            {/* 直接購買 */}
            <Button
                size="lg"
                variant="outline"
                className="w-full h-[46px] rounded-lg border-2"
                disabled={stock === 0 || isPending}
                onClick={handleBuyNow}
            >
                {isPending ? "處理中..." : "立即購買"}
            </Button>

            {/* 庫存不足提示 */}
            {stock === 0 && (
                <p className="text-center text-sm text-red-500">
                    此商品目前缺貨，請稍後再試
                </p>
            )}
        </div>
    );
}
