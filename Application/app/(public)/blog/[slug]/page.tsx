import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateBlogOpenGraph } from "@/components/seo/opengraph-meta";
import { renderMdx, isHtmlContent } from "@/lib/mdx";

/**
 * 文章內容渲染元件
 * 支援 MDX 與 HTML 兩種格式
 */
async function BlogContent({ content }: { content: string }) {
  // 如果內容是 HTML，直接渲染
  if (isHtmlContent(content)) {
    return (
      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // 使用 MDX 渲染
  const mdxContent = await renderMdx(content);
  return <div className="prose prose-lg max-w-none">{mdxContent}</div>;
}
/**
 * 取得文章資料
 */
async function getPost(slug: string, tenantSubdomain?: string) {
  const post = await db.blogPost.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      ...(tenantSubdomain && {
        tenant: { subdomain: tenantSubdomain },
      }),
    },
    include: {
      author: { select: { id: true, name: true } },
      tenant: { select: { subdomain: true, name: true } },
      categories: { include: { category: true } },
      tags: { include: { tag: true } },
    },
  });

  return post;
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
  const post = await getPost(slug);

  if (!post) {
    return {
      title: "文章不存在",
    };
  }

  const ogMeta = generateBlogOpenGraph(post);

  return {
    title: post.ogTitle || post.seoTitle || post.title,
    description: post.ogDescription || post.seoDescription || post.summary || undefined,
    ...ogMeta,
  };
}

/**
 * 公開部落格文章頁面
 * 路由: /blog/[slug]
 */
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <article className="container max-w-4xl py-8">
      {/* 封面圖片 */}
      {post.coverImageUrl && (
        <div className="mb-8 aspect-video relative overflow-hidden rounded-lg">
          <img
            src={post.coverImageUrl}
            alt={post.title}
            className="object-cover w-full h-full"
          />
        </div>
      )}

      {/* 文章標題 */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>

        <div className="flex items-center gap-4 text-muted-foreground">
          {post.author?.name && (
            <span>作者：{post.author.name}</span>
          )}
          {post.publishedAt && (
            <time dateTime={post.publishedAt.toISOString()}>
              {new Date(post.publishedAt).toLocaleDateString("zh-TW")}
            </time>
          )}
        </div>

        {/* 分類與標籤 */}
        <div className="flex flex-wrap gap-2 mt-4">
          {post.categories.map((c) => (
            <span
              key={c.categoryId}
              className="px-2 py-1 bg-primary/10 text-primary text-sm rounded"
            >
              {c.category.name}
            </span>
          ))}
          {post.tags.map((t) => (
            <span
              key={t.tagId}
              className="px-2 py-1 bg-muted text-muted-foreground text-sm rounded"
            >
              #{t.tag.name}
            </span>
          ))}
        </div>
      </header>

      {/* 摘要 */}
      {post.summary && (
        <div className="bg-muted/50 p-4 rounded-lg mb-8 text-lg">
          {post.summary}
        </div>
      )}

      {/* 文章內容 */}
      <BlogContent content={post.contentMdx} />

      {/* 分享按鈕 */}
      <footer className="mt-12 pt-8 border-t">
        <h3 className="text-lg font-semibold mb-4">分享這篇文章</h3>
        <div className="flex gap-4">
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
              `${process.env.NEXT_PUBLIC_BASE_URL || ""}/blog/${post.slug}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Facebook
          </a>
          <a
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
              `${process.env.NEXT_PUBLIC_BASE_URL || ""}/blog/${post.slug}`
            )}&text=${encodeURIComponent(post.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-sky-500 text-white rounded hover:bg-sky-600"
          >
            Twitter
          </a>
          <a
            href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
              `${process.env.NEXT_PUBLIC_BASE_URL || ""}/blog/${post.slug}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            LINE
          </a>
        </div>
      </footer>
    </article>
  );
}
