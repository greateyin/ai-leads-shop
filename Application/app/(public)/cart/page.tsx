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

    // 載入訪客購物車 (localStorage)
    const loadGuestCart = () => {
        setIsGuest(true);
        try {
            const cartData = localStorage.getItem("guest_cart");
            if (cartData) {
                setGuestCart(JSON.parse(cartData));
            }
        } catch {
            console.error("Failed to load guest cart");
        }
        setIsLoading(false);
    };

    // 更新訪客購物車數量
    const handleGuestUpdateQuantity = (productId: string, quantity: number) => {
        const updatedCart = guestCart.map((item) =>
            item.productId === productId ? { ...item, quantity } : item
        );
        setGuestCart(updatedCart);
        localStorage.setItem("guest_cart", JSON.stringify(updatedCart));
        window.dispatchEvent(new Event("cart-updated"));
    };

    // 移除訪客購物車商品
    const handleGuestRemoveItem = (productId: string) => {
        const updatedCart = guestCart.filter((item) => item.productId !== productId);
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
            <div className="container mx-auto px-4 py-16 flex justify-center items-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">載入購物車...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-16 text-center">
                <h1 className="text-2xl font-bold mb-4">發生錯誤</h1>
                <p className="text-muted-foreground mb-8">{error}</p>
                <Button asChild>
                    <Link href="/">回首頁</Link>
                </Button>
            </div>
        );
    }

    // 訪客購物車
    if (isGuest) {
        const total = guestCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const itemCount = guestCart.reduce((sum, item) => sum + item.quantity, 0);

        if (guestCart.length === 0) {
            return (
                <div className="container mx-auto px-4 py-16 text-center min-h-[60vh] flex flex-col justify-center items-center">
                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                        <ShoppingBag className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">您的購物車是空的</h1>
                    <p className="text-muted-foreground mb-8 max-w-md">
                        看來您還沒加入任何商品，趕快去逛逛吧！
                    </p>
                    <Button size="lg" asChild>
                        <Link href="/products">前往購物</Link>
                    </Button>
                </div>
            );
        }

        return (
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">購物車</h1>
                    <Button variant="ghost" size="sm" onClick={handleClearGuestCart}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        清空購物車
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Guest Cart Items */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                            {guestCart.map((item) => (
                                <div
                                    key={`${item.productId}-${item.variantId || ""}`}
                                    className="flex items-center gap-4 p-4 border-b last:border-b-0"
                                >
                                    {/* 商品圖片佔位 */}
                                    <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center shrink-0">
                                        <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                                    </div>

                                    {/* 商品資訊 */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium truncate">{item.productName}</h3>
                                        <p className="text-primary font-semibold">
                                            NT$ {item.price.toLocaleString()}
                                        </p>
                                    </div>

                                    {/* 數量控制 */}
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() =>
                                                handleGuestUpdateQuantity(
                                                    item.productId,
                                                    Math.max(1, item.quantity - 1)
                                                )
                                            }
                                        >
                                            -
                                        </Button>
                                        <span className="w-8 text-center">{item.quantity}</span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() =>
                                                handleGuestUpdateQuantity(item.productId, item.quantity + 1)
                                            }
                                        >
                                            +
                                        </Button>
                                    </div>

                                    {/* 小計 */}
                                    <div className="text-right w-24">
                                        <p className="font-semibold">
                                            NT$ {(item.price * item.quantity).toLocaleString()}
                                        </p>
                                    </div>

                                    {/* 刪除 */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleGuestRemoveItem(item.productId)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Summary Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 bg-card rounded-lg border border-border p-6">
                            <h2 className="text-lg font-semibold mb-4">訂單摘要</h2>

                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        小計 ({itemCount} 件商品)
                                    </span>
                                    <span>NT$ {total.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">運費</span>
                                    <span className="text-green-600">免運費</span>
                                </div>
                            </div>

                            <div className="border-t pt-4 mb-6">
                                <div className="flex justify-between text-lg font-bold">
                                    <span>總計</span>
                                    <span className="text-primary">NT$ {total.toLocaleString()}</span>
                                </div>
                            </div>

                            <Button size="lg" className="w-full" asChild>
                                <Link href="/checkout">前往結帳</Link>
                            </Button>

                            <p className="text-xs text-muted-foreground text-center mt-4">
                                您目前使用訪客模式購物
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 登入用戶購物車 (原有邏輯)
    if (!cart || cart.items.length === 0) {
        return (
            <div className="container mx-auto px-4 py-16 text-center min-h-[60vh] flex flex-col justify-center items-center">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                    <ShoppingBag className="h-10 w-10 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold mb-2">您的購物車是空的</h1>
                <p className="text-muted-foreground mb-8 max-w-md">
                    看來您還沒加入任何商品，趕快去逛逛吧！
                </p>
                <Button size="lg" asChild>
                    <Link href="/products">前往購物</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <h1 className="text-3xl font-bold mb-8">購物車</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Cart Items List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-card rounded-lg border border-border px-6">
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
    );
}
