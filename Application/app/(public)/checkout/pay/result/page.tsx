"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";

/**
 * 付款結果狀態
 */
type PaymentResult = "loading" | "paid" | "pending" | "failed";

/**
 * 付款結果頁面
 *
 * 金流閘道（NewebPay / ECPay / Stripe）完成後會 redirect 到此頁。
 * 透過查詢訂單付款狀態來顯示結果。
 *
 * 注意：金流回調 (notify) 是 server-to-server，可能比 redirect 慢，
 * 所以初次載入可能還是 PENDING，需要輪詢幾次。
 */
export default function PaymentResultPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const email = searchParams.get("email");

  const [result, setResult] = useState<PaymentResult>("loading");
  const [orderNo, setOrderNo] = useState("");
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!orderId) {
      setResult("failed");
      return;
    }

    checkPaymentStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /**
   * 輪詢付款狀態（最多 10 次，每次間隔 2 秒）
   */
  async function checkPaymentStatus() {
    const MAX_POLLS = 10;
    const POLL_INTERVAL = 2000;

    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const statusUrl = email
          ? `/api/orders/${orderId}/status?email=${encodeURIComponent(email)}`
          : `/api/orders/${orderId}/status`;
        const res = await fetch(statusUrl);
        if (!res.ok) {
          // 如果 API 不存在或錯誤，直接顯示 pending
          setResult("pending");
          return;
        }

        const json = await res.json();
        const paymentStatus = json.data?.paymentStatus;
        setOrderNo(json.data?.orderNo || "");

        if (paymentStatus === "PAID") {
          setResult("paid");
          return;
        }

        if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED") {
          setResult("failed");
          return;
        }

        // 還在 PENDING / INITIATED → 繼續等
        setPollCount(i + 1);
      } catch {
        // 網路錯誤，繼續重試
      }

      if (i < MAX_POLLS - 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      }
    }

    // 輪詢結束仍為 PENDING
    setResult("pending");
  }

  if (result === "loading") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#1d1d1f]" />
        <p className="text-lg text-[#6e6e73]">正在確認付款結果...</p>
        {pollCount > 0 && (
          <p className="text-sm text-[#86868b]">
            等待金流回報中 ({pollCount}/10)
          </p>
        )}
      </div>
    );
  }

  if (result === "paid") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold text-[#1d1d1f]">付款成功！</h1>
          <p className="text-[#6e6e73]">感謝您的購買，訂單已確認。</p>
          {orderNo && (
            <div className="bg-[#f5f5f7] rounded-lg p-3">
              <span className="text-sm text-[#86868b]">訂單編號</span>
              <p className="text-lg font-mono font-semibold text-[#1d1d1f]">{orderNo}</p>
            </div>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/"
              className="w-full py-3 bg-[#1d1d1f] text-white rounded-xl font-medium hover:bg-[#424245] transition-colors inline-block text-center"
            >
              繼續購物
            </Link>
            <Link
              href="/orders/lookup"
              className="w-full py-3 border border-[#d2d2d7] text-[#1d1d1f] rounded-xl font-medium hover:bg-[#f5f5f7] transition-colors inline-block text-center"
            >
              查詢訂單
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (result === "pending") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <Clock className="h-16 w-16 text-yellow-500 mx-auto" />
          <h1 className="text-2xl font-bold text-[#1d1d1f]">付款處理中</h1>
          <p className="text-[#6e6e73]">
            您的付款正在處理中，金流系統確認後將自動更新訂單狀態。
          </p>
          {orderNo && (
            <div className="bg-[#f5f5f7] rounded-lg p-3">
              <span className="text-sm text-[#86868b]">訂單編號</span>
              <p className="text-lg font-mono font-semibold text-[#1d1d1f]">{orderNo}</p>
            </div>
          )}
          <p className="text-sm text-[#86868b]">
            通常付款確認需要 1-5 分鐘，您可以稍後在訂單查詢頁面確認狀態。
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/"
              className="w-full py-3 bg-[#1d1d1f] text-white rounded-xl font-medium hover:bg-[#424245] transition-colors inline-block text-center"
            >
              繼續購物
            </Link>
            <Link
              href="/orders/lookup"
              className="w-full py-3 border border-[#d2d2d7] text-[#1d1d1f] rounded-xl font-medium hover:bg-[#f5f5f7] transition-colors inline-block text-center"
            >
              查詢訂單狀態
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Failed
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <XCircle className="h-16 w-16 text-red-500 mx-auto" />
        <h1 className="text-2xl font-bold text-[#1d1d1f]">付款失敗</h1>
        <p className="text-[#6e6e73]">
          很抱歉，您的付款未能完成。請重新嘗試或選擇其他付款方式。
        </p>
        <div className="flex flex-col gap-2 pt-2">
          {orderId && (
            <Link
              href={`/checkout/pay?orderId=${orderId}`}
              className="w-full py-3 bg-[#1d1d1f] text-white rounded-xl font-medium hover:bg-[#424245] transition-colors inline-block text-center"
            >
              重新付款
            </Link>
          )}
          <Link
            href="/"
            className="w-full py-3 border border-[#d2d2d7] text-[#1d1d1f] rounded-xl font-medium hover:bg-[#f5f5f7] transition-colors inline-block text-center"
          >
            返回首頁
          </Link>
        </div>
      </div>
    </div>
  );
}
