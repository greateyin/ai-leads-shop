import { compileMDX } from "next-mdx-remote/rsc";
import { ReactNode, ComponentProps } from "react";

/**
 * MDX 自訂元件
 * 使用原生 HTML 元素 props 類型來確保類型安全
 */
const components = {
  // 標題樣式
  h1: (props: ComponentProps<"h1">) => (
    <h1 className="text-4xl font-bold mt-8 mb-4" {...props} />
  ),
  h2: (props: ComponentProps<"h2">) => (
    <h2 className="text-3xl font-semibold mt-6 mb-3" {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3 className="text-2xl font-medium mt-4 mb-2" {...props} />
  ),
  // 段落
  p: (props: ComponentProps<"p">) => (
    <p className="mb-4 leading-relaxed" {...props} />
  ),
  // 列表
  ul: (props: ComponentProps<"ul">) => (
    <ul className="list-disc list-inside mb-4 space-y-1" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol className="list-decimal list-inside mb-4 space-y-1" {...props} />
  ),
  li: (props: ComponentProps<"li">) => (
    <li className="ml-4" {...props} />
  ),
  // 連結
  a: (props: ComponentProps<"a">) => (
    <a
      className="text-primary hover:underline"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  // 程式碼區塊
  pre: (props: ComponentProps<"pre">) => (
    <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-4 text-sm" {...props} />
  ),
  code: (props: ComponentProps<"code">) => (
    <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
  ),
  // 引用
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground" {...props} />
  ),
  // 圖片
  img: (props: ComponentProps<"img">) => (
    <img
      className="rounded-lg max-w-full h-auto my-4"
      alt=""
      {...props}
    />
  ),
  // 分隔線
  hr: () => <hr className="my-8 border-border" />,
  // 表格
  table: (props: ComponentProps<"table">) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse border border-border" {...props} />
    </div>
  ),
  th: (props: ComponentProps<"th">) => (
    <th className="border border-border px-4 py-2 bg-muted font-semibold text-left" {...props} />
  ),
  td: (props: ComponentProps<"td">) => (
    <td className="border border-border px-4 py-2" {...props} />
  ),
};

/**
 * 渲染 MDX 內容
 * 
 * @param content - MDX 格式的字串
 * @returns Promise<ReactNode> - 渲染後的 React 元件
 * 
 * @example
 * const content = await renderMdx("# Hello World\n\nThis is **MDX**!");
 * return <div>{content}</div>;
 */
export async function renderMdx(content: string): Promise<ReactNode> {
  try {
    const { content: mdxContent } = await compileMDX({
      source: content,
      components,
      options: {
        parseFrontmatter: false,
      },
    });
    return mdxContent;
  } catch (error) {
    console.error("MDX 渲染錯誤:", error);
    // 降級處理：直接顯示純文字
    return (
      <div className="prose prose-lg max-w-none">
        <pre className="whitespace-pre-wrap">{content}</pre>
      </div>
    );
  }
}

/**
 * 檢查內容是否為 HTML (而非 MDX)
 * 用於兼容性處理：若資料庫中儲存的是 HTML，則跳過 MDX 渲染
 */
export function isHtmlContent(content: string): boolean {
  const htmlPatterns = [
    /^<[!?]?[a-zA-Z]/,  // 以 HTML 標籤開頭
    /<\/[a-zA-Z]+>/,    // 包含結束標籤
    /<!DOCTYPE/i,       // DOCTYPE 宣告
  ];
  return htmlPatterns.some((pattern) => pattern.test(content.trim()));
}
