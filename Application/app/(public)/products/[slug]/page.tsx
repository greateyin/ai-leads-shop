import { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { generateProductOpenGraph } from "@/components/seo/opengraph-meta";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { TrackViewItem } from "@/components/tracking/track-view-item";
import { generateProductSchema } from "@/lib/seo/json-ld";
import { ProductImageGallery } from "@/components/product/product-image-gallery";
import { TrustBadges } from "@/components/product/trust-badges";
import { StickyMobileCTA } from "@/components/product/sticky-mobile-cta";
import { RelatedProducts } from "@/components/product/related-products";

/**
 * 取得商品資料
 * tenantId 確保租戶隔離，A 租戶的 slug 在 B 網域必須 404
 */
async function getProduct(slug: string, tenantId?: string) {
  const product = await db.product.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      deletedAt: null,
      ...(tenantId && { tenantId }),
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
  const tenant = await resolveTenant();

  // 安全防呆：tenant 解析失敗時不查全庫
  if (!tenant) {
    return { title: "商品不存在" };
  }

  const product = await getProduct(slug, tenant.tenantId);

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
  const tenant = await resolveTenant();

  // 安全防呆：tenant 解析失敗時直接 404（不查全庫防資料外洩）
  if (!tenant) {
    notFound();
  }

  const product = await getProduct(slug, tenant.tenantId);

  if (!product) {
    notFound();
  }

  const price = typeof product.price === "object"
    ? Number(product.price)
    : product.price;

  // 從 request headers 取得實際 origin（tenant-aware canonical URL）
  const headersList = await headers();
  const proto = headersList.get("x-forwarded-proto") || "https";
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "";
  const siteUrl = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL || "https://example.com";

  // JSON-LD 結構化資料（使用 tenant-aware URL）
  const productSchema = generateProductSchema({
    name: product.name,
    slug: product.slug,
    description: product.summary,
    price,
    sku: product.variants?.[0]?.sku,
    imageUrl: product.coverImageUrl,
    availability: product.stock > 0 ? "InStock" : "OutOfStock",
    siteUrl,
  });

  // 主分類名稱（追蹤用）
  const primaryCategory = product.categories?.[0]?.category?.name;

  // 分類 ID 列表（用於關聯商品查詢）
  const categoryIds = product.categories.map((c) => c.categoryId);

  return (
    <div className="min-h-screen pb-20 md:pb-0 font-sans">
      {/* JSON-LD Product Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      {/* view_item 追蹤事件 */}
      <TrackViewItem
        productId={product.id}
        productName={product.name}
        price={price}
        category={primaryCategory}
      />

      <div className="container py-6 md:py-12">
        {/* Breadcrumb 導航 */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6 md:mb-10">
          <Link href="/" className="hover:text-foreground transition-colors">首頁</Link>
          <span>/</span>
          <Link href="/products" className="hover:text-foreground transition-colors">商品</Link>
          {primaryCategory && (
            <>
              <span>/</span>
              <span className="text-foreground/70">{primaryCategory}</span>
            </>
          )}
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          {/* 左側：商品圖片畫廊（可切換主圖） */}
          <div className="lg:sticky lg:top-24 lg:self-start animate-fade-in-up opacity-0 [animation-delay:200ms]">
            <ProductImageGallery
              coverImageUrl={product.coverImageUrl}
              productName={product.name}
              assets={product.assets}
            />
          </div>

          {/* 右側：商品資訊 */}
          <div className="space-y-8 animate-fade-in opacity-0 [animation-delay:400ms]">
            <div className="space-y-4">
              {/* 分類標籤 */}
              {product.categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {product.categories.map((c) => (
                    <Link
                      key={c.categoryId}
                      href={`/products?category=${c.category.slug}`}
                      className="px-3 py-1 bg-primary/5 text-primary text-sm font-semibold rounded-full border border-primary/10 hover:bg-primary/10 transition-colors"
                    >
                      {c.category.name}
                    </Link>
                  ))}
                </div>
              )}

              {/* 商品名稱 */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-foreground">
                {product.name}
              </h1>

              {/* 價格 & 庫存 */}
              <div className="flex flex-wrap items-end gap-4 md:gap-6 border-b pb-6 border-border/60">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  NT$ {price.toLocaleString()}
                </div>

                <div className="flex items-center gap-2 mb-1 px-3 py-1 rounded-full bg-secondary text-sm font-medium">
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
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  {product.summary}
                </p>
              )}
            </div>

            {/* 購買操作區 - 桌機版（手機版使用 StickyMobileCTA） */}
            <div className="hidden md:block">
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
            </div>


            {/* 信任標章 */}
            <TrustBadges />

            {/* 分享按鈕區 */}
            <div className="pt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>分享此商品</span>
              <div className="flex gap-2">
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                    `${siteUrl}/products/${product.slug}`
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
                    `${siteUrl}/products/${product.slug}`
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
          <div className="mt-16 md:mt-20 pt-10 border-t border-dashed border-border">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                商品詳細說明
              </h2>
              <div className="prose prose-base md:prose-lg prose-slate dark:prose-invert max-w-none mx-auto bg-card p-6 md:p-8 rounded-3xl shadow-sm border border-border/50">
                <ProductDescription
                  content={product.descriptionMd}
                  htmlContent={product.descriptionHtml}
                />
              </div>
            </div>
          </div>
        )}

        {/* 關聯商品推薦 */}
        <RelatedProducts
          currentProductId={product.id}
          categoryIds={categoryIds}
          tenantId={tenant.tenantId}
          limit={4}
        />
      </div>

      {/* 手機底部固定購買列 */}
      <StickyMobileCTA
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
