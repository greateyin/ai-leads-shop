import Link from "next/link";
import { db } from "@/lib/db";

/**
 * RelatedProducts 元件的 Props
 */
interface RelatedProductsProps {
  /** 目前商品 ID（排除自己） */
  currentProductId: string;
  /** 目前商品的分類 ID 列表 */
  categoryIds: string[];
  /** 最多顯示幾個（預設 4） */
  limit?: number;
}

/**
 * 關聯商品推薦元件
 * 根據相同分類推薦商品，若不足則補上最新商品
 * Server Component，可直接在 page.tsx 中使用
 */
export async function RelatedProducts({
  currentProductId,
  categoryIds,
  limit = 4,
}: RelatedProductsProps) {
  // 查詢同分類商品
  const relatedProducts = await db.product.findMany({
    where: {
      id: { not: currentProductId },
      status: "PUBLISHED",
      deletedAt: null,
      ...(categoryIds.length > 0 && {
        categories: {
          some: {
            categoryId: { in: categoryIds },
          },
        },
      }),
    },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      coverImageUrl: true,
      stock: true,
    },
  });

  // 若同分類不足，補上最新商品
  if (relatedProducts.length < limit) {
    const existingIds = [currentProductId, ...relatedProducts.map((p) => p.id)];
    const moreProducts = await db.product.findMany({
      where: {
        id: { notIn: existingIds },
        status: "PUBLISHED",
        deletedAt: null,
      },
      take: limit - relatedProducts.length,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        coverImageUrl: true,
        stock: true,
      },
    });
    relatedProducts.push(...moreProducts);
  }

  if (relatedProducts.length === 0) return null;

  return (
    <section className="mt-20 pt-10 border-t border-dashed border-border">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
        你可能也喜歡
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {relatedProducts.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.slug}`}
            className="group bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
          >
            {/* 圖片 */}
            <div className="aspect-square relative overflow-hidden bg-secondary/30">
              {product.coverImageUrl ? (
                <img
                  src={product.coverImageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {/* 缺貨標記 */}
              {product.stock === 0 && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white text-sm font-medium px-3 py-1 bg-red-500/90 rounded-full">
                    已售完
                  </span>
                </div>
              )}
            </div>

            {/* 資訊 */}
            <div className="p-3 md:p-4">
              <h3 className="font-medium text-sm md:text-base text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-2">
                {product.name}
              </h3>
              <div className="text-base md:text-lg font-bold text-primary">
                NT$ {Number(product.price).toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
