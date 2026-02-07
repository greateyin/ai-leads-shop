"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * 商品表單資料介面
 * 涵蓋基本資料、價格庫存、媒體、SEO、行銷設定
 */
export interface ProductFormData {
  /** 商品名稱 */
  name: string;
  /** 網址代稱 */
  slug: string;
  /** 商品摘要 */
  summary: string;
  /** 商品描述 (Markdown) */
  descriptionMd: string;
  /** 售價 */
  price: number | string;
  /** 成本 */
  cost: number | string;
  /** 庫存數量 */
  stock: number | string;
  /** SKU */
  sku: string;
  /** 商品狀態 */
  status: string;
  /** 封面圖片 URL */
  coverImageUrl: string;
  /** OG 標題 */
  ogTitle: string;
  /** OG 描述 */
  ogDescription: string;
  /** OG 圖片 URL */
  ogImageUrl: string;
  /** 原價（劃線價） */
  compareAtPrice: string;
  /** 促銷標籤（如「限時特價」「新品」） */
  badge: string;
  /** 行銷活動標籤 */
  campaignTag: string;
  /** 精選到期日 */
  featuredUntil: string;
}

/**
 * ProductForm 元件的 Props
 */
interface ProductFormProps {
  /** 表單模式：新增或編輯 */
  mode: "create" | "edit";
  /** 初始資料（編輯模式用） */
  initialData?: Partial<ProductFormData>;
  /** 商品 ID（編輯模式用） */
  productId?: string;
}

/** 預設空白表單 */
const DEFAULT_FORM: ProductFormData = {
  name: "",
  slug: "",
  summary: "",
  descriptionMd: "",
  price: "",
  cost: "",
  stock: "",
  sku: "",
  status: "DRAFT",
  coverImageUrl: "",
  ogTitle: "",
  ogDescription: "",
  ogImageUrl: "",
  compareAtPrice: "",
  badge: "",
  campaignTag: "",
  featuredUntil: "",
};

/**
 * 共用商品表單元件
 * 分頁籤：基本資料 ｜ 價格庫存 ｜ 媒體 ｜ SEO/分享 ｜ 行銷設定
 * 支援新增與編輯模式，RWD 響應式佈局
 */
