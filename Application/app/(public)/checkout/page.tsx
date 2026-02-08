"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckoutForm,
  CheckoutFormData,
} from "@/components/checkout/CheckoutForm";
import { formatCurrency } from "@/lib/utils";
import { Loader2, LogIn, ShoppingBag, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { trackingEvents } from "@/components/tracking/tracking-scripts";
import { getSavedUtm } from "@/components/tracking/utm-persistence";

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
  const [cart, setCart] = useState<{ items: CartItem[]; total: number } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** @deprecated shopSlug 不再用於訂單建立，tenant 邊界改由 host 解析 */
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNo: string;
    isGuestOrder: boolean;
    guestEmail?: string;
  } | null>(null);
  /** 防止 begin_checkout 重複觸發 */
  const hasTrackedBeginCheckout = useRef(false);
  /** 防止 purchase 重複觸發（頁面重整） */
  const hasTrackedPurchase = useRef(false);

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
              total:
                Number(cartJson.data.total) ||
                cartJson.data.items.reduce(
                  (sum: number, item: any) =>
                    sum +
                    (item.unitPrice || Number(item.product?.price)) *
                      item.quantity,
                  0,
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
              total: guestItems.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0,
              ),
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
                items: [
                  {
                    productId: product.id,
                    quantity,
                    name: product.name,
                    price: Number(product.price),
                    imageUrl: product.coverImageUrl,
                  },
                ],
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

          // 追蹤 begin_checkout 事件（僅觸發一次）
          if (!hasTrackedBeginCheckout.current) {
            hasTrackedBeginCheckout.current = true;
            trackingEvents.beginCheckout({
              total: cartData.total,
              items: cartData.items.map((item) => ({
                id: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
              })),
            });
          }
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
      // 只送非空值，避免 "" 觸發 zod .email() 驗證失敗
      if (isGuest) {
        if (formData.guestEmail) orderPayload.guestEmail = formData.guestEmail;
        if (formData.guestPhone) orderPayload.guestPhone = formData.guestPhone;
        if (formData.guestName) orderPayload.guestName = formData.guestName;
        // [單店制] shopSlug 不再傳送，tenant 邊界改由 host 解析
      }

      // 附加 UTM 行銷歸因資料（若有）
      const utmData = getSavedUtm();
      if (utmData) {
        orderPayload.utmSource = utmData.utm_source;
        orderPayload.utmMedium = utmData.utm_medium;
        orderPayload.utmCampaign = utmData.utm_campaign;
        orderPayload.utmTerm = utmData.utm_term;
        orderPayload.utmContent = utmData.utm_content;
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

      // 追蹤 purchase 事件（去重：僅觸發一次）
      if (!hasTrackedPurchase.current && cart) {
        hasTrackedPurchase.current = true;
        trackingEvents.purchase({
          id: json.data.orderNo,
          total: cart.total,
          items: cart.items.map((item) => ({
            id: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        });
      }

      // 若需要付款 → 導向付款頁
      if (json.data.paymentRequired && json.data.id) {
        const payParams = new URLSearchParams({
          orderId: json.data.id,
          orderNo: json.data.orderNo,
        });
        if (formData.guestEmail) {
          payParams.set("email", formData.guestEmail);
        }
        window.location.href = `/checkout/pay?${payParams.toString()}`;
        return; // 不要 setIsSubmitting(false)，保持 loading 狀態
      }

      // 無需付款（未設定金流）→ 直接顯示成功
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
      <div className="min-h-screen bg-[#f5f5f7] flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1d1d1f]" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4">
        <div className="bg-white p-8 rounded-[20px] text-center max-w-md">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-[#ff3b30]" />
          </div>
          <h1 className="text-xl font-semibold text-[#1d1d1f] mb-4">{error}</h1>
          <Button
            asChild
            className="rounded-full bg-[#0066cc] hover:bg-[#0055b3] px-8"
            size="lg"
          >
            <Link href="/">回到首頁</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4 py-12">
        <div className="bg-white p-10 rounded-[20px] text-center max-w-md w-full">
          <div className="w-24 h-24 bg-[#e8f5e9] rounded-full flex items-center justify-center mx-auto mb-8">
            <ShoppingBag className="h-12 w-12 text-[#34c759]" />
          </div>

          <h1 className="text-2xl font-semibold text-[#1d1d1f] mb-4">
            訂單建立成功！
          </h1>
          <p className="text-[#515154] mb-8">
            感謝您的購買，您的訂單已經確認。
          </p>

          <div className="bg-[#f5f5f7] rounded-[12px] p-5 mb-8 text-left space-y-3">
            <div className="flex justify-between">
              <span className="text-[#515154]">訂單編號</span>
              <span className="font-mono font-semibold text-[#1d1d1f]">
                {orderSuccess.orderNo}
              </span>
            </div>
            {orderSuccess.isGuestOrder && orderSuccess.guestEmail && (
              <div className="flex justify-between flex-wrap gap-2">
                <span className="text-[#515154]">確認信箱</span>
                <span className="font-medium text-[#1d1d1f]">
                  {orderSuccess.guestEmail}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-[#0066cc] hover:bg-[#0055b3]"
            >
              <Link href="/">繼續購物</Link>
            </Button>
            {orderSuccess.isGuestOrder && (
              <Button
                variant="outline"
                asChild
                className="rounded-full border-gray-200"
              >
                <Link
                  href="/register"
                  className="flex items-center justify-center gap-2"
                >
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
    <div className="min-h-screen bg-[#f5f5f7] py-10 md:py-16">
      <div className="container mx-auto px-4 max-w-6xl">
        <h1 className="text-3xl md:text-4xl font-semibold mb-10 text-center text-[#1d1d1f]">
          結帳
        </h1>

        {/* Guest checkout notice */}
        {isGuest && (
          <div className="max-w-4xl mx-auto bg-[#fff9e6] rounded-[12px] p-4 mb-8 text-center">
            <p className="text-[#8a6d00] font-medium">
              👋 您目前以訪客身份結帳。
              <Link
                href="/login?callbackUrl=/checkout"
                className="underline font-semibold ml-1 hover:text-[#6b5500]"
              >
                登入帳號
              </Link>
              以便累積點數與查詢訂單。
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left: Form — 手機上排在訂單明細之後 */}
          <div className="lg:col-span-7 order-2 lg:order-1">
            <CheckoutForm
              onSubmit={handleCheckout}
              isSubmitting={isSubmitting}
              isGuest={isGuest}
            />
          </div>

          {/* Right: Summary — 手機上優先顯示 */}
          <div className="lg:col-span-5 order-1 lg:order-2">
            <div className="bg-white rounded-[20px] overflow-hidden lg:sticky lg:top-24">
              <div className="p-5 bg-[#f5f5f7] border-b border-gray-100">
                <h2 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-[#0066cc]" />
                  訂單明細
                </h2>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-4 max-h-[350px] overflow-y-auto">
                  {cart.items.map((item, index) => (
                    <div
                      key={item.productId + (item.variantId || "") + index}
                      className="flex gap-4 items-center"
                    >
                      <div className="w-[80px] h-[80px] rounded-[14px] bg-[#f5f5f7] overflow-hidden flex-shrink-0">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="h-8 w-8 text-[#c7c7c9]" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-[#1d1d1f] line-clamp-2">
                          {item.name}
                        </h4>
                        <div className="text-sm text-[#515154] mt-1">
                          數量: {item.quantity}
                        </div>
                      </div>
                      <div className="text-right font-medium text-[#1d1d1f]">
                        {formatCurrency(item.price * item.quantity)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-5 border-t border-gray-100 space-y-3">
                  <div className="flex justify-between text-[15px]">
                    <span className="text-[#515154]">小計</span>
                    <span className="text-[#1d1d1f] font-medium">
                      {formatCurrency(cart.total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[15px]">
                    <span className="text-[#515154]">運費</span>
                    <span className="text-[#34c759] font-medium">免運費</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-gray-100">
                    <span className="text-lg font-semibold text-[#1d1d1f]">
                      總金額
                    </span>
                    <span className="text-xl font-bold text-[#1d1d1f]">
                      {formatCurrency(cart.total)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#f5f5f7] text-xs text-center text-[#86868b] flex items-center justify-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                加密連線，安全支付
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
