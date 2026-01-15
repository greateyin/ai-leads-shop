"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export default function CheckoutPage() {
    const router = useRouter();
    const [cart, setCart] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shopId, setShopId] = useState<string | null>(null);

    // Load Cart & Shop Info
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Fetch Cart
                const cartRes = await fetch("/api/carts");
                if (!cartRes.ok) throw new Error("Failed to load cart");
                const cartJson = await cartRes.json();

                if (!cartJson.success || !cartJson.data || cartJson.data.items.length === 0) {
                    router.replace("/cart"); // Redirect empty cart
                    return;
                }
                setCart(cartJson.data);

                // 2. Get Shop ID for checkout
                // First try public endpoint (no auth required for guest checkout)
                let shopData = null;

                const publicShopRes = await fetch("/api/shops/public");
                if (publicShopRes.ok) {
                    const publicShopJson = await publicShopRes.json();
                    if (publicShopJson.success) {
                        shopData = publicShopJson.data;
                    }
                }

                // Fall back to authenticated endpoint if public fails
                if (!shopData) {
                    const shopsRes = await fetch("/api/shops");
                    if (shopsRes.status === 401) {
                        // User not authenticated and no public shop available
                        router.replace("/login?callbackUrl=/checkout");
                        return;
                    }
                    if (shopsRes.ok) {
                        const shopsJson = await shopsRes.json();
                        if (shopsJson.success && shopsJson.data.length > 0) {
                            shopData = shopsJson.data[0];
                        }
                    }
                }

                if (shopData) {
                    setShopId(shopData.id);
                }

            } catch (err) {
                console.error(err);
                router.push("/cart"); // Redirect on error
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, [router]);

    const handleCheckout = async (formData: any) => {
        if (!shopId) {
            alert("無法取得商店資訊，無法結帳");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch("/api/carts/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shopId,
                    shippingAddress: formData.shippingAddress,
                    billingAddress: formData.shippingAddress, // Use same for MVP
                }),
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error?.message || "結帳失敗");
            }

            // Success: Redirect to payment selection or thank you page
            // For MVP, redirect to Payment API flow logic or Orders page
            // Here we should probably call `POST /api/payments` to create a transaction immediately 
            // OR redirect to an Order Confirmation page where they can pay.
            // Let's redirect to Order Details page (if we had one) or just an interim success page.
            // Since we don't have an Order Page UI yet, I'll alert and redirect to /dashboard/orders (user view?)
            // Actually user view might be /orders/[id] ? 
            // Let's redirect to specific order page.
            // Wait, we don't have /orders page in public yet.
            // I'll redirect to a generic success page or back to home with success param.

            // Ideally: Router.push(`/orders/${json.data.orderId}`);
            // But page doesn't exist.
            alert(`訂單建立成功！單號：${json.data.orderNo}`);
            router.push("/");

        } catch (err: any) {
            alert(err.message || "結帳發生錯誤");
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

    if (!cart) return null;

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <h1 className="text-3xl font-bold mb-8 text-center">結帳</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Left: Form */}
                <div>
                    <CheckoutForm onSubmit={handleCheckout} isSubmitting={isSubmitting} />
                </div>

                {/* Right: Summary */}
                <div className="bg-muted/30 p-6 rounded-lg h-fit border">
                    <h2 className="text-xl font-semibold mb-4">訂單明細</h2>
                    <div className="space-y-4 mb-6">
                        {cart.items.map((item: any) => (
                            <div key={item.id} className="flex justify-between text-sm">
                                <span>{item.product.name} x {item.quantity}</span>
                                <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
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
