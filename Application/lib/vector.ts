import { db } from "@/lib/db";

/**
 * 向量嵌入類型
 */
export interface Embedding {
    id: string;
    tenantId: string;
    entityType: "PRODUCT" | "BLOG_POST" | "FAQ";
    entityId: string;
    content: string;
    vector: number[];
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

/**
 * 搜尋結果
 */
export interface SearchResult {
    id: string;
    entityType: string;
    entityId: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
}

/**
 * 向量服務配置
 */
interface VectorServiceConfig {
    openaiApiKey?: string;
    model?: string;
    dimensions?: number;
}

/**
 * 向量服務 - 提供嵌入生成和相似度搜尋
 * 
 * 注意：此實現使用 PostgreSQL + pgvector 擴展
 * 如需使用 Pinecone/Supabase Vector，需要修改此類
 */
export class VectorService {
    private config: VectorServiceConfig;

    constructor(config: VectorServiceConfig = {}) {
        this.config = {
            openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
            model: config.model || "text-embedding-3-small",
            dimensions: config.dimensions || 1536,
        };
    }

    /**
     * 生成文本嵌入向量
     */
    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.config.openaiApiKey) {
            throw new Error("OpenAI API key is required for embedding generation");
        }

        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.config.openaiApiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model,
                input: text,
                dimensions: this.config.dimensions,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Embedding generation failed: ${error}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    }

    /**
     * 索引商品到向量資料庫
     */
    async indexProduct(
        tenantId: string,
        productId: string,
        content: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const vector = await this.generateEmbedding(content);

        // 使用 PostgreSQL pgvector 存儲
        await db.$executeRaw`
      INSERT INTO embeddings (id, tenant_id, entity_type, entity_id, content, vector, metadata, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${tenantId}::uuid,
        'PRODUCT',
        ${productId},
        ${content},
        ${JSON.stringify(vector)}::vector,
        ${JSON.stringify(metadata || {})}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (tenant_id, entity_type, entity_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        vector = EXCLUDED.vector,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;
    }

    /**
     * 索引部落格文章到向量資料庫
     */
    async indexBlogPost(
        tenantId: string,
        postId: string,
        content: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const vector = await this.generateEmbedding(content);

        await db.$executeRaw`
      INSERT INTO embeddings (id, tenant_id, entity_type, entity_id, content, vector, metadata, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${tenantId}::uuid,
        'BLOG_POST',
        ${postId},
        ${content},
        ${JSON.stringify(vector)}::vector,
        ${JSON.stringify(metadata || {})}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (tenant_id, entity_type, entity_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        vector = EXCLUDED.vector,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;
    }

    /**
     * 相似度搜尋
     */
    async search(
        tenantId: string,
        query: string,
        options: {
            entityTypes?: ("PRODUCT" | "BLOG_POST" | "FAQ")[];
            limit?: number;
            minScore?: number;
        } = {}
    ): Promise<SearchResult[]> {
        const { entityTypes, limit = 10, minScore = 0.7 } = options;

        const queryVector = await this.generateEmbedding(query);

        // 使用 pgvector 的餘弦相似度搜尋
        const entityTypeFilter = entityTypes?.length
            ? `AND entity_type = ANY(ARRAY[${entityTypes.map((t) => `'${t}'`).join(",")}])`
            : "";

        const results = await db.$queryRaw<SearchResult[]>`
      SELECT
        id,
        entity_type as "entityType",
        entity_id as "entityId",
        content,
        1 - (vector <=> ${JSON.stringify(queryVector)}::vector) as score,
        metadata
      FROM embeddings
      WHERE tenant_id = ${tenantId}::uuid
        ${entityTypeFilter ? db.$queryRaw`${entityTypeFilter}` : db.$queryRaw``}
        AND 1 - (vector <=> ${JSON.stringify(queryVector)}::vector) > ${minScore}
      ORDER BY vector <=> ${JSON.stringify(queryVector)}::vector
      LIMIT ${limit}
    `;

        return results;
    }

    /**
     * 刪除實體的向量索引
     */
    async deleteIndex(
        tenantId: string,
        entityType: "PRODUCT" | "BLOG_POST" | "FAQ",
        entityId: string
    ): Promise<void> {
        await db.$executeRaw`
      DELETE FROM embeddings
      WHERE tenant_id = ${tenantId}::uuid
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
    `;
    }

    /**
     * 刪除租戶的所有向量索引
     */
    async deleteAllForTenant(tenantId: string): Promise<void> {
        await db.$executeRaw`
      DELETE FROM embeddings WHERE tenant_id = ${tenantId}::uuid
    `;
    }
}

// 單例實例
let vectorServiceInstance: VectorService | null = null;

export function getVectorService(): VectorService {
    if (!vectorServiceInstance) {
        vectorServiceInstance = new VectorService();
    }
    return vectorServiceInstance;
}
