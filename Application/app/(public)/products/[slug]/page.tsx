import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateProductOpenGraph } from "@/components/seo/opengraph-meta";
import { renderMdx, isHtmlContent } from "@/lib/mdx";

/**
 * 取得商品資料
 */
async function getProduct(slug: string, tenantSubdomain?: string) {
  const product = await db.product.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      deletedAt: null,
      ...(tenantSubdomain && {
        tenant: { subdomain: tenantSubdomain },
      }),
    },
    include: {
      tenant: { select: { subdomain: true, name: true } },
      shop: { select: { slug: true, name: true } },
      categories: { include: { category: true } },
      variants: true,
      assets: { orderBy: { sortOrder: "asc" } },
    },
  });

  return product;
}

/**
 * 產生頁面 metadata (OpenGraph)
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: "商品不存在",
    };
  }

  const ogMeta = generateProductOpenGraph(product);

  return {
    title: product.ogTitle || product.name,
    description: product.ogDescription || product.summary || undefined,
    ...ogMeta,
  };
}

/**
 * 公開商品頁面
 * 路由: /products/[slug]
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  const price = typeof product.price === "object"
    ? Number(product.price)
    : product.price;

  return (
    <div className="container py-8">
      <div className="grid md:grid-cols-2 gap-8">
        {/* 商品圖片 */}
        <div className="space-y-4">
          {/* 主圖 */}
          <div className="aspect-square relative overflow-hidden rounded-lg bg-muted">
            {product.coverImageUrl ? (
              <img
                src={product.coverImageUrl}
                alt={product.name}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                無圖片
              </div>
            )}
          </div>

          {/* 附加圖片 */}
          {product.assets.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {product.assets.map((asset) => (
                <div
                  key={asset.id}
                  className="aspect-square rounded overflow-hidden bg-muted"
                >
                  <img
                    src={asset.url}
                    alt={asset.altText || product.name}
                    className="object-cover w-full h-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 商品資訊 */}
        <div className="space-y-6">
          {/* 分類 */}
          {product.categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {product.categories.map((c) => (
                <span
                  key={c.categoryId}
                  className="px-2 py-1 bg-primary/10 text-primary text-sm rounded"
                >
                  {c.category.name}
                </span>
              ))}
            </div>
          )}

          {/* 商品名稱 */}
          <h1 className="text-3xl font-bold">{product.name}</h1>

          {/* 價格 */}
          <div className="text-3xl font-bold text-primary">
            NT$ {price.toLocaleString()}
          </div>

          {/* 摘要 */}
          {product.summary && (
            <p className="text-muted-foreground">{product.summary}</p>
          )}

          {/* 庫存狀態 */}
          <div className="flex items-center gap-2">
            {product.stock > 0 ? (
              <>
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-green-600">有庫存</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                <span className="text-red-600">缺貨中</span>
              </>
            )}
          </div>

          {/* 規格選擇 */}
          {product.variants.length > 0 && (
            <div className="space-y-2">
              <label className="font-medium">選擇規格</label>
              <select className="w-full p-2 border rounded">
                {product.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name || variant.sku}
                    {variant.price && ` - NT$ ${Number(variant.price).toLocaleString()}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 數量 */}
          <div className="space-y-2">
            <label className="font-medium">數量</label>
            <input
              type="number"
              min="1"
              max={product.stock || 99}
              defaultValue="1"
              className="w-24 p-2 border rounded"
            />
          </div>

          {/* 購買按鈕 */}
          <div className="flex gap-4">
            <button
              className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
              disabled={product.stock === 0}
            >
              加入購物車
            </button>
            <button
              className="px-6 py-3 border rounded-lg font-medium hover:bg-muted"
            >
              ♡
            </button>
          </div>

          {/* 分享按鈕 */}
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">分享商品</h3>
            <div className="flex gap-2">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                  `${process.env.NEXT_PUBLIC_BASE_URL || ""}/products/${product.slug}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                title="分享到 Facebook"
              >
                FB
              </a>
              <a
                href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
                  `${process.env.NEXT_PUBLIC_BASE_URL || ""}/products/${product.slug}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-green-500 text-white rounded hover:bg-green-600"
                title="分享到 LINE"
              >
                LINE
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 商品描述 */}
      {product.descriptionMd && (
        <div className="mt-12 pt-8 border-t">
          <h2 className="text-2xl font-bold mb-4">商品說明</h2>
          <div className="prose max-w-none">
            <ProductDescription
              content={product.descriptionMd}
              htmlContent={product.descriptionHtml}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 商品描述元件
 * 優先使用 MDX 渲染，若內容為 HTML 則使用 dangerouslySetInnerHTML
 */
async function ProductDescription({
  content,
  htmlContent
}: {
  content: string;
  htmlContent?: string | null;
}) {
  // 如果有預渲染的 HTML 且它是真正的 HTML 內容，使用它
  if (htmlContent && isHtmlContent(htmlContent)) {
    return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
  }

  // 否則使用 MDX 渲染
  return <>{await renderMdx(content)}</>;
}
