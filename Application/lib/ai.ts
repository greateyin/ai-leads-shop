/**
 * AI 服務整合模組
 * 整合 OpenAI API 用於商品描述生成、FAQ、部落格摘要、智能導購等功能
 */

/**
 * AI 配置介面
 */
interface AIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * 商品描述生成請求
 */
interface ProductDescriptionRequest {
  productName: string;
  keywords?: string[];
  category?: string;
  targetAudience?: string;
}

/**
 * 商品描述生成回應
 */
interface ProductDescriptionResponse {
  descriptionMd: string;
  faq: Array<{ question: string; answer: string }>;
  seoTitle?: string;
  seoDescription?: string;
}

/**
 * 聊天訊息介面
 */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * AI 服務類別
 */
export class AIService {
  private config: AIConfig;
  private baseUrl = "https://api.openai.com/v1";

  constructor(config: AIConfig) {
    this.config = {
      model: "gpt-4o-mini",
      maxTokens: 2000,
      temperature: 0.7,
      ...config,
    };
  }

  /**
   * 生成商品描述
   * @param request - 商品描述請求
   * @returns 商品描述與 FAQ
   */
  async generateProductDescription(
    request: ProductDescriptionRequest
  ): Promise<ProductDescriptionResponse> {
    const prompt = this.buildProductDescriptionPrompt(request);

    const response = await this.chat([
      {
        role: "system",
        content:
          "你是一位專業的電商文案撰寫專家，擅長撰寫吸引人的商品描述。請使用繁體中文回應。",
      },
      { role: "user", content: prompt },
    ]);

    return this.parseProductDescriptionResponse(response);
  }

  /**
   * 生成部落格文章摘要
   * @param content - 文章內容
   * @returns 摘要文字
   */
  async generateBlogSummary(content: string): Promise<string> {
    const response = await this.chat([
      {
        role: "system",
        content:
          "你是一位專業的內容編輯，擅長撰寫簡潔有力的文章摘要。請使用繁體中文回應。",
      },
      {
        role: "user",
        content: `請為以下文章撰寫一段 100-150 字的摘要：\n\n${content}`,
      },
    ]);

    return response;
  }

  /**
   * 智能導購對話
   * @param messages - 對話歷史
   * @param productContext - 商品上下文
   * @returns AI 回應
   */
  async chatWithCustomer(
    messages: ChatMessage[],
    productContext?: string
  ): Promise<string> {
    const systemPrompt = productContext
      ? `你是一位親切專業的電商客服助理。以下是商店的商品資訊供你參考：\n${productContext}\n\n請根據這些資訊回答顧客問題，協助他們找到適合的商品。使用繁體中文回應。`
      : "你是一位親切專業的電商客服助理，協助顧客解答問題並推薦商品。使用繁體中文回應。";

    return this.chat([{ role: "system", content: systemPrompt }, ...messages]);
  }

  /**
   * 生成 SEO 內容
   * @param title - 頁面標題
   * @param content - 頁面內容
   * @returns SEO 元資料
   */
  async generateSEOContent(
    title: string,
    content: string
  ): Promise<{ seoTitle: string; seoDescription: string; keywords: string[] }> {
    const response = await this.chat([
      {
        role: "system",
        content:
          "你是一位 SEO 專家。請根據提供的內容生成優化的 SEO 元資料。回應格式為 JSON。",
      },
      {
        role: "user",
        content: `標題：${title}\n\n內容：${content}\n\n請生成：1. SEO 標題 (60 字內) 2. SEO 描述 (160 字內) 3. 關鍵字陣列 (5-10 個)`,
      },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return {
        seoTitle: title,
        seoDescription: content.substring(0, 160),
        keywords: [],
      };
    }
  }

  /**
   * 銷售預測分析
   * @param historicalData - 歷史銷售數據
   * @returns 預測結果
   */
  async analyzeSalesForecast(
    historicalData: Array<{ date: string; revenue: number; orders: number }>
  ): Promise<{
    trend: "up" | "down" | "stable";
    forecast: number;
    insights: string[];
  }> {
    const response = await this.chat([
      {
        role: "system",
        content:
          "你是一位數據分析專家。請分析銷售數據並提供預測。回應格式為 JSON。",
      },
      {
        role: "user",
        content: `請分析以下銷售數據並預測下週營收：\n${JSON.stringify(historicalData)}`,
      },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return {
        trend: "stable",
        forecast: 0,
        insights: ["數據分析中，請稍後再試"],
      };
    }
  }

  /**
   * 執行聊天完成請求
   */
  public async chat(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API Error: ${error.error?.message || "Unknown error"}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  /**
   * 建構商品描述 prompt
   */
  private buildProductDescriptionPrompt(
    request: ProductDescriptionRequest
  ): string {
    let prompt = `請為以下商品撰寫吸引人的商品描述：\n\n商品名稱：${request.productName}`;

    if (request.keywords?.length) {
      prompt += `\n關鍵字：${request.keywords.join(", ")}`;
    }
    if (request.category) {
      prompt += `\n商品類別：${request.category}`;
    }
    if (request.targetAudience) {
      prompt += `\n目標客群：${request.targetAudience}`;
    }

    prompt += `\n\n請提供：
1. 商品描述 (Markdown 格式，包含特色、規格、使用方式等)
2. 3 個常見問題與解答 (FAQ)
3. SEO 標題建議
4. SEO 描述建議

請以 JSON 格式回應，包含 descriptionMd, faq, seoTitle, seoDescription 欄位。`;

    return prompt;
  }

  /**
   * 解析商品描述回應
   */
  private parseProductDescriptionResponse(
    response: string
  ): ProductDescriptionResponse {
    try {
      // 嘗試解析 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // 解析失敗，返回預設結構
    }

    return {
      descriptionMd: response,
      faq: [],
    };
  }
}

/**
 * 建立 AI 服務實例
 */
export function createAIService(): AIService {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new AIService({ apiKey });
}

/**
 * 計算 token 使用量 (粗略估算)
 * @param text - 文字內容
 * @returns 預估 token 數
 */
export function estimateTokens(text: string): number {
  // 粗略估算：中文約 1.5 字 = 1 token，英文約 4 字母 = 1 token
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}
