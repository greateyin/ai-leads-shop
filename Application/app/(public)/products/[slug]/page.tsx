import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateProductOpenGraph } from "@/components/seo/opengraph-meta";
import { AddToCartButton } from "@/components/product/add-to-cart-button";

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
    <div className="container min-h-screen py-12 md:py-20 font-sans">
      {/* Breadcrumb or Back Link could go here */}

      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        {/* 商品圖片區 - 加入動畫與精緻圓角 */}
        <div className="space-y-6 animate-fade-in-up opacity-0 [animation-delay:200ms]">
          {/* 主圖 */}
          <div className="aspect-square relative overflow-hidden rounded-3xl bg-secondary/30 shadow-2xl shadow-primary/5 transition-transform duration-500 hover:scale-[1.02]">
            {product.coverImageUrl ? (
              <img
                src={product.coverImageUrl}
                alt={product.name}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <span className="text-4xl mb-4">🖼️</span>
                <span>無圖片</span>
              </div>
            )}

            {/* 裝飾性標籤 (如果有促銷或新品) */}
            <div className="absolute top-4 left-4">
              <span className="px-3 py-1 bg-background/80 backdrop-blur text-xs font-bold rounded-full shadow-sm">
                新品上市
              </span>
            </div>
          </div>

          {/* 附加圖片縮圖 */}
          {product.assets.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              {product.assets.map((asset, index) => (
                <div
                  key={asset.id}
                  className="aspect-square rounded-xl overflow-hidden bg-secondary/30 cursor-pointer ring-2 ring-transparent hover:ring-primary transition-all active:scale-95"
                // 這裡未來可以加入點擊切換主圖的功能
                >
                  <img
                    src={asset.url}
                    alt={asset.altText || product.name}
                    className="object-cover w-full h-full opacity-80 hover:opacity-100 transition-opacity"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 商品資訊區 - 右側資訊 */}
        <div className="space-y-8 animate-fade-in opacity-0 [animation-delay:400ms]">
          <div className="space-y-4">
            {/* 分類標籤 */}
            {product.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.categories.map((c) => (
                  <span
                    key={c.categoryId}
                    className="px-3 py-1 bg-primary/5 text-primary text-sm font-semibold rounded-full border border-primary/10"
                  >
                    {c.category.name}
                  </span>
                ))}
              </div>
            )}

            {/* 商品名稱 */}
            <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-foreground">
              {product.name}
            </h1>

            {/* 價格 & 庫存 */}
            <div className="flex items-end gap-6 border-b pb-6 border-border/60">
              <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                NT$ {price.toLocaleString()}
              </div>

              <div className="flex items-center gap-2 mb-2 px-3 py-1 rounded-full bg-secondary text-sm font-medium">
                {product.stock > 0 ? (
                  <>
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-green-700 dark:text-green-400">現貨供應</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span className="text-red-600">已售完</span>
                  </>
                )}
              </div>
            </div>

            {/* 摘要 */}
            {product.summary && (
              <p className="text-lg text-muted-foreground leading-relaxed">
                {product.summary}
              </p>
            )}
          </div>

          {/* 購買操作區 - 使用 Client Component */}
          <AddToCartButton
            productId={product.id}
            productName={product.name}
            price={price}
            stock={product.stock}
            variants={product.variants.map((v) => ({
              id: v.id,
              name: v.name,
              sku: v.sku,
              price: v.price ? Number(v.price) : null,
            }))}
          />

          {/* 分享按鈕區 */}
          <div className="pt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>分享此商品</span>
            <div className="flex gap-2">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                  `${process.env.NEXT_PUBLIC_BASE_URL || ""}/products/${product.slug}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                title="分享到 Facebook"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              </a>
              <a
                href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
                  `${process.env.NEXT_PUBLIC_BASE_URL || ""}/products/${product.slug}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-500 hover:text-white transition-colors"
                title="分享到 LINE"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H4.635c-.349 0-.63-.285-.63-.63 0-.347.281-.632.63-.632h14.73zm-14.73 2.518h7.274c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H4.635c-.349 0-.63-.285-.63-.63 0-.346.281-.631.63-.631zm7.274 2.518H4.635c-.349 0-.63-.285-.63-.63 0-.345.281-.63.63-.63h7.274c.349 0 .63.285.63.63 0 .346-.281.631-.63.631zM24 10.3c0 4.843-4.415 8.923-11.625 9.879.364.713.433 1.947-.076 2.459-.286.287-2.149 1.066-2.522 1.135-.295.054-.683.007-.723-.004-.083-.023-.427-.128-.276-.628.172-.569 1.144-2.735 1.543-3.003-4.22-.647-9.508-3.058-9.508-9.839C.813 4.607 6.002 0 12.406 0 18.81 0 24 4.607 24 10.3z" /></svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 商品描述 - 滿版寬度設計 */}
      {product.descriptionMd && (
        <div className="mt-20 pt-10 border-t border-dashed border-border">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              商品詳細說明
            </h2>
            <div className="prose prose-lg prose-slate dark:prose-invert max-w-none mx-auto bg-card p-8 rounded-3xl shadow-sm border border-border/50">
              <ProductDescription
                content={product.descriptionMd}
                htmlContent={product.descriptionHtml}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 簡單的 Markdown 轉 HTML
 * 避免使用 next-mdx-remote 造成 React 版本衝突
 */
function simpleMarkdownToHtml(markdown: string): string {
  return markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-6 mb-3">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4">$1</h1>')
    // Bold and Italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>')
    // Line breaks - convert double newlines to paragraphs
    .split(/\n\n+/)
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => `<p class="mb-4 leading-relaxed">${para.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/**
 * 商品描述元件
 * 使用預渲染的 HTML 或將 Markdown 轉為 HTML
 */
function ProductDescription({
  content,
  htmlContent
}: {
  content: string;
  htmlContent?: string | null;
}) {
  // 優先使用已預渲染的 HTML
  if (htmlContent) {
    return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
  }

  // 將 Markdown 轉為簡單 HTML
  const html = simpleMarkdownToHtml(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
