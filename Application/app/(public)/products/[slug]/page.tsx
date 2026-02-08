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

  const price =
    typeof product.price === "object" ? Number(product.price) : product.price;

  // 從 request headers 取得實際 origin（tenant-aware canonical URL）
  const headersList = await headers();
  const proto = headersList.get("x-forwarded-proto") || "https";
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";
  const siteUrl = host
    ? `${proto}://${host}`
    : process.env.NEXT_PUBLIC_BASE_URL || "https://example.com";

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
    <div className="min-h-screen pb-20 md:pb-0 font-sans bg-[#f5f5f7]">
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

      <div className="container py-8 md:py-12">
        {/* Breadcrumb 導航 - Apple Style */}
        <nav className="flex items-center gap-2 text-sm text-[#515154] mb-8 md:mb-12">
          <Link href="/" className="hover:text-[#1d1d1f] transition-colors">
            首頁
          </Link>
          <span className="text-[#86868b]">/</span>
          <Link
            href="/products"
            className="hover:text-[#1d1d1f] transition-colors"
          >
            商品
          </Link>
          {primaryCategory && (
            <>
              <span className="text-[#86868b]">/</span>
              <span className="text-[#86868b]">{primaryCategory}</span>
            </>
          )}
          <span className="text-[#86868b]">/</span>
          <span className="text-[#1d1d1f] font-medium truncate max-w-[200px]">
            {product.name}
          </span>
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

          {/* 右側：商品資訊 - Apple Style */}
          <div className="space-y-6 animate-fade-in opacity-0 [animation-delay:400ms]">
            <div className="space-y-4">
              {/* Eyebrow 分類標籤 - Apple Style */}
              {product.categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {product.categories.map((c) => (
                    <Link
                      key={c.categoryId}
                      href={`/products?category=${c.category.slug}`}
                      className="text-sm font-semibold text-[#b64400] hover:text-[#8f3600] transition-colors uppercase tracking-wide"
                    >
                      {c.category.name}
                    </Link>
                  ))}
                </div>
              )}

              {/* 商品名稱 - Apple Typography */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight tracking-tight text-[#1d1d1f]">
                {product.name}
              </h1>

              {/* 價格 & 庫存 - Apple Style */}
              <div className="flex flex-wrap items-end gap-4 md:gap-6 border-b pb-6 border-gray-200">
                <div className="text-2xl md:text-3xl font-medium text-[#1d1d1f]">
                  NT$ {price.toLocaleString()}
                </div>

                <div className="flex items-center gap-2 mb-1 px-3 py-1.5 rounded-full bg-[#f5f5f7] text-sm font-medium">
                  {product.stock > 0 ? (
                    <>
                      <span className="w-2 h-2 bg-[#34c759] rounded-full"></span>
                      <span className="text-[#1d1d1f]">現貨供應</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 bg-[#ff3b30] rounded-full"></span>
                      <span className="text-[#ff3b30]">已售完</span>
                    </>
                  )}
                </div>
              </div>

              {/* 摘要 - Apple Style */}
              {product.summary && (
                <p className="text-base md:text-lg text-[#515154] leading-relaxed">
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

            {/* 分享按鈕區 - Apple Style */}
            <div className="pt-6 flex items-center justify-between text-sm text-[#515154]">
              <span>分享此商品</span>
              <div className="flex gap-2">
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                    `${siteUrl}/products/${product.slug}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-[#f5f5f7] text-[#515154] rounded-full hover:bg-[#0066cc] hover:text-white transition-colors"
                  title="分享到 Facebook"
                >
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
                <a
                  href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
                    `${siteUrl}/products/${product.slug}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-[#f5f5f7] text-[#515154] rounded-full hover:bg-[#06c755] hover:text-white transition-colors"
                  title="分享到 LINE"
                >
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H4.635c-.349 0-.63-.285-.63-.63 0-.347.281-.632.63-.632h14.73zm-14.73 2.518h7.274c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H4.635c-.349 0-.63-.285-.63-.63 0-.346.281-.631.63-.631zm7.274 2.518H4.635c-.349 0-.63-.285-.63-.63 0-.345.281-.63.63-.63h7.274c.349 0 .63.285.63.63 0 .346-.281.631-.63.631zM24 10.3c0 4.843-4.415 8.923-11.625 9.879.364.713.433 1.947-.076 2.459-.286.287-2.149 1.066-2.522 1.135-.295.054-.683.007-.723-.004-.083-.023-.427-.128-.276-.628.172-.569 1.144-2.735 1.543-3.003-4.22-.647-9.508-3.058-9.508-9.839C.813 4.607 6.002 0 12.406 0 18.81 0 24 4.607 24 10.3z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 商品描述 - Apple Style 滿版寬度設計 */}
        {product.descriptionMd && (
          <div className="mt-16 md:mt-24 pt-12 border-t border-gray-200">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-semibold mb-8 text-center text-[#1d1d1f]">
                商品詳細說明
              </h2>
              <div className="prose prose-base md:prose-lg prose-slate max-w-none mx-auto bg-white p-6 md:p-10 rounded-[20px]">
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
 * 支援：Headers, Bold, Italic, Links, Tables, Unordered/Ordered Lists
 * 避免使用 next-mdx-remote 造成 React 版本衝突
 */
function simpleMarkdownToHtml(markdown: string): string {
  /** 行內格式：bold、italic、links */
  const inlineFormat = (text: string): string =>
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-primary hover:underline">$1</a>',
      );

  /** 判斷一個 block 是否為 Markdown 表格 */
  const isTable = (lines: string[]): boolean =>
    lines.length >= 2 &&
    lines[0].includes("|") &&
    /^\|?\s*[-:]+[-| :]*$/.test(lines[1]);

  /** 將表格 block 轉為 HTML <table> */
  const parseTable = (lines: string[]): string => {
    const parseCells = (row: string): string[] =>
      row
        .split("|")
        .map((c) => c.trim())
        .filter(
          (_, i, arr) =>
            // 去掉首尾空 cell（由前後 | 產生）
            !(i === 0 && arr[0] === "") &&
            !(i === arr.length - 1 && arr[arr.length - 1] === ""),
        );

    const headerCells = parseCells(lines[0]);
    // lines[1] 是 separator（---），跳過
    const bodyRows = lines.slice(2).filter((l) => l.includes("|"));

    const thHtml = headerCells
      .map(
        (c) =>
          `<th class="px-4 py-2 text-left text-sm font-semibold text-muted-foreground border-b border-border">${inlineFormat(c)}</th>`,
      )
      .join("");
    const tbodyHtml = bodyRows
      .map((row) => {
        const cells = parseCells(row);
        const tds = cells
          .map(
            (c) =>
              `<td class="px-4 py-2 text-sm border-b border-border/50">${inlineFormat(c)}</td>`,
          )
          .join("");
        return `<tr class="hover:bg-muted/30 transition-colors">${tds}</tr>`;
      })
      .join("");

    return `<div class="overflow-x-auto my-4"><table class="w-full border-collapse rounded-lg overflow-hidden"><thead><tr class="bg-muted/50">${thHtml}</tr></thead><tbody>${tbodyHtml}</tbody></table></div>`;
  };

  /** 判斷一個 block 是否為無序列表 */
  const isUnorderedList = (lines: string[]): boolean =>
    lines.every((l) => /^[-*+]\s/.test(l));

  /** 判斷一個 block 是否為有序列表 */
  const isOrderedList = (lines: string[]): boolean =>
    lines.every((l) => /^\d+\.\s/.test(l));

  // 依雙換行切 block，逐 block 判斷類型
  return markdown
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trimEnd());

      // Table
      if (isTable(lines)) {
        return parseTable(lines);
      }

      // Unordered list
      if (isUnorderedList(lines)) {
        const items = lines
          .map(
            (l) =>
              `<li class="ml-4 list-disc">${inlineFormat(l.replace(/^[-*+]\s/, ""))}</li>`,
          )
          .join("");
        return `<ul class="mb-4 space-y-1">${items}</ul>`;
      }

      // Ordered list
      if (isOrderedList(lines)) {
        const items = lines
          .map(
            (l) =>
              `<li class="ml-4 list-decimal">${inlineFormat(l.replace(/^\d+\.\s/, ""))}</li>`,
          )
          .join("");
        return `<ol class="mb-4 space-y-1">${items}</ol>`;
      }

      // Headers & paragraph（單行 block）
      return block
        .replace(
          /^### (.*$)/gim,
          '<h3 class="text-xl font-semibold mt-4 mb-2">$1</h3>',
        )
        .replace(
          /^## (.*$)/gim,
          '<h2 class="text-2xl font-bold mt-6 mb-3">$1</h2>',
        )
        .replace(
          /^# (.*$)/gim,
          '<h1 class="text-3xl font-bold mt-8 mb-4">$1</h1>',
        )
        .replace(/^(<h[123])/, "$1") // 已是 heading 就不包 <p>
        .replace(
          /^(?!<h[123])([\s\S]+)$/,
          (_m, content) =>
            `<p class="mb-4 leading-relaxed">${inlineFormat(content.replace(/\n/g, "<br/>"))}</p>`,
        );
    })
    .join("");
}

/**
 * 商品描述元件
 * 使用預渲染的 HTML 或將 Markdown 轉為 HTML
 */
function ProductDescription({
  content,
  htmlContent,
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
