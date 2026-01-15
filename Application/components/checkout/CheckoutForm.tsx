"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, User, Phone } from "lucide-react";

interface CheckoutFormProps {
    onSubmit: (data: CheckoutFormData) => Promise<void>;
    isSubmitting: boolean;
    isGuest?: boolean; // Whether this is a guest checkout
}

export interface CheckoutFormData {
    shippingAddress: {
        contactName: string;
        phone: string;
        addressLine1: string;
        addressLine2: string;
        city: string;
        postalCode: string;
        state: string;
        country: string;
    };
    // Guest checkout fields
    guestEmail?: string;
    guestPhone?: string;
    guestName?: string;
}

export function CheckoutForm({ onSubmit, isSubmitting, isGuest = false }: CheckoutFormProps) {
    const [formData, setFormData] = useState<CheckoutFormData>({
        shippingAddress: {
            contactName: "",
            phone: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            postalCode: "",
            state: "",
            country: "TW",
        },
        guestEmail: "",
        guestPhone: "",
        guestName: "",
    });

    const handleChange = (field: string, value: string) => {
        setFormData((prev) => ({
            ...prev,
            shippingAddress: {
                ...prev.shippingAddress,
                [field]: value,
            },
        }));
    };

    const handleGuestChange = (field: string, value: string) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Auto-populate guest fields from shipping address if not provided
        const submitData = { ...formData };
        if (isGuest) {
            if (!submitData.guestName) {
                submitData.guestName = formData.shippingAddress.contactName;
            }
            if (!submitData.guestPhone) {
                submitData.guestPhone = formData.shippingAddress.phone;
            }
        }
        onSubmit(submitData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in-up">
            {/* Guest Info Section */}
            {isGuest && (
                <div className="space-y-6 bg-secondary/30 p-6 rounded-2xl border border-border/50 backdrop-blur-sm">
                    <h3 className="text-xl font-bold flex items-center gap-3 text-primary">
                        <div className="p-2 bg-primary/10 rounded-full">
                            <Mail className="h-5 w-5" />
                        </div>
                        訪客資訊
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        請提供您的電子郵件，我們將發送訂單確認信給您。
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="guestEmail" className="flex items-center gap-1 font-medium">
                            電子郵件 <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="guestEmail"
                            type="email"
                            required
                            placeholder="your@email.com"
                            value={formData.guestEmail}
                            onChange={(e) => handleGuestChange("guestEmail", e.target.value)}
                            className="bg-background/80"
                        />
                    </div>
                </div>
            )}

            <div className="space-y-6">
                <h3 className="text-xl font-bold flex items-center gap-3 border-b pb-4">
                    <div className="p-2 bg-secondary rounded-full">
                        <User className="h-5 w-5 text-primary" />
                    </div>
                    收件人資訊
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="contactName">姓名 <span className="text-red-500">*</span></Label>
                        <Input
                            id="contactName"
                            required
                            placeholder="真實姓名"
                            value={formData.shippingAddress.contactName}
                            onChange={(e) => handleChange("contactName", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone" className="flex items-center gap-1">
                            聯絡電話 <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="phone"
                            required
                            placeholder="09xx-xxx-xxx"
                            value={formData.shippingAddress.phone}
                            onChange={(e) => handleChange("phone", e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <h3 className="text-xl font-bold flex items-center gap-3 border-b pb-4">
                    <div className="p-2 bg-secondary rounded-full">
                        <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    配送地址
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="postalCode">郵遞區號 <span className="text-red-500">*</span></Label>
                        <Input
                            id="postalCode"
                            required
                            placeholder="100"
                            value={formData.shippingAddress.postalCode}
                            onChange={(e) => handleChange("postalCode", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="city">城市 / 縣市 <span className="text-red-500">*</span></Label>
                        <Input
                            id="city"
                            required
                            placeholder="台北市"
                            value={formData.shippingAddress.city}
                            onChange={(e) => handleChange("city", e.target.value)}
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="addressLine1">詳細地址 <span className="text-red-500">*</span></Label>
                        <Input
                            id="addressLine1"
                            required
                            placeholder="街道、巷弄、門牌號碼"
                            value={formData.shippingAddress.addressLine1}
                            onChange={(e) => handleChange("addressLine1", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="addressLine2">備註 / 樓層 (選填)</Label>
                        <Input
                            id="addressLine2"
                            placeholder=""
                            value={formData.shippingAddress.addressLine2}
                            onChange={(e) => handleChange("addressLine2", e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="pt-8">
                <Button
                    type="submit"
                    size="lg"
                    variant="gradient"
                    className="w-full h-12 text-lg rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            處理中...
                        </>
                    ) : (
                        isGuest ? "以訪客身份提交訂單" : "提交訂單"
                    )}
                </Button>
                {isGuest && (
                    <p className="text-xs text-muted-foreground text-center mt-4">
                        完成結帳後，您可以選擇註冊帳號以追蹤訂單狀態
                    </p>
                )}
            </div>
        </form>
    );
}
