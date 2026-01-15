/**
 * MDX Rendering Utilities
 *
 * This module provides utilities for rendering MDX content in blog posts
 * and other content areas, replacing dangerouslySetInnerHTML with proper
 * MDX rendering as specified in program_spec.md.
 *
 * Uses next-mdx-remote for server-side MDX rendering.
 */

import { MDXRemote, MDXRemoteProps } from "next-mdx-remote/rsc";
import { ReactNode } from "react";

/**
 * Custom components for MDX rendering
 * Add any custom components you want to make available in MDX here
 */
const mdxComponents: MDXRemoteProps["components"] = {
    // Enhanced heading styles
    h1: ({ children }) => (
        <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-2xl font-bold mt-6 mb-3">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>
    ),

    // Enhanced paragraph and text
    p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,

    // Enhanced links
    a: ({ href, children }) => (
        <a
            href={href}
            className="text-primary hover:underline"
            target={href?.startsWith("http") ? "_blank" : undefined}
            rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
        >
            {children}
        </a>
    ),

    // Enhanced code blocks
    pre: ({ children }) => (
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4">
            {children}
        </pre>
    ),
    code: ({ children }) => (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{children}</code>
    ),

    // Enhanced lists
    ul: ({ children }) => <ul className="list-disc pl-6 mb-4">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 mb-4">{children}</ol>,
    li: ({ children }) => <li className="mb-1">{children}</li>,

    // Enhanced blockquotes
    blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-primary pl-4 italic my-4">
            {children}
        </blockquote>
    ),

    // Enhanced images
    img: ({ src, alt }) => (
        <img
            src={src}
            alt={alt || ""}
            className="rounded-lg max-w-full h-auto my-4"
            loading="lazy"
        />
    ),

    // Enhanced tables
    table: ({ children }) => (
        <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse">{children}</table>
        </div>
    ),
    th: ({ children }) => (
        <th className="border border-muted-foreground/20 px-4 py-2 bg-muted font-semibold text-left">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="border border-muted-foreground/20 px-4 py-2">{children}</td>
    ),

    // Horizontal rule
    hr: () => <hr className="my-8 border-muted-foreground/20" />,
};

/**
 * Check if content appears to be HTML (starts with a tag)
 */
export function isHtmlContent(content: string): boolean {
    const trimmed = content.trim();
    // Check if it starts with a common HTML tag
    return (
        trimmed.startsWith("<!DOCTYPE") ||
        trimmed.startsWith("<html") ||
        trimmed.startsWith("<div") ||
        trimmed.startsWith("<p>") ||
        trimmed.startsWith("<article") ||
        trimmed.startsWith("<section")
    );
}

/**
 * Render MDX content to React elements
 *
 * @param source - MDX/Markdown source string
 * @returns Rendered React component
 */
export async function renderMdx(source: string): Promise<ReactNode> {
    if (!source) {
        return null;
    }

    try {
        return (
            <MDXRemote
                source={source}
                components={mdxComponents}
                options={{
                    parseFrontmatter: false,
                    mdxOptions: {
                        development: process.env.NODE_ENV === "development",
                    },
                }}
            />
        );
    } catch (error) {
        console.error("MDX rendering error:", error);
        // Fallback to plain text if MDX parsing fails
        return (
            <div className="prose prose-lg max-w-none">
                <pre className="whitespace-pre-wrap">{source}</pre>
            </div>
        );
    }
}

/**
 * Render MDX content with custom components
 *
 * @param source - MDX/Markdown source string
 * @param customComponents - Additional custom components
 * @returns Rendered React component
 */
export async function renderMdxWithComponents(
    source: string,
    customComponents?: MDXRemoteProps["components"]
): Promise<ReactNode> {
    if (!source) {
        return null;
    }

    try {
        return (
            <MDXRemote
                source={source}
                components={{ ...mdxComponents, ...customComponents }}
                options={{
                    parseFrontmatter: false,
                    mdxOptions: {
                        development: process.env.NODE_ENV === "development",
                    },
                }}
            />
        );
    } catch (error) {
        console.error("MDX rendering error:", error);
        return (
            <div className="prose prose-lg max-w-none">
                <pre className="whitespace-pre-wrap">{source}</pre>
            </div>
        );
    }
}
