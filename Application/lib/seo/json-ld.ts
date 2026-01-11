/**
 * JSON-LD Schema.org Structured Data Generators
 * 用於 SEO/AEO (Answer Engine Optimization) 的結構化資料生成
 */

/**
 * Article Schema (Schema.org)
 * https://schema.org/Article
 */
export interface ArticleInput {
    title: string;
    slug: string;
    summary?: string | null;
    contentMdx: string;
    authorName: string;
    authorUrl?: string;
    publishedAt?: Date | null;
    updatedAt?: Date;
    coverImageUrl?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    siteName?: string;
    siteUrl?: string;
}

export function generateArticleSchema(input: ArticleInput): Record<string, unknown> {
    const {
        title,
        slug,
        summary,
        contentMdx,
        authorName,
        authorUrl,
        publishedAt,
        updatedAt,
        coverImageUrl,
        seoTitle,
        seoDescription,
        siteName = process.env.NEXT_PUBLIC_APP_NAME || "AIsell",
        siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://example.com",
    } = input;

    const articleUrl = `${siteUrl}/blog/${slug}`;
    const wordCount = contentMdx.split(/\s+/).length;

    return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: seoTitle || title,
        description: seoDescription || summary || title,
        image: coverImageUrl ? [coverImageUrl] : undefined,
        author: {
            "@type": "Person",
            name: authorName,
            url: authorUrl,
        },
        publisher: {
            "@type": "Organization",
            name: siteName,
            url: siteUrl,
        },
        datePublished: publishedAt?.toISOString(),
        dateModified: updatedAt?.toISOString() || publishedAt?.toISOString(),
        mainEntityOfPage: {
            "@type": "WebPage",
            "@id": articleUrl,
        },
        url: articleUrl,
        wordCount,
    };
}

/**
 * FAQPage Schema (Schema.org)
 * https://schema.org/FAQPage
 */
export interface FAQItem {
    question: string;
    answer: string;
}

export interface FAQPageInput {
    faqs: FAQItem[];
    pageUrl?: string;
    pageName?: string;
}

export function generateFAQPageSchema(input: FAQPageInput): Record<string, unknown> {
    const { faqs, pageUrl, pageName } = input;

    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        name: pageName,
        url: pageUrl,
        mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
            },
        })),
    };
}

/**
 * Product Schema (Schema.org)
 * https://schema.org/Product
 */
export interface ProductSchemaInput {
    name: string;
    slug: string;
    description?: string | null;
    price: number;
    currency?: string;
    sku?: string | null;
    imageUrl?: string | null;
    availability?: "InStock" | "OutOfStock" | "PreOrder";
    brand?: string;
    siteUrl?: string;
}

export function generateProductSchema(input: ProductSchemaInput): Record<string, unknown> {
    const {
        name,
        slug,
        description,
        price,
        currency = "TWD",
        sku,
        imageUrl,
        availability = "InStock",
        brand,
        siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://example.com",
    } = input;

    const productUrl = `${siteUrl}/products/${slug}`;

    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name,
        description,
        image: imageUrl,
        sku,
        url: productUrl,
        brand: brand
            ? {
                "@type": "Brand",
                name: brand,
            }
            : undefined,
        offers: {
            "@type": "Offer",
            price,
            priceCurrency: currency,
            availability: `https://schema.org/${availability}`,
            url: productUrl,
        },
    };
}

/**
 * BreadcrumbList Schema (Schema.org)
 * https://schema.org/BreadcrumbList
 */
export interface BreadcrumbItem {
    name: string;
    url: string;
}

export function generateBreadcrumbSchema(items: BreadcrumbItem[]): Record<string, unknown> {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url,
        })),
    };
}

/**
 * 從 Markdown 內容解析 FAQ
 * 支援格式：
 * ## Q: 問題內容
 * A: 答案內容
 */
export function extractFAQsFromMarkdown(markdown: string): FAQItem[] {
    const faqs: FAQItem[] = [];
    const faqRegex = /##?\s*Q:\s*(.+?)(?:\n|\r\n)A:\s*([\s\S]+?)(?=##?\s*Q:|$)/gi;

    let match;
    while ((match = faqRegex.exec(markdown)) !== null) {
        faqs.push({
            question: match[1].trim(),
            answer: match[2].trim(),
        });
    }

    return faqs;
}

/**
 * 合併多個 JSON-LD schema 到一個陣列
 */
export function combineSchemas(...schemas: Record<string, unknown>[]): string {
    const validSchemas = schemas.filter((s) => s && Object.keys(s).length > 0);

    if (validSchemas.length === 0) {
        return "";
    }

    if (validSchemas.length === 1) {
        return JSON.stringify(validSchemas[0]);
    }

    return JSON.stringify(validSchemas);
}

/**
 * 為 BlogPost 生成完整的 SEO JSON
 */
export function generateBlogPostSeoJson(post: {
    title: string;
    slug: string;
    summary?: string | null;
    contentMdx: string;
    author: { name: string | null };
    publishedAt?: Date | null;
    updatedAt: Date;
    coverImageUrl?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
}): Record<string, unknown> {
    // Generate Article schema
    const articleSchema = generateArticleSchema({
        title: post.title,
        slug: post.slug,
        summary: post.summary,
        contentMdx: post.contentMdx,
        authorName: post.author.name || "Unknown",
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        coverImageUrl: post.coverImageUrl,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
    });

    // Extract FAQs from content if present
    const faqs = extractFAQsFromMarkdown(post.contentMdx);

    if (faqs.length > 0) {
        const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://example.com";
        const faqSchema = generateFAQPageSchema({
            faqs,
            pageUrl: `${siteUrl}/blog/${post.slug}`,
            pageName: post.title,
        });

        return {
            "@context": "https://schema.org",
            "@graph": [articleSchema, faqSchema],
        };
    }

    return articleSchema;
}
