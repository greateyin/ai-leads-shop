import { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

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

async function getProducts(searchParams: {
    category?: string;
    page?: string;
    search?: string;
}) {
    const page = parseInt(searchParams.page || "1");
    const limit = 12;
    const category = searchParams.category;
    const search = searchParams.search;

    const where = {
        status: "PUBLISHED" as const,
        deletedAt: null,
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
            orderBy: { createdAt: "desc" },
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
                products: {
                    some: {
                        product: {
                            status: "PUBLISHED",
                            deletedAt: null,
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
    searchParams: Promise<{ category?: string; page?: string; search?: string }>;
}) {
    const params = await searchParams;
    const { products, categories, pagination } = await getProducts(params);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Hero Section */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-16">
                <div className="container mx-auto px-4 text-center">
                    <h1 className="text-4xl font-bold mb-4">探索精選商品</h1>
                    <p className="text-lg opacity-90 max-w-2xl mx-auto">
                        發現高品質商品，享受便捷購物體驗
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar - Categories */}
                    <aside className="w-full lg:w-64 shrink-0">
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
                        {/* Results Header */}
                        <div className="flex items-center justify-between mb-6">
                            <p className="text-gray-600">
                                共 <span className="font-medium text-gray-900">{pagination.total}</span> 件商品
                                {params.search && (
                                    <span>
                                        ，搜尋「<span className="text-indigo-600">{params.search}</span>」
                                    </span>
                                )}
                            </p>
                        </div>

                        {/* Products Grid */}
                        {products.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div className="flex justify-center gap-2 mt-8">
                                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(
                                    (pageNum) => (
                                        <Link
                                            key={pageNum}
                                            href={`/products?${new URLSearchParams({
                                                ...(params.category && { category: params.category }),
                                                ...(params.search && { search: params.search }),
                                                page: String(pageNum),
                                            })}`}
                                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${pageNum === pagination.page
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

function ProductCard({ product }: { product: Product }) {
    return (
        <Link
            href={`/products/${product.slug}`}
            className="group bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
        >
            {/* Image */}
            <div className="aspect-square relative overflow-hidden bg-gray-100">
                {product.coverImageUrl ? (
                    <img
                        src={product.coverImageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg
                            className="w-16 h-16"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                )}
                {/* Stock Badge */}
                {product.stock === 0 && (
                    <div className="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded">
                        售罄
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-4">
                {/* Categories */}
                {product.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
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
                <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2 mb-1">
                    {product.name}
                </h3>

                {/* Summary */}
                {product.summary && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                        {product.summary}
                    </p>
                )}

                {/* Price */}
                <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-indigo-600">
                        NT$ {product.price.toLocaleString()}
                    </span>
                    <span
                        className={`text-xs px-2 py-1 rounded-full ${product.stock > 0
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
