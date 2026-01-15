"use client";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

interface CartSummaryProps {
    total: number;
    itemCount: number;
    currency?: string;
    className?: string;
    isCheckingOut?: boolean;
}

export function CartSummary({ total, itemCount, currency = "TWD", className, isCheckingOut }: CartSummaryProps) {
    return (
        <div className={`bg-card rounded-lg border border-border p-6 shadow-sm ${className}`}>
            <h2 className="text-xl font-semibold mb-4">訂單摘要</h2>

            <div className="space-y-3 mb-6">
                <div className="flex justify-between text-muted-foreground">
                    <span>商品總數</span>
                    <span>{itemCount} 件</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                    <span>運費</span>
                    <span>計算中</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between items-end">
                    <span className="font-medium text-lg">總計</span>
                    <span className="text-2xl font-bold text-primary">
                        {formatCurrency(total, currency)}
                    </span>
                </div>
            </div>

            <Button className="w-full text-base py-6" asChild>
                <Link href="/checkout">
                    前往結帳
                    <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
            </Button>

            <div className="mt-4 text-center">
                <Link href="/" className="text-sm text-muted-foreground hover:underline">
                    繼續購物
                </Link>
            </div>
        </div>
    );
}
