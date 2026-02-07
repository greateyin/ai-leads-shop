"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * 分類項目介面
 */
interface CategoryItem {
  /** 分類 ID */
  id: string;
  /** 分類名稱 */
  name: string;
  /** 分類 slug */
  slug: string;
  /** 該分類商品數量 */
  productCount: number;
}

/**
 * MobileFilterDrawer 元件的 Props
 */
interface MobileFilterDrawerProps {
  /** 分類列表 */
  categories: CategoryItem[];
  /** 商品總數 */
  totalProducts: number;
}

/**
 * 手機版篩選抽屜元件
 * 僅在 <768px 時顯示觸發按鈕
 * 使用 bottom sheet 樣式呈現分類與搜尋
 */
export function MobileFilterDrawer({
  categories,
  totalProducts,
}: MobileFilterDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get("category") || "";
  const currentSearch = searchParams.get("search") || "";

  return (
    <>
      {/* 觸發按鈕 - 僅手機版 */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        篩選
        {currentCategory && (
          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
            1
          </span>
        )}
      </button>

      {/* 遮罩 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 底部抽屜 */}
      <div
        className={`fixed bottom-0 inset-x-0 z-50 lg:hidden bg-white rounded-t-2xl shadow-2xl transform transition-transform duration-300 ease-out max-h-[80vh] flex flex-col ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* 抽屜把手 */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 標題列 */}
        <div className="flex items-center justify-between px-5 pb-3 border-b">
          <h3 className="font-bold text-lg">篩選商品</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 搜尋 */}
        <div className="px-5 py-4 border-b">
          <form action="/products" method="get">
            {currentCategory && (
              <input type="hidden" name="category" value={currentCategory} />
            )}
            <div className="relative">
              <input
                type="text"
                name="search"
                defaultValue={currentSearch}
                placeholder="搜尋商品..."
                className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </form>
        </div>

        {/* 分類列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            商品分類
          </h4>
          <ul className="space-y-1">
            <li>
              <Link
                href="/products"
                onClick={() => setIsOpen(false)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  !currentCategory
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "hover:bg-gray-50"
                }`}
              >
                <span>全部商品</span>
                <span className="text-xs text-gray-400">{totalProducts}</span>
              </Link>
            </li>
            {categories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={`/products?category=${cat.slug}`}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    currentCategory === cat.slug
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="text-xs text-gray-400">{cat.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* 底部安全區 */}
        <div className="px-5 py-4 border-t safe-area-bottom">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            查看結果
          </button>
        </div>
      </div>
    </>
  );
}