export function ProductForm({ mode, initialData, productId }: ProductFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<ProductFormData>({
    ...DEFAULT_FORM,
    ...initialData,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  /** 通用欄位更新 */
  const updateField = (field: keyof ProductFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /** 自動產生 slug */
  const autoSlug = () => {
    if (!formData.name) return;
    const slug = formData.name
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "");
    updateField("slug", slug);
  };

  /** AI 生成商品描述 */
  const handleGenerateDescription = async () => {
    if (!formData.name) {
      alert("請先輸入商品名稱");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: formData.name, keywords: [] }),
      });
      const data = await res.json();
      if (data.success && data.data?.descriptionMd) {
        updateField("descriptionMd", data.data.descriptionMd);
      } else {
        alert(data.error?.message || "AI 生成失敗");
      }
    } catch {
      alert("AI 生成失敗，請稍後再試");
    } finally {
      setIsGenerating(false);
    }
  };

  /** 提交表單 */
  const handleSubmit = async () => {
    if (!formData.name) {
      setError("商品名稱為必填");
      return;
    }
    if (!formData.price) {
      setError("售價為必填");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        name: formData.name,
        slug: formData.slug || undefined,
        summary: formData.summary || undefined,
        descriptionMd: formData.descriptionMd || undefined,
        price: parseFloat(String(formData.price)),
        cost: formData.cost ? parseFloat(String(formData.cost)) : undefined,
        stock: formData.stock ? parseInt(String(formData.stock)) : 0,
        sku: formData.sku || undefined,
        status: formData.status,
        coverImageUrl: formData.coverImageUrl || undefined,
        ogTitle: formData.ogTitle || undefined,
        ogDescription: formData.ogDescription || undefined,
        ogImageUrl: formData.ogImageUrl || undefined,
        compareAtPrice: formData.compareAtPrice
          ? parseFloat(formData.compareAtPrice)
          : undefined,
        badge: formData.badge || undefined,
        campaignTag: formData.campaignTag || undefined,
        featuredUntil: formData.featuredUntil || undefined,
      };

      const url =
        mode === "create"
          ? "/api/products"
          : `/api/products/${productId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        if (mode === "create") {
          router.push("/dashboard/products");
        } else {
          setSuccessMsg("商品已更新成功");
          setTimeout(() => setSuccessMsg(null), 3000);
        }
      } else {
        setError(data.error?.message || "操作失敗");
      }
    } catch {
      setError("操作失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 頂部操作列 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {mode === "create" ? "新增商品" : "編輯商品"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {mode === "create"
              ? "填寫商品資訊，可使用 AI 協助生成描述"
              : "修改商品資訊與行銷設定"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button
            variant="gradient"
            onClick={handleSubmit}
            disabled={isSaving}
            className="shadow-lg shadow-primary/20"
          >
            {isSaving
              ? "儲存中..."
              : mode === "create"
                ? "建立商品"
                : "儲存變更"}
          </Button>
        </div>
      </div>

      {/* 訊息提示 */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 p-3 rounded-lg text-sm">
          {successMsg}
        </div>
      )}

      {/* 分頁籤表單 */}
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start gap-0.5 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="basic" className="rounded-lg text-xs sm:text-sm px-2 sm:px-3">
            基本資料
          </TabsTrigger>
          <TabsTrigger value="pricing" className="rounded-lg text-xs sm:text-sm px-2 sm:px-3">
            價格庫存
          </TabsTrigger>
          <TabsTrigger value="media" className="rounded-lg text-xs sm:text-sm px-2 sm:px-3">
            媒體
          </TabsTrigger>
          <TabsTrigger value="seo" className="rounded-lg text-xs sm:text-sm px-2 sm:px-3">
            SEO / 分享
          </TabsTrigger>
          <TabsTrigger value="marketing" className="rounded-lg text-xs sm:text-sm px-2 sm:px-3">
            行銷設定
          </TabsTrigger>
        </TabsList>

        {/* ── 基本資料 ── */}
        <TabsContent value="basic">
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="pf-name">商品名稱 *</Label>
              <Input
                id="pf-name"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                onBlur={() => {
                  if (!formData.slug) autoSlug();
                }}
                placeholder="例：經典棉質 T-Shirt"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-slug">
                網址代稱
                <span className="text-xs text-muted-foreground ml-2">
                  (留空自動產生)
                </span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pf-slug"
                  value={formData.slug}
                  onChange={(e) => updateField("slug", e.target.value)}
                  placeholder="classic-cotton-tshirt"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoSlug}
                  className="shrink-0"
                >
                  自動產生
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-status">商品狀態</Label>
              <select
                id="pf-status"
                value={formData.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <option value="DRAFT">草稿</option>
                <option value="PUBLISHED">已發布</option>
                <option value="ARCHIVED">已封存</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-summary">商品摘要</Label>
              <textarea
                id="pf-summary"
                value={formData.summary}
                onChange={(e) => updateField("summary", e.target.value)}
                placeholder="簡短描述商品特色（前台列表顯示）"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pf-desc">商品描述 (Markdown)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDescription}
                  disabled={isGenerating}
                >
                  {isGenerating ? "生成中..." : "🤖 AI 生成"}
                </Button>
              </div>
              <textarea
                id="pf-desc"
                value={formData.descriptionMd}
                onChange={(e) => updateField("descriptionMd", e.target.value)}
                placeholder="輸入商品詳細描述（支援 Markdown 語法）"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[200px] font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </TabsContent>

        {/* ── 價格庫存 ── */}
        <TabsContent value="pricing">
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pf-price">售價 (TWD) *</Label>
                <Input
                  id="pf-price"
                  type="number"
                  value={formData.price}
                  onChange={(e) => updateField("price", e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-compare">
                  原價 / 劃線價
                  <span className="text-xs text-muted-foreground ml-2">
                    (用於顯示折扣)
                  </span>
                </Label>
                <Input
                  id="pf-compare"
                  type="number"
                  value={formData.compareAtPrice}
                  onChange={(e) =>
                    updateField("compareAtPrice", e.target.value)
                  }
                  placeholder="留空則不顯示劃線價"
                  min="0"
                  step="1"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pf-cost">成本</Label>
                <Input
                  id="pf-cost"
                  type="number"
                  value={formData.cost}
                  onChange={(e) => updateField("cost", e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-stock">庫存數量</Label>
                <Input
                  id="pf-stock"
                  type="number"
                  value={formData.stock}
                  onChange={(e) => updateField("stock", e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-sku">SKU</Label>
              <Input
                id="pf-sku"
                value={formData.sku}
                onChange={(e) => updateField("sku", e.target.value)}
                placeholder="商品編號（選填）"
              />
            </div>

            {/* 利潤預估 */}
            {formData.price && formData.cost && (
              <div className="bg-secondary/30 rounded-xl p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">預估毛利</span>
                  <span className="font-medium">
                    NT${" "}
                    {(
                      parseFloat(String(formData.price)) -
                      parseFloat(String(formData.cost))
                    ).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">毛利率</span>
                  <span className="font-medium">
                    {(
                      ((parseFloat(String(formData.price)) -
                        parseFloat(String(formData.cost))) /
                        parseFloat(String(formData.price))) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── 媒體 ── */}
        <TabsContent value="media">
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="pf-cover">封面圖片 URL</Label>
              <Input
                id="pf-cover"
                value={formData.coverImageUrl}
                onChange={(e) => updateField("coverImageUrl", e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              {formData.coverImageUrl && (
                <div className="mt-3 rounded-xl overflow-hidden border border-border/50 bg-secondary/20">
                  <img
                    src={formData.coverImageUrl}
                    alt="封面預覽"
                    className="w-full max-h-60 object-cover"
                  />
                </div>
              )}
            </div>

            <div className="border-t pt-5">
              <p className="text-sm text-muted-foreground">
                附加圖片管理功能將在後續版本中提供。目前可透過封面圖片 URL 設定主圖。
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ── SEO / 分享 ── */}
        <TabsContent value="seo">
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 space-y-5">
            <p className="text-sm text-muted-foreground mb-2">
              設定社群分享（Facebook/LINE）時的標題、描述與圖片。留空則自動使用商品基本資料。
            </p>

            <div className="space-y-2">
              <Label htmlFor="pf-og-title">OG 標題</Label>
              <Input
                id="pf-og-title"
                value={formData.ogTitle}
                onChange={(e) => updateField("ogTitle", e.target.value)}
                placeholder={formData.name || "留空則使用商品名稱"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-og-desc">OG 描述</Label>
              <textarea
                id="pf-og-desc"
                value={formData.ogDescription}
                onChange={(e) => updateField("ogDescription", e.target.value)}
                placeholder={formData.summary || "留空則使用商品摘要"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-og-img">OG 圖片 URL</Label>
              <Input
                id="pf-og-img"
                value={formData.ogImageUrl}
                onChange={(e) => updateField("ogImageUrl", e.target.value)}
                placeholder="留空則使用封面圖片"
              />
            </div>

            {/* 預覽卡片 */}
            <div className="border-t pt-5">
              <h4 className="text-sm font-medium mb-3">社群分享預覽</h4>
              <div className="border rounded-xl overflow-hidden max-w-sm bg-white dark:bg-card">
                {(formData.ogImageUrl || formData.coverImageUrl) && (
                  <img
                    src={formData.ogImageUrl || formData.coverImageUrl}
                    alt="OG 預覽"
                    className="w-full h-40 object-cover"
                  />
                )}
                <div className="p-3">
                  <div className="text-xs text-muted-foreground mb-1 truncate">
                    {typeof window !== "undefined"
                      ? window.location.host
                      : "yourshop.com"}
                  </div>
                  <div className="font-semibold text-sm line-clamp-2">
                    {formData.ogTitle || formData.name || "商品標題"}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {formData.ogDescription || formData.summary || "商品描述"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── 行銷設定 ── */}
        <TabsContent value="marketing">
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 space-y-5">
            <p className="text-sm text-muted-foreground mb-2">
              行銷設定會影響前台商品卡片上的標籤與排序邏輯。
            </p>

            <div className="space-y-2">
              <Label htmlFor="pf-badge">
                促銷標籤
                <span className="text-xs text-muted-foreground ml-2">
                  (顯示在商品圖片上)
                </span>
              </Label>
              <Input
                id="pf-badge"
                value={formData.badge}
                onChange={(e) => updateField("badge", e.target.value)}
                placeholder="例：限時特價、新品上市、熱賣中"
              />
              {formData.badge && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs">預覽：</span>
                  <span className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                    {formData.badge}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-campaign">
                行銷活動標籤
                <span className="text-xs text-muted-foreground ml-2">
                  (內部用途，不公開顯示)
                </span>
              </Label>
              <Input
                id="pf-campaign"
                value={formData.campaignTag}
                onChange={(e) => updateField("campaignTag", e.target.value)}
                placeholder="例：2025-spring、valentines-day"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-featured">
                精選到期日
                <span className="text-xs text-muted-foreground ml-2">
                  (到期後自動取消精選)
                </span>
              </Label>
              <Input
                id="pf-featured"
                type="datetime-local"
                value={formData.featuredUntil}
                onChange={(e) => updateField("featuredUntil", e.target.value)}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 底部操作列（手機用） */}
      <div className="flex gap-2 sm:hidden sticky bottom-0 bg-background/95 backdrop-blur-lg border-t p-4 -mx-4 -mb-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
        >
          取消
        </Button>
        <Button
          variant="gradient"
          className="flex-1"
          onClick={handleSubmit}
          disabled={isSaving}
        >
          {isSaving
            ? "儲存中..."
            : mode === "create"
              ? "建立商品"
              : "儲存變更"}
        </Button>
      </div>
    </div>
  );
}
