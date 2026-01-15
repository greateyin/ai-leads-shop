"use client";

import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

interface CartItemProps {
    item: {
        id: string;
        productId: string;
        variantId?: string | null;
        quantity: number;
        product: {
            name: string;
            coverImageUrl: string | null;
            price: number | string; // Handle Decimals as string/number
        };
        variant?: {
            name?: string;
            price: number | string;
        } | null;
    };
    onUpdate: (id: string, newQuantity: number) => Promise<void>;
    onRemove: (id: string) => Promise<void>;
    isLoading?: boolean;
}

export function CartItem({ item, onUpdate, onRemove, isLoading }: CartItemProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    const price = Number(item.variant?.price ?? item.product.price);
    const imageUrl = item.product.coverImageUrl || "/placeholder-image.jpg"; // Need a placeholder
    const variantName = item.variant?.name || (item.variantId ? "Standard" : undefined);

    const handleQuantityChange = async (delta: number) => {
        const newQuantity = item.quantity + delta;
        if (newQuantity < 1) return;

        setIsUpdating(true);
        try {
            await onUpdate(item.id, newQuantity);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleRemove = async () => {
        if (confirm("確定要移除此商品嗎？")) {
            setIsUpdating(true);
            try {
                await onRemove(item.id);
            } finally {
                setIsUpdating(false);
            }
        }
    };

    return (
        <div className="flex gap-4 py-6 border-b border-border last:border-0">
            <div className="relative w-24 h-24 flex-shrink-0 bg-muted rounded-md overflow-hidden">
                <Image
                    src={imageUrl}
                    alt={item.product.name}
                    fill
                    className="object-cover"
                />
            </div>

            <div className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start gap-2">
                    <div>
                        <h3 className="font-medium text-lg leading-tight mb-1">
                            {item.product.name}
                        </h3>
                        {variantName && (
                            <p className="text-sm text-muted-foreground">{variantName}</p>
                        )}
                    </div>
                    <p className="font-medium whitespace-nowrap">
                        {formatCurrency(price * item.quantity)}
                    </p>
                </div>

                <div className="flex justify-between items-center mt-4">
                    <div className="flex items-center border border-input rounded-md max-w-[120px]">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-none border-r border-input hover:bg-muted"
                            onClick={() => handleQuantityChange(-1)}
                            disabled={isLoading || isUpdating || item.quantity <= 1}
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                        <div className="flex-1 text-center text-sm font-medium w-8">
                            {item.quantity}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-none border-l border-input hover:bg-muted"
                            onClick={() => handleQuantityChange(1)}
                            disabled={isLoading || isUpdating}
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemove}
                        disabled={isLoading || isUpdating}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        移除
                    </Button>
                </div>
            </div>
        </div>
    );
}
