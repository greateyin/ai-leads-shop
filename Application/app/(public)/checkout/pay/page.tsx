"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, CreditCard } from "lucide-react";

/**
 * 付款頁面
 *
 * 流程：
 * 1. 從 URL 取得 orderId + email
 * 2. 呼叫 POST /api/orders/[orderId]/pay 取得金流表單資料
 * 3. 渲染 hidden form → auto-submit 到金流閘道
 *
 * 支援的金流回傳類型：
 * - form_redirect: NewebPay / ECPay（表單 POST 到閘道）
 * - redirect: Stripe（直接 redirect）
 */
export default function PaymentPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const email = searchParams.get("email");
  const orderNo = searchParams.get("orderNo");

  const [status, setStatus] = useState<"loading" | "submitting" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  /** 防止重複提交 */
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (!orderId) {
      setStatus("error");
      setErrorMessage("缺少訂單資訊");
      return;
    }

    if (hasSubmitted.current) return;
    hasSubmitted.current = true;

    initPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /**
   * 初始化付款：呼叫 API 取得金流表單 → 自動提交
   */
  async function initPayment() {
    try {
      const resultParams = new URLSearchParams({ orderId: orderId! });
      if (email) resultParams.set("email", email);
      const returnUrl = `${window.location.origin}/checkout/pay/result?${resultParams.toString()}`;

      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          returnUrl,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "付款初始化失敗");
      }

      const { data } = json;

      // Stripe: 直接 redirect
      if (data.type === "redirect" && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      // NewebPay / ECPay: 渲染表單並自動提交
      if (data.type === "form_redirect" && data.actionUrl && data.fields) {
        setStatus("submitting");

        // 等 React 渲染完 form 後再提交
        setTimeout(() => {
          if (formRef.current) {
            formRef.current.action = data.actionUrl;
            formRef.current.method = "POST";

            // 清空舊的 hidden inputs
            formRef.current.innerHTML = "";

            // 動態建立 hidden inputs
            for (const [key, value] of Object.entries(data.fields as Record<string, string>)) {
              const input = document.createElement("input");
              input.type = "hidden";
              input.name = key;
              input.value = value;
              formRef.current.appendChild(input);
            }

            formRef.current.submit();
          }
        }, 100);
        return;
      }

      throw new Error("未知的付款類型");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "付款初始化失敗");
    }
  }

  // 載入中
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#1d1d1f]" />
        <p className="text-lg text-[#6e6e73]">正在連接付款系統...</p>
        <p className="text-sm text-[#86868b]">
          訂單編號: {orderNo || orderId?.slice(0, 8)}
        </p>
      </div>
    );
  }

  // 正在提交到金流
  if (status === "submitting") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <CreditCard className="h-12 w-12 text-[#1d1d1f]" />
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 absolute -bottom-1 -right-1" />
        </div>
        <p className="text-lg text-[#1d1d1f] font-medium">正在導向付款頁面...</p>
        <p className="text-sm text-[#86868b]">請勿關閉此視窗</p>
        {/* 隱藏表單：由 JS 動態填入欄位後 auto-submit */}
        <form ref={formRef} style={{ display: "none" }} />
      </div>
    );
  }

  // 錯誤
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-semibold text-[#1d1d1f]">付款初始化失敗</h2>
        <p className="text-[#6e6e73]">{errorMessage}</p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => {
              hasSubmitted.current = false;
              setStatus("loading");
              initPayment();
            }}
            className="w-full py-3 bg-[#1d1d1f] text-white rounded-xl font-medium hover:bg-[#424245] transition-colors"
          >
            重試付款
          </button>
          <a
            href="/"
            className="w-full py-3 border border-[#d2d2d7] text-[#1d1d1f] rounded-xl font-medium hover:bg-[#f5f5f7] transition-colors inline-block"
          >
            返回首頁
          </a>
        </div>
      </div>
    </div>
  );
}
