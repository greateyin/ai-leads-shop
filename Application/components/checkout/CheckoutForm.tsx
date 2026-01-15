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
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* Guest Info Section */}
            {isGuest && (
                <div className="space-y-4 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold border-b border-blue-200 dark:border-blue-800 pb-2 flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        訪客資訊
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        請提供您的電子郵件，我們將發送訂單確認信給您。
                    </p>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="guestEmail" className="flex items-center gap-1">
                                <Mail className="h-4 w-4" />
                                電子郵件 <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="guestEmail"
                                type="email"
                                required
                                placeholder="your@email.com"
                                value={formData.guestEmail}
                                onChange={(e) => handleGuestChange("guestEmail", e.target.value)}
                                className="bg-white dark:bg-gray-900"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2 flex items-center gap-2">
                    <User className="h-5 w-5" />
                    收件人資訊
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            <Phone className="h-4 w-4" />
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

            <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">配送地址</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="pt-4">
                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            處理中...
                        </>
                    ) : (
                        isGuest ? "以訪客身份提交訂單" : "提交訂單"
                    )}
                </Button>
                {isGuest && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                        完成結帳後，您可以選擇註冊帳號以追蹤訂單狀態
                    </p>
                )}
            </div>
        </form>
    );
}
