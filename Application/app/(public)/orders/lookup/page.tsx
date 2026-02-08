"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
}

interface OrderAddress {
    contactName: string;
    phone?: string;
    city: string;
    addressLine1: string;
}

interface OrderData {
    id: string;
    orderNo: string;
    status: string;
    paymentStatus: string;
    shippingStatus: string;
    totalAmount: number;
    shippingFee: number;
    currency: string;
    guestName?: string;
    createdAt: string;
    items: OrderItem[];
    addresses: OrderAddress[];
    shop: {
        name: string;
        slug: string;
    };
}

const statusLabels: Record<string, { label: string; color: string }> = {
    PENDING: { label: "待處理", color: "bg-yellow-100 text-yellow-800" },
    CONFIRMED: { label: "已確認", color: "bg-blue-100 text-blue-800" },
    PROCESSING: { label: "處理中", color: "bg-purple-100 text-purple-800" },
    SHIPPED: { label: "已出貨", color: "bg-indigo-100 text-indigo-800" },
    DELIVERED: { label: "已送達", color: "bg-green-100 text-green-800" },
    COMPLETED: { label: "已完成", color: "bg-green-100 text-green-800" },
    CANCELLED: { label: "已取消", color: "bg-red-100 text-red-800" },
    REFUNDED: { label: "已退款", color: "bg-gray-100 text-gray-800" },
};

const paymentStatusLabels: Record<string, { label: string; color: string }> = {
    PENDING: { label: "待付款", color: "text-yellow-600" },
    PAID: { label: "已付款", color: "text-green-600" },
    FAILED: { label: "付款失敗", color: "text-red-600" },
    REFUNDED: { label: "已退款", color: "text-gray-600" },
};

export default function OrderLookupPage() {
    const [email, setEmail] = useState("");
    const [orderNo, setOrderNo] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<OrderData | null>(null);
    const [shopSlug, setShopSlug] = useState<string | null>(null);

    // 取得當前商店 slug 以限定查詢範圍
    useEffect(() => {
        fetch("/api/shops/public")
            .then((res) => res.json())
            .then((data) => {
                if (data.success && data.data?.slug) {
                    setShopSlug(data.data.slug);
                }
            })
            .catch(() => {});
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setOrder(null);

        try {
            const response = await fetch("/api/orders/lookup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // [單店制] shopSlug 不再傳送，tenant 邊界改由 host 解析
                body: JSON.stringify({ email, orderNo }),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error?.message || "查詢失敗");
                return;
            }

            setOrder(data.data);
        } catch {
            setError("網路錯誤，請稍後再試");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">訂單查詢</h1>
                    <p className="text-gray-600">
                        輸入您的電子郵件和訂單編號以查詢訂單狀態
                    </p>
                </div>

                {/* Lookup Form */}
                <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                電子郵件
                            </label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="您下單時使用的電子郵件"
                                required
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="orderNo"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                訂單編號
                            </label>
                            <input
                                type="text"
                                id="orderNo"
                                value={orderNo}
                                onChange={(e) => setOrderNo(e.target.value.toUpperCase())}
                                placeholder="例如：ORD-XXXXXXXX-XXXXXX"
                                required
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
                            />
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {loading ? "查詢中..." : "查詢訂單"}
                        </button>
                    </form>
                </div>

                {/* Order Result */}
                {order && (
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                        {/* Order Header */}
                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 text-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm opacity-90">訂單編號</p>
                                    <p className="text-xl font-bold font-mono">{order.orderNo}</p>
                                </div>
                                <div
                                    className={`px-4 py-2 rounded-full text-sm font-medium ${statusLabels[order.status]?.color || "bg-gray-100 text-gray-800"}`}
                                >
                                    {statusLabels[order.status]?.label || order.status}
                                </div>
                            </div>
                        </div>

                        <div className="p-6">
                            {/* Status Row */}
                            <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <p className="text-sm text-gray-500">付款狀態</p>
                                    <p
                                        className={`font-medium ${paymentStatusLabels[order.paymentStatus]?.color || "text-gray-800"}`}
                                    >
                                        {paymentStatusLabels[order.paymentStatus]?.label ||
                                            order.paymentStatus}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">下單時間</p>
                                    <p className="font-medium">
                                        {new Date(order.createdAt).toLocaleDateString("zh-TW", {
                                            year: "numeric",
                                            month: "long",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                            </div>

                            {/* Order Items */}
                            <div className="mb-6">
                                <h3 className="font-semibold text-gray-900 mb-3">訂單明細</h3>
                                <div className="space-y-3">
                                    {order.items.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                                        >
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-sm text-gray-500">
                                                    單價 {order.currency} {item.unitPrice.toLocaleString()}{" "}
                                                    × {item.quantity}
                                                </p>
                                            </div>
                                            <p className="font-semibold">
                                                {order.currency} {item.subtotal.toLocaleString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Shipping Address */}
                            {order.addresses.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-semibold text-gray-900 mb-3">收件資訊</h3>
                                    <div className="p-4 bg-gray-50 rounded-lg">
                                        <p className="font-medium">
                                            {order.addresses[0].contactName}
                                        </p>
                                        {order.addresses[0].phone && (
                                            <p className="text-gray-600">{order.addresses[0].phone}</p>
                                        )}
                                        <p className="text-gray-600">
                                            {order.addresses[0].city} {order.addresses[0].addressLine1}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Total */}
                            <div className="border-t pt-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">運費</span>
                                    <span>
                                        {order.currency} {order.shippingFee.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center mt-2 text-xl font-bold">
                                    <span>總金額</span>
                                    <span className="text-blue-600">
                                        {order.currency} {order.totalAmount.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Back Link */}
                <div className="text-center mt-8">
                    <Link href="/" className="text-blue-600 hover:underline">
                        ← 返回首頁
                    </Link>
                </div>
            </div>
        </div>
    );
}
