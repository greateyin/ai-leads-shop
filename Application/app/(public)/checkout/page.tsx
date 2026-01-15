"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckoutForm, CheckoutFormData } from "@/components/checkout/CheckoutForm";
import { formatCurrency } from "@/lib/utils";
import { Loader2, LogIn, ShoppingBag, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface CartItem {
    productId: string;
    variantId?: string;
    quantity: number;
    name: string;
    price: number;
    imageUrl?: string;
}

// Guest cart helper functions
const GUEST_CART_KEY = "guest_cart";

function getGuestCart(): CartItem[] {
    if (typeof window === "undefined") return [];
    try {
        const cart = localStorage.getItem(GUEST_CART_KEY);
        return cart ? JSON.parse(cart) : [];
    } catch {
        return [];
    }
}

function clearGuestCart() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(GUEST_CART_KEY);
}

export default function CheckoutPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [cart, setCart] = useState<{ items: CartItem[]; total: number } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shopSlug, setShopSlug] = useState<string | null>(null);
    const [isGuest, setIsGuest] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orderSuccess, setOrderSuccess] = useState<{
        orderNo: string;
        isGuestOrder: boolean;
        guestEmail?: string;
    } | null>(null);

    // Load Cart & Shop Info
    useEffect(() => {
        const init = async () => {
            try {
                let cartData: { items: CartItem[]; total: number } | null = null;
                let isAuthenticated = false;
                let shopData = null;

                // First, check if user is authenticated by trying the cart API
                const cartRes = await fetch("/api/carts");

                if (cartRes.ok) {
                    // User is authenticated
                    const cartJson = await cartRes.json();
                    if (cartJson.success && cartJson.data?.items?.length > 0) {
                        isAuthenticated = true;
                        cartData = {
                            items: cartJson.data.items.map((item: any) => ({
                                productId: item.productId,
                                variantId: item.variantId,
                                quantity: item.quantity,
                                name: item.product?.name || "商品",
                                price: item.unitPrice || Number(item.product?.price) || 0,
                                imageUrl: item.product?.coverImageUrl,
                            })),
                            total: Number(cartJson.data.total) || cartJson.data.items.reduce(
                                (sum: number, item: any) => sum + (item.unitPrice || Number(item.product?.price)) * item.quantity,
                                0
                            ),
                        };
                    }
                }

                // If not authenticated or cart is empty, check guest cart
                if (!cartData) {
                    const guestItems = getGuestCart();
                    if (guestItems.length > 0) {
                        cartData = {
                            items: guestItems,
                            total: guestItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
                        };
                        setIsGuest(true);
                    }
                }

                // Check for direct product checkout via URL params
                // Example: /checkout?productId=xxx&quantity=1
                const productId = searchParams.get("productId");
                const quantity = parseInt(searchParams.get("quantity") || "1", 10);

                if (productId && !cartData) {
                    // Fetch product info using public endpoint (no auth required)
                    const productRes = await fetch(`/api/products/${productId}/public`);
                    if (productRes.ok) {
                        const productJson = await productRes.json();
                        if (productJson.success) {
                            const product = productJson.data;
                            cartData = {
                                items: [{
                                    productId: product.id,
                                    quantity,
                                    name: product.name,
                                    price: Number(product.price),
                                    imageUrl: product.coverImageUrl,
                                }],
                                total: Number(product.price) * quantity,
                            };
                            setIsGuest(true);
                        }
                    }
                }

                // Get shop info
                const publicShopRes = await fetch("/api/shops/public");
                if (publicShopRes.ok) {
                    const publicShopJson = await publicShopRes.json();
                    if (publicShopJson.success) {
                        shopData = publicShopJson.data;
                        setShopSlug(shopData.slug);
                    }
                }

                // If no shop from public endpoint, try authenticated
                if (!shopData) {
                    const shopsRes = await fetch("/api/shops");
                    if (shopsRes.ok) {
                        const shopsJson = await shopsRes.json();
                        if (shopsJson.success && shopsJson.data.length > 0) {
                            shopData = shopsJson.data[0];
                            setShopSlug(shopData.slug);
                            isAuthenticated = true;
                        }
                    }
                }

                setIsGuest(!isAuthenticated);

                if (!cartData || cartData.items.length === 0) {
                    setError("購物車是空的，請先加入商品");
                } else {
                    setCart(cartData);
                }

            } catch (err) {
                console.error(err);
                setError("載入購物車時發生錯誤");
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, [router, searchParams]);

    const handleCheckout = async (formData: CheckoutFormData) => {
        if (!cart || cart.items.length === 0) {
            alert("購物車是空的");
            return;
        }

        setIsSubmitting(true);
        try {
            // Build order payload
            const orderPayload: Record<string, unknown> = {
                items: cart.items.map((item) => ({
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: item.quantity,
                })),
                shippingAddress: formData.shippingAddress,
            };

            // Add guest fields if guest checkout
            if (isGuest) {
                orderPayload.guestEmail = formData.guestEmail;
                orderPayload.guestPhone = formData.guestPhone;
                orderPayload.guestName = formData.guestName;
                if (shopSlug) {
                    orderPayload.shopSlug = shopSlug;
                }
            }

            // Create order directly via POST /api/orders
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orderPayload),
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error?.message || "結帳失敗");
            }

            // Clear cart after successful order
            if (isGuest) {
                clearGuestCart();
            } else {
                await fetch("/api/carts", { method: "DELETE" });
            }

            // Show success state
            setOrderSuccess({
                orderNo: json.data.orderNo,
                isGuestOrder: json.data.isGuestOrder || isGuest,
                guestEmail: json.data.guestEmail || formData.guestEmail,
            });

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "結帳發生錯誤";
            alert(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="container mx-auto px-4 py-16 max-w-xl text-center">
                <div className="bg-red-50 dark:bg-red-950/20 p-8 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-4">
                        {error}
                    </h1>
                    <Button asChild className="mt-4">
                        <Link href="/">回到首頁</Link>
                    </Button>
                </div>
            </div>
        );
    }

    // Success state
    if (orderSuccess) {
        return (
            <div className="container mx-auto px-4 py-16 max-w-xl text-center">
                <div className="bg-green-50 dark:bg-green-950/20 p-8 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShoppingBag className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-4">
                        訂單建立成功！
                    </h1>
                    <p className="text-lg mb-2">訂單編號：<span className="font-mono font-bold">{orderSuccess.orderNo}</span></p>

                    {orderSuccess.isGuestOrder && orderSuccess.guestEmail && (
                        <p className="text-muted-foreground mb-6">
                            訂單確認信已發送至 <span className="font-medium">{orderSuccess.guestEmail}</span>
                        </p>
                    )}

                    <div className="flex flex-col gap-3 mt-8">
                        <Button asChild>
                            <Link href="/">繼續購物</Link>
                        </Button>
                        {orderSuccess.isGuestOrder && (
                            <Button variant="outline" asChild>
                                <Link href="/register" className="flex items-center gap-2">
                                    <LogIn className="h-4 w-4" />
                                    註冊帳號以追蹤訂單
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (!cart) return null;

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <h1 className="text-3xl font-bold mb-8 text-center">結帳</h1>

            {/* Guest checkout notice */}
            {isGuest && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-8 text-center">
                    <p className="text-amber-800 dark:text-amber-200">
                        您目前以訪客身份結帳。
                        <Link href="/login?callbackUrl=/checkout" className="underline font-medium ml-1">
                            登入帳號
                        </Link>
                        以便追蹤訂單。
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Left: Form */}
                <div>
                    <CheckoutForm
                        onSubmit={handleCheckout}
                        isSubmitting={isSubmitting}
                        isGuest={isGuest}
                    />
                </div>

                {/* Right: Summary */}
                <div className="bg-muted/30 p-6 rounded-lg h-fit border">
                    <h2 className="text-xl font-semibold mb-4">訂單明細</h2>
                    <div className="space-y-4 mb-6">
                        {cart.items.map((item, index) => (
                            <div key={item.productId + (item.variantId || "") + index} className="flex justify-between text-sm">
                                <span>{item.name} x {item.quantity}</span>
                                <span>{formatCurrency(item.price * item.quantity)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t pt-4 flex justify-between font-bold text-lg">
                        <span>總金額</span>
                        <span>{formatCurrency(cart.total)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
