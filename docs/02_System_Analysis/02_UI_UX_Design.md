# AIsell - UI/UX Design System "Manus Vibe"

## 1. Design Philosophy
**"Manus Vibe"** combines professional SaaS reliability with the vibrant, futuristic energy of AI. It is designed to be:
- **Mobile-First**: Optimized for micro-retailers managing shops on the go.
- **Vibrant & Friendly**: High-saturation accents to inspire creativity, balanced with deep, clean backgrounds.
- **Depth & Dimension**: Extensive use of **Glassmorphism** to create hierarchy without clutter.

## 2. Color Palette (HSL)

### Primary Colors
Dynamic Violet/Indigo to represent AI intelligence and innovation.

| Token | Light Mode (HSL) | Dark Mode (HSL) | Description |
|-------|------------------|-----------------|-------------|
| **Primary** | `255 85% 60%` (Vivid Purple) | `255 90% 65%` (Glowing Violet) | Brand color, primary actions, active states. |
| **Secondary** | `220 14% 96%` (Cool Grey) | `217 32% 17%` (Deep Slate) | Secondary buttons, backgrounds for varied height. |
| **Accent** | `320 80% 60%` (Electric Pink) | `320 90% 65%` (Neon Pink) | Highlights, "New" badges, AI suggestions. |

### Backgrounds
- **Light**: `210 40% 98%` (Very subtle cool white)
- **Dark**: `222 47% 11%` (Deep rich blue-black, not pure black)

### Semantic Colors
- **Success**: `142 76% 36%` (Green)
- **Warning**: `48 96% 53%` (Yellow/Amber)
- **Destructive**: `0 84% 60%` (Red)

## 3. Typography
Clean, modern sans-serifs with high readability.

- **Headings**: **Outfit** (or Plus Jakarta Sans) - Geometric, friendly, modern.
- **Body**: **Inter** - Standard, highly legible, professional.

## 4. UI Elements & Effects

### Glassmorphism
Used for sticky headers, modal overlays, and floating action cards.
- **Class**: `bg-background/80 backdrop-blur-md border border-white/20` (Light) / `border-white/10` (Dark)

### Rounded Corners
- **Radius**: `0.75rem` (12px) - Soft, approachable, modern.
  - *Standard*: `rounded-lg` or `rounded-xl` for cards.
  - *Inputs/Buttons*: `rounded-md` -> `rounded-lg`.

### Shadows & Depth
- **Card Shadow**: `shadow-lg` with colored glow in dark mode (`shadow-indigo-500/20`).

## 5. Interaction
- **Hover**: Scale up slightly (`hover:scale-105`) or Lift (`-translate-y-1`) for cards.
- **Active**: `active:scale-95` for buttons (tactile feel).
- **Cursor**: Always `cursor-pointer` on interactive elements.

## 6. Implementation Plan (CSS Variables)

### globals.css Updates
```css
:root {
  --radius: 0.75rem;
  /* Vivid Purple Base */
  --primary: 255 85% 60%; 
  --primary-foreground: 0 0% 100%;
  /* ... updated HSL values ... */
}

.dark {
  /* Glowing Violet */
  --primary: 255 90% 65%;
  --primary-foreground: 0 0% 100%;
  /* Deep Navy Background */
  --background: 222 47% 11%;
  /* ... */
}
```

### Components Update
- Install fonts: `npm install @fontsource/outfit @fontsource/inter`
- Update `layout.tsx` to load fonts.
- Update `tailwind.config.ts` to include font families.

## 7. OpenGraph & Sharing Guidelines

為確保每篇部落格與分享頁面在社群平台呈現一致，需提供 OpenGraph metadata：
- **Title**：優先使用 `og_title`，否則回退 `seo_title` 或文章標題。
- **Description**：優先使用 `og_description`，否則回退 `seo_description` 或文章摘要。
- **Image**：使用 `og_image_url`，建議尺寸 1200x630（1.91:1）。
- **Fallback**：若文章未提供，使用站點預設 OG 圖與品牌標題。

同樣適用於商品頁與分享頁面：
- **商品 Title**：優先使用 `products.og_title`，否則回退 `products.name`。
- **商品 Description**：優先使用 `products.og_description`，否則回退商品摘要或介紹。
- **商品 Image**：優先使用 `products.og_image_url`，否則回退 `cover_image_url` 或首張商品圖片。
