"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface CheckoutFormProps {
    onSubmit: (data: any) => Promise<void>;
    isSubmitting: boolean;
}

export function CheckoutForm({ onSubmit, isSubmitting }: CheckoutFormProps) {
    const [formData, setFormData] = useState({
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
        // Future: billingAddress
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">收件人資訊</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="contactName">姓名</Label>
                        <Input
                            id="contactName"
                            required
                            placeholder="真實姓名"
                            value={formData.shippingAddress.contactName}
                            onChange={(e) => handleChange("contactName", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">聯絡電話</Label>
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
                        <Label htmlFor="postalCode">郵遞區號</Label>
                        <Input
                            id="postalCode"
                            required
                            placeholder="100"
                            value={formData.shippingAddress.postalCode}
                            onChange={(e) => handleChange("postalCode", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="city">城市 / 縣市</Label>
                        <Input
                            id="city"
                            required
                            placeholder="台北市"
                            value={formData.shippingAddress.city}
                            onChange={(e) => handleChange("city", e.target.value)}
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="addressLine1">詳細地址</Label>
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
                        "提交訂單"
                    )}
                </Button>
            </div>
        </form>
    );
}
