/**
 * OpenGraph 元資料元件
 * 用於部落格文章和商品頁面的社群分享 metadata
 */

export interface OpenGraphMetaProps {
  /** 頁面標題 */
  title: string;
  /** 頁面描述 */
  description?: string;
  /** 分享圖片 URL */
  imageUrl?: string;
  /** 頁面 URL */
  url: string;
  /** 內容類型 */
  type?: "website" | "article" | "product";
  /** 網站名稱 */
  siteName?: string;
  /** 文章作者 (僅 article 類型) */
  author?: string;
  /** 發布時間 (僅 article 類型) */
  publishedTime?: string;
  /** 商品價格 (僅 product 類型) */
  price?: number;
  /** 商品幣別 (僅 product 類型) */
  currency?: string;
  /** Twitter Card 類型 */
  twitterCard?: "summary" | "summary_large_image";
}

/**
 * 產生 OpenGraph metadata 物件
 * 用於 Next.js App Router 的 generateMetadata 函式
 */
export function generateOpenGraphMetadata(props: OpenGraphMetaProps) {
  const {
    title,
    description,
    imageUrl,
    url,
    type = "website",
    siteName = "AIsell",
    author,
    publishedTime,
    price,
    currency = "TWD",
    twitterCard = "summary_large_image",
  } = props;

  const metadata: Record<string, unknown> = {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName,
      type,
      ...(imageUrl && {
        images: [
          {
            url: imageUrl,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      }),
      ...(type === "article" && {
        article: {
          ...(author && { authors: [author] }),
          ...(publishedTime && { publishedTime }),
        },
      }),
    },
    twitter: {
      card: twitterCard,
      title,
      description,
      ...(imageUrl && { images: [imageUrl] }),
    },
  };

  // 商品結構化資料
  if (type === "product" && price) {
    metadata.other = {
      "product:price:amount": price.toString(),
      "product:price:currency": currency,
    };
  }

  return metadata;
}

/**
 * 產生部落格文章的 OpenGraph metadata
 */
export function generateBlogOpenGraph(post: {
  title: string;
  slug: string;
  summary?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: Date | null;
  author?: { name?: string | null } | null;
  tenant?: { subdomain: string } | null;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://aisell.tw";
  const tenantUrl = post.tenant?.subdomain
    ? `https://${post.tenant.subdomain}.aisell.tw`
    : baseUrl;

  return generateOpenGraphMetadata({
    title: post.ogTitle || post.title,
    description: post.ogDescription || post.summary || undefined,
    imageUrl: post.ogImageUrl || post.coverImageUrl || undefined,
    url: `${tenantUrl}/blog/${post.slug}`,
    type: "article",
    author: post.author?.name || undefined,
    publishedTime: post.publishedAt?.toISOString(),
  });
}

/**
 * 產生商品的 OpenGraph metadata
 */
export function generateProductOpenGraph(product: {
  name: string;
  slug: string;
  summary?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  coverImageUrl?: string | null;
  price: number | string | { toString(): string };
  shop?: { slug: string } | null;
  tenant?: { subdomain: string } | null;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://aisell.tw";
  const tenantUrl = product.tenant?.subdomain
    ? `https://${product.tenant.subdomain}.aisell.tw`
    : baseUrl;
  const shopSlug = product.shop?.slug || "shop";

  const priceValue = typeof product.price === "number" 
    ? product.price 
    : parseFloat(product.price.toString());

  return generateOpenGraphMetadata({
    title: product.ogTitle || product.name,
    description: product.ogDescription || product.summary || undefined,
    imageUrl: product.ogImageUrl || product.coverImageUrl || undefined,
    url: `${tenantUrl}/${shopSlug}/products/${product.slug}`,
    type: "product",
    price: priceValue,
    currency: "TWD",
  });
}
