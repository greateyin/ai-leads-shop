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
            <div className="container mx-auto px-4 py-20 max-w-xl text-center min-h-[60vh] flex flex-col justify-center animate-fade-in">
                <div className="bg-card p-8 rounded-3xl border border-red-200/50 shadow-2xl shadow-red-500/10 dark:border-red-800/50">
                    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-4">
                        {error}
                    </h1>
                    <Button asChild className="mt-6 rounded-full" size="lg">
                        <Link href="/">回到首頁</Link>
                    </Button>
                </div>
            </div>
        );
    }

    // Success state
    if (orderSuccess) {
        return (
            <div className="container mx-auto px-4 py-20 max-w-xl text-center min-h-[60vh] flex flex-col justify-center animate-fade-in-up">
                <div className="bg-card p-10 rounded-3xl border border-border/50 shadow-2xl shadow-primary/10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-accent"></div>

                    <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
                        <ShoppingBag className="h-12 w-12 text-green-600 dark:text-green-400" />
                    </div>

                    <h1 className="text-3xl font-bold text-foreground mb-4">
                        訂單建立成功！
                    </h1>
                    <p className="text-muted-foreground text-lg mb-8">
                        感謝您的購買，您的訂單已經確認。
                    </p>

                    <div className="bg-secondary/30 rounded-xl p-6 mb-8 text-left space-y-3">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">訂單編號</span>
                            <span className="font-mono font-bold text-primary">{orderSuccess.orderNo}</span>
                        </div>
                        {orderSuccess.isGuestOrder && orderSuccess.guestEmail && (
                            <div className="flex justify-between flex-wrap gap-2">
                                <span className="text-muted-foreground">確認信箱</span>
                                <span className="font-medium">{orderSuccess.guestEmail}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <Button asChild size="lg" variant="gradient" className="rounded-full shadow-lg hover:shadow-primary/25">
                            <Link href="/">繼續購物</Link>
                        </Button>
                        {orderSuccess.isGuestOrder && (
                            <Button variant="outline" asChild className="rounded-full border-2">
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
        <div className="container mx-auto px-4 py-12 md:py-20 max-w-6xl min-h-screen">
            <h1 className="text-4xl md:text-5xl font-bold mb-12 text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent animate-fade-in-up">
                結帳
            </h1>

            {/* Guest checkout notice */}
            {isGuest && (
                <div className="max-w-4xl mx-auto bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-800/50 rounded-2xl p-4 mb-10 text-center animate-fade-in backdrop-blur-sm">
                    <p className="text-amber-800 dark:text-amber-200 font-medium">
                        👋 您目前以訪客身份結帳。
                        <Link href="/login?callbackUrl=/checkout" className="underline font-bold ml-1 hover:text-amber-600">
                            登入帳號
                        </Link>
                        以便累積點數與查詢訂單。
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
                {/* Left: Form */}
                <div className="lg:col-span-7 lg:sticky lg:top-24">
                    <CheckoutForm
                        onSubmit={handleCheckout}
                        isSubmitting={isSubmitting}
                        isGuest={isGuest}
                    />
                </div>

                {/* Right: Summary */}
                <div className="lg:col-span-5 animate-fade-in opacity-0 [animation-delay:200ms]">
                    <div className="bg-card rounded-3xl shadow-xl shadow-muted/60 border border-border/50 overflow-hidden sticky top-24">
                        <div className="p-6 bg-secondary/30 border-b border-border/50">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <ShoppingBag className="h-5 w-5 text-primary" />
                                訂單明細
                            </h2>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {cart.items.map((item, index) => (
                                    <div key={item.productId + (item.variantId || "") + index} className="flex gap-4 items-start group">
                                        <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden flex-shrink-0 border border-border">
                                            {item.imageUrl ? (
                                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">無圖</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">{item.name}</h4>
                                            <div className="text-xs text-muted-foreground mt-1">數量: {item.quantity}</div>
                                        </div>
                                        <div className="text-right font-medium text-sm">
                                            {formatCurrency(item.price * item.quantity)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-6 border-t border-border border-dashed space-y-3">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>小計</span>
                                    <span>{formatCurrency(cart.total)}</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>運費</span>
                                    <span>免運費</span>
                                </div>
                                <div className="flex justify-between font-bold text-2xl pt-2 text-primary">
                                    <span>總金額</span>
                                    <span>{formatCurrency(cart.total)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-secondary/20 text-xs text-center text-muted-foreground border-t border-border/50">
                            加密連線，安全支付
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
