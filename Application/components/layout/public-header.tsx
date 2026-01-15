"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Menu, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PublicHeader() {
    const [cartCount, setCartCount] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // 計算購物車數量
    const updateCartCount = () => {
        try {
            const cartData = localStorage.getItem("guest_cart");
            if (cartData) {
                const cart = JSON.parse(cartData);
                const count = cart.reduce(
                    (sum: number, item: { quantity: number }) => sum + item.quantity,
                    0
                );
                setCartCount(count);
            } else {
                setCartCount(0);
            }
        } catch {
            setCartCount(0);
        }
    };

    useEffect(() => {
        updateCartCount();

        // 監聽購物車更新事件
        const handleCartUpdate = () => updateCartCount();
        window.addEventListener("cart-updated", handleCartUpdate);
        window.addEventListener("storage", handleCartUpdate);

        return () => {
            window.removeEventListener("cart-updated", handleCartUpdate);
            window.removeEventListener("storage", handleCartUpdate);
        };
    }, []);

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center space-x-2">
                    <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        AIsell
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center space-x-6">
                    <Link
                        href="/products"
                        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        商品
                    </Link>
                    <Link
                        href="/orders/lookup"
                        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        訂單查詢
                    </Link>
                </nav>

                {/* Right Side Actions */}
                <div className="flex items-center space-x-4">
                    {/* Cart Icon */}
                    <Link href="/cart" className="relative">
                        <Button variant="ghost" size="icon" className="relative">
                            <ShoppingCart className="h-5 w-5" />
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                                    {cartCount > 99 ? "99+" : cartCount}
                                </span>
                            )}
                        </Button>
                    </Link>

                    {/* Login Button */}
                    <Link href="/login" className="hidden md:block">
                        <Button variant="outline" size="sm">
                            <User className="h-4 w-4 mr-2" />
                            登入
                        </Button>
                    </Link>

                    {/* Mobile Menu Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMenuOpen && (
                <div className="md:hidden border-t bg-background">
                    <nav className="container py-4 space-y-2">
                        <Link
                            href="/products"
                            className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            商品
                        </Link>
                        <Link
                            href="/orders/lookup"
                            className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            訂單查詢
                        </Link>
                        <Link
                            href="/cart"
                            className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            購物車 {cartCount > 0 && `(${cartCount})`}
                        </Link>
                        <Link
                            href="/login"
                            className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            登入
                        </Link>
                    </nav>
                </div>
            )}
        </header>
    );
}
