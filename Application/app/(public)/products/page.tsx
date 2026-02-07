import { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { TrackViewItemList } from "@/components/tracking/track-view-item-list";
import { ProductSortBar } from "@/components/product/product-sort-bar";
import { MobileFilterDrawer } from "@/components/product/mobile-filter-drawer";

export const metadata: Metadata = {
    title: "商品列表",
    description: "瀏覽我們的精選商品",
};

interface Product {
    id: string;
    name: string;
    slug: string;
    summary: string | null;
    price: number;
    stock: number;
    coverImageUrl: string | null;
    categories: { id: string; name: string; slug: string }[];
}

interface Category {
    id: string;
    name: string;
    slug: string;
    productCount: number;
}

/**
 * 排序參數對應 Prisma orderBy
 */
function getSortOrder(sort?: string): Record<string, "asc" | "desc"> {
    switch (sort) {
        case "price_asc":
            return { price: "asc" };
        case "price_desc":
            return { price: "desc" };
        case "name_asc":
            return { name: "asc" };
        case "newest":
        default:
            return { createdAt: "desc" };
    }
}

/**
 * 取得商品列表（含分類、排序、分頁、搜尋）
 * tenantId 確保租戶隔離，不會顯示其他租戶的商品
 */
async function getProducts(
    searchParams: {
        category?: string;
        page?: string;
        search?: string;
        sort?: string;
    },
    tenantId?: string
) {
    const page = parseInt(searchParams.page || "1");
    const limit = 12;
    const category = searchParams.category;
    const search = searchParams.search;
    const orderBy = getSortOrder(searchParams.sort);

    const where = {
        status: "PUBLISHED" as const,
        deletedAt: null,
        // Tenant 隔離：僅查詢當前租戶的商品
        ...(tenantId && { tenantId }),
        ...(category && {
            categories: {
                some: {
                    category: {
                        slug: category,
                    },
                },
            },
        }),
        ...(search && {
            OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { summary: { contains: search, mode: "insensitive" as const } },
            ],
        }),
    };

    const [products, total, categories] = await Promise.all([
        db.product.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy,
            select: {
                id: true,
                name: true,
                slug: true,
                summary: true,
                price: true,
                stock: true,
                coverImageUrl: true,
                categories: {
                    select: {
                        category: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
            },
        }),
        db.product.count({ where }),
        db.productCategory.findMany({
            where: {
                // Tenant 隔離：僅查詢當前租戶的分類
                ...(tenantId && { tenantId }),
                products: {
                    some: {
                        product: {
                            status: "PUBLISHED",
                            deletedAt: null,
                            ...(tenantId && { tenantId }),
                        },
                    },
                },
            },
            select: {
                id: true,
                name: true,
                slug: true,
                _count: { select: { products: true } },
            },
            orderBy: { name: "asc" },
        }),
    ]);

    return {
        products: products.map((p) => ({
            ...p,
            price: Number(p.price),
            categories: p.categories.map((c) => c.category),
        })) as Product[],
        categories: categories.map((c) => ({
            ...c,
            productCount: c._count.products,
        })) as Category[],
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export default async function ProductsPage({
    searchParams,
}: {
    searchParams: Promise<{ category?: string; page?: string; search?: string; sort?: string }>;
}) {
    const params = await searchParams;

    // 解析當前租戶（tenant 隔離）
    const tenant = await resolveTenant();

    // 安全防呆：tenant 解析失敗時，不查全庫（防跨租戶資料外洩）
    if (!tenant) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center py-16 bg-white rounded-xl px-8">
                    <div className="text-6xl mb-4">🏪</div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">找不到商店</h3>
                    <p className="text-gray-600">請確認網址是否正確</p>
                </div>
            </div>
        );
    }

    const { products, categories, pagination } = await getProducts(
        params,
        tenant.tenantId
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Hero Section - RWD 響應式 */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-10 md:py-16">
                <div className="container mx-auto px-4 text-center">
                    <h1 className="text-3xl md:text-4xl font-bold mb-3 md:mb-4">探索精選商品</h1>
                    <p className="text-base md:text-lg opacity-90 max-w-2xl mx-auto">
                        發現高品質商品，享受便捷購物體驗
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-6 md:py-8">
                <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                    {/* Sidebar - Categories（桌機版） */}
                    <aside className="hidden lg:block w-64 shrink-0">
                        <div className="bg-white rounded-xl shadow-sm p-6 sticky top-4">
                            <h2 className="font-semibold text-lg mb-4">商品分類</h2>
                            <ul className="space-y-2">
                                <li>
                                    <Link
                                        href="/products"
                                        className={`block px-3 py-2 rounded-lg transition-colors ${!params.category
                                            ? "bg-indigo-100 text-indigo-700 font-medium"
                                            : "hover:bg-gray-100"
                                            }`}
                                    >
                                        全部商品
                                        <span className="float-right text-gray-500">
                                            {pagination.total}
                                        </span>
                                    </Link>
                                </li>
                                {categories.map((cat) => (
                                    <li key={cat.id}>
                                        <Link
                                            href={`/products?category=${cat.slug}`}
                                            className={`block px-3 py-2 rounded-lg transition-colors ${params.category === cat.slug
                                                ? "bg-indigo-100 text-indigo-700 font-medium"
                                                : "hover:bg-gray-100"
                                                }`}
                                        >
                                            {cat.name}
                                            <span className="float-right text-gray-500">
                                                {cat.productCount}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>

                            {/* Search */}
                            <div className="mt-6 pt-6 border-t">
                                <h3 className="font-medium text-sm text-gray-700 mb-2">搜尋商品</h3>
                                <form action="/products" method="get">
                                    {params.category && (
                                        <input type="hidden" name="category" value={params.category} />
                                    )}
                                    <input
                                        type="text"
                                        name="search"
                                        defaultValue={params.search}
                                        placeholder="輸入關鍵字..."
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </form>
                            </div>
                        </div>
                    </aside>

                    {/* Main Content - Products Grid */}
                    <main className="flex-1">
                        {/* Results Header + Sort + Mobile Filter */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                            <div className="flex items-center gap-3">
                                {/* 手機版篩選抽屜觸發 */}
                                <MobileFilterDrawer
                                    categories={categories}
                                    totalProducts={pagination.total}
                                />
                                <p className="text-gray-600 text-sm md:text-base">
                                    共 <span className="font-medium text-gray-900">{pagination.total}</span> 件商品
                                    {params.search && (
                                        <span>
                                            ，搜尋「<span className="text-indigo-600">{params.search}</span>」
                                        </span>
                                    )}
                                </p>
                            </div>
                            {/* 排序選單 */}
                            <ProductSortBar />
                        </div>

                        {/* view_item_list 追蹤事件 */}
                        <TrackViewItemList
                            listName={params.category ? `分類: ${params.category}` : "全部商品"}
                            items={products.map((p) => ({
                                id: p.id,
                                name: p.name,
                                price: p.price,
                                category: p.categories?.[0]?.name,
                            }))}
                        />

                        {/* Products Grid - RWD: 手機2欄、平板2欄、桌機3欄 */}
                        {products.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                                {products.map((product) => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 bg-white rounded-xl">
                                <div className="text-6xl mb-4">🔍</div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                    找不到商品
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    請嘗試其他搜尋條件或瀏覽其他分類
                                </p>
                                <Link
                                    href="/products"
                                    className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                >
                                    查看全部商品
                                </Link>
                            </div>
                        )}

                        {/* Pagination - 保留排序參數 */}
                        {pagination.totalPages > 1 && (
                            <div className="flex justify-center gap-2 mt-8">
                                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(
                                    (pageNum) => (
                                        <Link
                                            key={pageNum}
                                            href={`/products?${new URLSearchParams({
                                                ...(params.category && { category: params.category }),
                                                ...(params.search && { search: params.search }),
                                                ...(params.sort && { sort: params.sort }),
                                                page: String(pageNum),
                                            })}`}
                                            className={`px-3 md:px-4 py-2 rounded-lg text-sm md:text-base font-medium transition-colors ${pageNum === pagination.page
                                                ? "bg-indigo-600 text-white"
                                                : "bg-white hover:bg-gray-100 text-gray-700"
                                                }`}
                                        >
                                            {pageNum}
                                        </Link>
                                    )
                                )}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}

/**
 * 商品卡片元件
 * RWD：手機緊湊佈局、桌機完整資訊
 * 含促銷標籤、庫存狀態、分類標籤
 */
function ProductCard({ product }: { product: Product }) {
    const isOutOfStock = product.stock === 0;
    const isLowStock = product.stock > 0 && product.stock <= 5;

    return (
        <Link
            href={`/products/${product.slug}`}
            className="group bg-white rounded-xl md:rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
        >
            {/* Image */}
            <div className="aspect-square relative overflow-hidden bg-gray-100">
                {product.coverImageUrl ? (
                    <img
                        src={product.coverImageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-10 md:w-16 h-10 md:h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                )}

                {/* 狀態標籤區 */}
                <div className="absolute top-2 left-2 md:top-3 md:left-3 flex flex-col gap-1">
                    {isOutOfStock && (
                        <span className="px-2 py-0.5 md:px-2.5 md:py-1 bg-red-500 text-white text-[10px] md:text-xs font-medium rounded-full">
                            售罄
                        </span>
                    )}
                    {isLowStock && (
                        <span className="px-2 py-0.5 md:px-2.5 md:py-1 bg-amber-500 text-white text-[10px] md:text-xs font-medium rounded-full">
                            即將售完
                        </span>
                    )}
                </div>

                {/* 售罄遮罩 */}
                {isOutOfStock && (
                    <div className="absolute inset-0 bg-black/20" />
                )}
            </div>

            {/* Content */}
            <div className="p-3 md:p-4">
                {/* Categories - 僅桌機顯示 */}
                {product.categories.length > 0 && (
                    <div className="hidden md:flex flex-wrap gap-1 mb-2">
                        {product.categories.slice(0, 2).map((cat) => (
                            <span
                                key={cat.id}
                                className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full"
                            >
                                {cat.name}
                            </span>
                        ))}
                    </div>
                )}

                {/* Name */}
                <h3 className="text-sm md:text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2 mb-1">
                    {product.name}
                </h3>

                {/* Summary - 僅桌機顯示 */}
                {product.summary && (
                    <p className="hidden md:block text-sm text-gray-500 line-clamp-2 mb-3">
                        {product.summary}
                    </p>
                )}

                {/* Price & Stock */}
                <div className="flex items-center justify-between mt-1 md:mt-2">
                    <span className="text-base md:text-lg font-bold text-indigo-600">
                        NT$ {product.price.toLocaleString()}
                    </span>
                    <span
                        className={`hidden md:inline-block text-xs px-2 py-1 rounded-full ${product.stock > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                            }`}
                    >
                        {product.stock > 0 ? "有庫存" : "缺貨"}
                    </span>
                </div>
            </div>
        </Link>
    );
}
