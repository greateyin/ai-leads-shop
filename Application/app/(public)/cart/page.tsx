"use client";

import { useEffect, useState } from "react";
import { CartItem } from "@/components/cart/CartItem";
import { CartSummary } from "@/components/cart/CartSummary";
import { Loader2, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface GuestCartItem {
  productId: string;
  variantId: string | null;
  productName: string;
  price: number;
  quantity: number;
  addedAt: string;
  imageUrl?: string;
}

interface CartData {
  id: string;
  items: any[];
  total: number;
  itemCount: number;
  currency: string;
}

export default function CartPage() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [guestCart, setGuestCart] = useState<GuestCartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 嘗試取得 API 購物車 (登入用戶)，失敗則使用 localStorage (訪客模式)
  const fetchCart = async () => {
    try {
      const res = await fetch("/api/carts");
      if (!res.ok) {
        if (res.status === 401) {
          // 未登入，使用訪客購物車
          loadGuestCart();
          return;
        }
        throw new Error("Failed to fetch cart");
      }
      const json = await res.json();
      if (json.success) {
        setCart(json.data);
        setIsGuest(false);
      } else {
        loadGuestCart();
      }
    } catch {
      loadGuestCart();
    } finally {
      setIsLoading(false);
    }
  };

  // 載入訪客購物車 (localStorage) 並獲取商品圖片
  const loadGuestCart = async () => {
    setIsGuest(true);
    try {
      const cartData = localStorage.getItem("guest_cart");
      if (cartData) {
        const items: GuestCartItem[] = JSON.parse(cartData);
        // 獲取商品圖片
        const itemsWithImages = await Promise.all(
          items.map(async (item) => {
            if (item.imageUrl) return item;
            try {
              const res = await fetch(`/api/products/${item.productId}/public`);
              if (res.ok) {
                const json = await res.json();
                if (json.success) {
                  return { ...item, imageUrl: json.data.coverImageUrl };
                }
              }
            } catch {}
            return item;
          }),
        );
        setGuestCart(itemsWithImages);
      }
    } catch {
      console.error("Failed to load guest cart");
    }
    setIsLoading(false);
  };

  // 更新訪客購物車數量
  const handleGuestUpdateQuantity = (productId: string, quantity: number) => {
    const updatedCart = guestCart.map((item) =>
      item.productId === productId ? { ...item, quantity } : item,
    );
    setGuestCart(updatedCart);
    localStorage.setItem("guest_cart", JSON.stringify(updatedCart));
    window.dispatchEvent(new Event("cart-updated"));
  };

  // 移除訪客購物車商品
  const handleGuestRemoveItem = (productId: string) => {
    const updatedCart = guestCart.filter(
      (item) => item.productId !== productId,
    );
    setGuestCart(updatedCart);
    localStorage.setItem("guest_cart", JSON.stringify(updatedCart));
    window.dispatchEvent(new Event("cart-updated"));
  };

  // 清空訪客購物車
  const handleClearGuestCart = () => {
    setGuestCart([]);
    localStorage.removeItem("guest_cart");
    window.dispatchEvent(new Event("cart-updated"));
  };

  useEffect(() => {
    fetchCart();

    // 監聽購物車更新事件
    const handleCartUpdate = () => {
      if (isGuest) {
        loadGuestCart();
      }
    };
    window.addEventListener("cart-updated", handleCartUpdate);
    return () => window.removeEventListener("cart-updated", handleCartUpdate);
  }, [isGuest]);

  // API 購物車操作 (登入用戶)
  const handleUpdateQuantity = async (id: string, quantity: number) => {
    try {
      const res = await fetch(`/api/carts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) throw new Error("Update failed");
      const json = await res.json();
      if (json.success) {
        fetchCart();
      }
    } catch {
      alert("更新數量失敗，請稍後再試");
    }
  };

  const handleRemoveItem = async (id: string) => {
    try {
      const res = await fetch(`/api/carts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      const json = await res.json();
      if (json.success) {
        fetchCart();
      }
    } catch {
      alert("移除商品失敗");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1d1d1f]" />
        <span className="ml-2 text-[#515154]">載入購物車...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[#1d1d1f] mb-4">
            發生錯誤
          </h1>
          <p className="text-[#515154] mb-8">{error}</p>
          <Button
            asChild
            className="rounded-full bg-[#0066cc] hover:bg-[#0055b3]"
          >
            <Link href="/">回首頁</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 訪客購物車
  if (isGuest) {
    const total = guestCart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const itemCount = guestCart.reduce((sum, item) => sum + item.quantity, 0);

    if (guestCart.length === 0) {
      return (
        <div className="min-h-screen bg-[#f5f5f7] flex flex-col justify-center items-center px-4">
          <div className="bg-white rounded-[28px] p-12 text-center max-w-md shadow-sm">
            <div className="w-24 h-24 bg-[#f5f5f7] rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="h-12 w-12 text-[#86868b]" />
            </div>
            <h1 className="text-2xl font-semibold text-[#1d1d1f] mb-3">
              您的購物車是空的
            </h1>
            <p className="text-[#515154] mb-8 leading-relaxed">
              看來您還沒加入任何商品，趕快去逛逛吧！
            </p>
            <Button
              size="lg"
              asChild
              className="rounded-full bg-[#0066cc] hover:bg-[#0055b3] px-10 h-12 text-base"
            >
              <Link href="/products">前往購物</Link>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#f5f5f7] py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-semibold text-[#1d1d1f]">購物車</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearGuestCart}
              className="text-[#515154] hover:text-[#ff3b30]"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              清空購物車
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Guest Cart Items */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-[20px] overflow-hidden shadow-sm">
                {guestCart.map((item, index) => (
                  <div
                    key={`${item.productId}-${item.variantId || ""}`}
                    className={`flex items-center gap-5 p-6 ${index < guestCart.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    {/* 商品圖片 - 120×120 */}
                    <Link
                      href={`/products/${item.productId}`}
                      className="shrink-0"
                    >
                      <div className="w-[120px] h-[120px] bg-[#f5f5f7] rounded-[16px] overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.productName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="h-10 w-10 text-[#c7c7c9]" />
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* 商品資訊 */}
                    <div className="flex-1 min-w-0">
                      <Link href={`/products/${item.productId}`}>
                        <h3 className="font-medium text-[#1d1d1f] text-lg hover:text-[#0066cc] transition-colors line-clamp-2">
                          {item.productName}
                        </h3>
                      </Link>
                      <p className="text-[#515154] mt-1">
                        單價：NT$ {item.price.toLocaleString()}
                      </p>

                      {/* 數量控制 - 藥片形狀 */}
                      <div className="flex items-center gap-1 mt-3">
                        <div className="inline-flex items-center bg-[#f5f5f7] rounded-full p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white/80 text-[#1d1d1f]"
                            onClick={() =>
                              handleGuestUpdateQuantity(
                                item.productId,
                                Math.max(1, item.quantity - 1),
                              )
                            }
                          >
                            <span className="text-lg">−</span>
                          </Button>
                          <span className="w-10 text-center font-medium text-[#1d1d1f]">
                            {item.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white/80 text-[#1d1d1f]"
                            onClick={() =>
                              handleGuestUpdateQuantity(
                                item.productId,
                                item.quantity + 1,
                              )
                            }
                          >
                            <span className="text-lg">+</span>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* 小計 + 刪除 */}
                    <div className="text-right flex flex-col items-end gap-2">
                      <p className="text-lg font-semibold text-[#1d1d1f]">
                        NT$ {(item.price * item.quantity).toLocaleString()}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#86868b] hover:text-[#ff3b30] hover:bg-transparent p-0 h-auto"
                        onClick={() => handleGuestRemoveItem(item.productId)}
                      >
                        <span className="text-sm">移除</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 bg-white rounded-[20px] p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-[#1d1d1f] mb-5">
                  訂單摘要
                </h2>

                <div className="space-y-3 mb-5">
                  <div className="flex justify-between text-[15px]">
                    <span className="text-[#515154]">
                      小計 ({itemCount} 件商品)
                    </span>
                    <span className="text-[#1d1d1f] font-medium">
                      NT$ {total.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[15px]">
                    <span className="text-[#515154]">運費</span>
                    <span className="text-[#34c759] font-medium">免運費</span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-5 mb-6">
                  <div className="flex justify-between">
                    <span className="text-lg font-semibold text-[#1d1d1f]">
                      總計
                    </span>
                    <span className="text-xl font-bold text-[#1d1d1f]">
                      NT$ {total.toLocaleString()}
                    </span>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full rounded-full bg-[#0066cc] hover:bg-[#0055b3] h-12 text-base font-medium"
                  asChild
                >
                  <Link href="/checkout">前往結帳</Link>
                </Button>

                <p className="text-xs text-[#86868b] text-center mt-4">
                  您目前使用訪客模式購物
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 登入用戶購物車 (原有邏輯)
  if (!cart || cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col justify-center items-center px-4">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
          <ShoppingBag className="h-10 w-10 text-[#86868b]" />
        </div>
        <h1 className="text-2xl font-semibold text-[#1d1d1f] mb-2">
          您的購物車是空的
        </h1>
        <p className="text-[#515154] mb-8 max-w-md text-center">
          看來您還沒加入任何商品，趕快去逛逛吧！
        </p>
        <Button
          size="lg"
          asChild
          className="rounded-full bg-[#0066cc] hover:bg-[#0055b3] px-8"
        >
          <Link href="/products">前往購物</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] py-8 md:py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <h1 className="text-3xl font-semibold text-[#1d1d1f] mb-8">購物車</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-[20px] px-6">
              {cart.items.map((item) => (
                <CartItem
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdateQuantity}
                  onRemove={handleRemoveItem}
                />
              ))}
            </div>
          </div>

          {/* Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <CartSummary
                total={cart.total}
                itemCount={cart.itemCount}
                currency={cart.currency}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
