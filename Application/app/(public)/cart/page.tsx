"use client";

import { useEffect, useState } from "react";
import { CartItem } from "@/components/cart/CartItem";
import { CartSummary } from "@/components/cart/CartSummary";
import { Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface CartData {
    id: string;
    items: any[];
    total: number;
    itemCount: number;
    currency: string;
}

export default function CartPage() {
    const [cart, setCart] = useState<CartData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCart = async () => {
        try {
            const res = await fetch("/api/carts");
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = "/login?callbackUrl=/cart";
                    return;
                }
                throw new Error("Failed to fetch cart");
            }
            const json = await res.json();
            if (json.success) {
                setCart(json.data);
            } else {
                setError(json.error?.message || "無法載入購物車");
            }
        } catch (err) {
            console.error(err);
            setError("載入購物車時發生錯誤");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCart();
    }, []);

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
                // Optimistic update or refetch. Refetching for accuracy of totals.
                fetchCart();
            }
        } catch (err) {
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
        } catch (err) {
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
