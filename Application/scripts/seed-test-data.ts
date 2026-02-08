/**
 * 測試資料產生腳本
 * 執行: npx tsx scripts/seed-test-data.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";

// 載入 .env.local 環境變數
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 商品資料定義
interface ProductData {
    name: string;
    slug: string;
    summary: string;
    descriptionMd: string;
    price: number;
    stock: number;
    sku: string;
    coverImageUrl: string;
    assets: {
        url: string;
        altText: string;
        sortOrder: number;
    }[];
}

const productsData: ProductData[] = [
    {
        name: "精選咖啡豆 - 衣索比亞耶加雪菲",
        slug: "ethiopia-yirgacheffe-coffee",
        summary: "來自衣索比亞耶加雪菲產區的精選單品咖啡豆，帶有濃郁的花香和莓果風味",
        descriptionMd: `## 衣索比亞耶加雪菲咖啡豆

這款咖啡豆來自世界知名的衣索比亞耶加雪菲產區，海拔 1,700-2,200 公尺的高原上，由小農精心栽種並採用水洗處理法，呈現出最純淨的風味特色。

### 風味特點

- 🌸 **花香調**：茉莉花、柑橘花
- 🍓 **莓果調**：藍莓、覆盆子
- 🍋 **柑橘調**：檸檬、萊姆
- 🍵 **茶感**：伯爵茶般的優雅尾韻

### 產區資訊

| 項目 | 資訊 |
|------|------|
| 產區 | 衣索比亞 耶加雪菲 |
| 海拔 | 1,700-2,200m |
| 處理法 | 水洗 |
| 烘焙度 | 淺中焙 |

### 沖煮建議

- **手沖**: 水溫 92°C，粉水比 1:15，萃取時間 2:30-3:00
- **義式**: 水溫 93°C，粉量 18g，萃取量 36ml
- **冷萃**: 粉水比 1:12，冷藏浸泡 12-16 小時`,
        price: 450,
        stock: 100,
        sku: "COFFEE-ETH-001",
        coverImageUrl: "/images/products/coffee-beans-1.png",
        assets: [
            {
                url: "/images/products/coffee-beans-1.png",
                altText: "衣索比亞耶加雪菲咖啡豆包裝",
                sortOrder: 0,
            },
            {
                url: "/images/products/coffee-beans-2.png",
                altText: "手沖咖啡沖煮情境照",
                sortOrder: 1,
            },
        ],
    },
    {
        name: "義大利手工皮革錢包",
        slug: "italian-leather-wallet",
        summary: "義大利頂級植鞣牛皮手工縫製，經典雙折設計，質感極佳",
        descriptionMd: `## 義大利手工皮革錢包

採用義大利托斯卡尼地區百年皮革廠出品的頂級植鞣牛皮，由資深工匠純手工縫製，每一個細節都展現職人精神。

### 產品特點

- ✨ **頂級材質**：義大利 Buttero 植鞣牛皮
- 🪡 **手工縫製**：蠟線手縫，耐用度極高
- 🎨 **自然皮色**：隨時間養成獨特光澤
- 📐 **經典設計**：雙折式簡約風格

### 收納空間

| 功能區 | 數量 |
|--------|------|
| 卡片夾層 | 8 格 |
| 鈔票夾層 | 2 層 |
| 隱藏口袋 | 2 個 |
| 零錢袋 | 1 個（YKK 拉鏈）|

### 產品規格

- **尺寸**: 11.5 x 9.5 x 2 cm（對折狀態）
- **重量**: 約 85g
- **顏色**: 經典棕
- **產地**: 義大利

### 保養建議

定期使用皮革保養油擦拭，避免接觸水分，妥善存放於乾燥處。植鞣皮革會隨使用時間產生美麗的自然光澤，這是品質的最佳證明。`,
        price: 1280,
        stock: 50,
        sku: "WALLET-LTH-001",
        coverImageUrl: "/images/products/leather-wallet-1.png",
        assets: [
            {
                url: "/images/products/leather-wallet-1.png",
                altText: "手工皮革錢包正面特寫",
                sortOrder: 0,
            },
            {
                url: "/images/products/leather-wallet-2.png",
                altText: "皮革錢包展開內部收納空間",
                sortOrder: 1,
            },
        ],
    },
    {
        name: "Pro Air 無線降噪耳機",
        slug: "pro-air-wireless-earbuds",
        summary: "主動降噪 · 40dB 降噪深度 · 8 小時續航 · Hi-Res 音質認證",
        descriptionMd: `## Pro Air 無線降噪耳機

採用最新藍牙 5.3 技術，搭載自研 H2 音訊晶片，支援 40dB 主動降噪深度，無論通勤、辦公或運動，都能提供沉浸式音樂體驗。

### 核心功能

- 🔇 **主動降噪**：40dB 降噪深度，隔絕外界噪音
- 🎵 **Hi-Res 認證**：支援 LDAC 高解析音訊
- 🎤 **通話清晰**：6 麥克風 + AI 通話降噪
- 💧 **IPX5 防水**：運動防汗、日常防潑水

### 技術規格

| 項目 | 規格 |
|------|------|
| 藍牙版本 | Bluetooth 5.3 |
| 驅動單元 | 12mm 複合振膜 |
| 頻率響應 | 20Hz - 40kHz |
| 降噪深度 | 最高 40dB |
| 耳機續航 | 8 小時（開 ANC）/ 12 小時（關 ANC）|
| 充電盒續航 | 總計 32 小時 |
| 快充 | 充電 10 分鐘，播放 2 小時 |
| 充電接口 | USB-C / 無線充電 |

### 包裝內容

- Pro Air 無線耳機 x 1 對
- 無線充電盒 x 1
- USB-C 充電線 x 1
- 矽膠耳塞（S/M/L）x 3 對
- 使用說明書 x 1

### 保固服務

全機一年保固，提供免費維修服務。`,
        price: 2990,
        stock: 30,
        sku: "EARBUDS-BT-001",
        coverImageUrl: "/images/products/wireless-earbuds-1.png",
        assets: [
            {
                url: "/images/products/wireless-earbuds-1.png",
                altText: "Pro Air 無線耳機與充電盒",
                sortOrder: 0,
            },
            {
                url: "/images/products/wireless-earbuds-2.png",
                altText: "運動時使用無線耳機",
                sortOrder: 1,
            },
        ],
    },
];

async function main() {
    console.log("🌱 開始產生測試資料...\n");

    // 1. 建立或取得 Tenant
    let tenant = await prisma.tenant.findFirst();

    if (!tenant) {
        const tenantId = randomUUID();
        tenant = await prisma.tenant.create({
            data: {
                id: tenantId,
                name: "AIsell 測試商店",
                subdomain: "test-shop",
            },
        });
        console.log("✅ 建立 Tenant:", tenant.name);
    } else {
        console.log("✅ 使用現有 Tenant:", tenant.name);
    }

    // 2. 建立或取得 User (作為 Shop Owner)
    let user = await prisma.user.findFirst({
        where: { tenantId: tenant.id },
    });

    if (!user) {
        const userId = randomUUID();
        const hashedPassword = await bcrypt.hash("test123456", 12);
        user = await prisma.user.create({
            data: {
                id: userId,
                tenantId: tenant.id,
                email: "test@example.com",
                name: "測試管理員",
                passwordHash: hashedPassword,
                role: "ADMIN",
            },
        });
        console.log("✅ 建立 User:", user.email);
    } else {
        console.log("✅ 使用現有 User:", user.email);
    }

    // 3. 建立或取得 Shop
    let shop = await prisma.shop.findFirst({
        where: { tenantId: tenant.id },
    });

    if (!shop) {
        const shopId = randomUUID();
        shop = await prisma.shop.create({
            data: {
                id: shopId,
                tenantId: tenant.id,
                ownerId: user.id,
                name: "AIsell 測試商店",
                slug: "aisell-test",
                description: "這是一個測試商店，用於展示 AIsell 電商系統功能",
                currency: "TWD",
            },
        });
        console.log("✅ 建立 Shop:", shop.name);
    } else {
        console.log("✅ 使用現有 Shop:", shop.name);
    }

    // 4. 清除商品資產（商品本身用 upsert，避免外鍵約束錯誤）
    console.log("\n🗑️  清除現有商品圖片資產...");
    await prisma.productAsset.deleteMany({
        where: { tenantId: tenant.id },
    });
    console.log("✅ 已清除舊圖片資產");

    // 5. 建立或更新測試商品
    console.log("\n📦 建立/更新測試商品...");
    const createdProducts = [];

    for (const productData of productsData) {
        // 查找現有商品（用 slug 或 sku）
        const existingProduct = await prisma.product.findFirst({
            where: {
                tenantId: tenant.id,
                OR: [
                    { slug: productData.slug },
                    { sku: productData.sku },
                ],
            },
        });

        let product;
        if (existingProduct) {
            // 更新現有商品
            product = await prisma.product.update({
                where: { id: existingProduct.id },
                data: {
                    name: productData.name,
                    summary: productData.summary,
                    descriptionMd: productData.descriptionMd,
                    price: productData.price,
                    stock: productData.stock,
                    sku: productData.sku,
                    coverImageUrl: productData.coverImageUrl,
                    status: "PUBLISHED",
                },
            });
            console.log(`   🔄 更新: ${product.name}`);
        } else {
            // 建立新商品
            const productId = randomUUID();
            product = await prisma.product.create({
                data: {
                    id: productId,
                    tenantId: tenant.id,
                    shopId: shop.id,
                    name: productData.name,
                    slug: productData.slug,
                    summary: productData.summary,
                    descriptionMd: productData.descriptionMd,
                    price: productData.price,
                    stock: productData.stock,
                    sku: productData.sku,
                    coverImageUrl: productData.coverImageUrl,
                    status: "PUBLISHED",
                },
            });
            console.log(`   ✅ 新增: ${product.name}`);
        }

        // 建立商品圖片資產
        for (const asset of productData.assets) {
            await prisma.productAsset.create({
                data: {
                    id: randomUUID(),
                    tenantId: tenant.id,
                    productId: product.id,
                    type: "IMAGE",
                    url: asset.url,
                    altText: asset.altText,
                    sortOrder: asset.sortOrder,
                },
            });
        }
        console.log(`      📷 已建立 ${productData.assets.length} 張商品圖片`);

        createdProducts.push(product);
    }

    // 6. 顯示測試連結
    console.log("\n" + "═".repeat(70));
    console.log("📋 測試資料產生完成！");
    console.log("═".repeat(70));

    console.log("\n🔐 測試帳號:");
    console.log(`   Email: test@example.com`);
    console.log(`   Password: test123456`);

    console.log("\n🏪 商店資訊:");
    console.log(`   Name: ${shop.name}`);
    console.log(`   Slug: ${shop.slug}`);

    console.log("\n📦 商品列表:");
    for (const p of createdProducts) {
        console.log(`   - ${p.name} (NT$${p.price})`);
        console.log(`     ID: ${p.id}`);
    }

    console.log("\n🌐 API 端點:");
    console.log("   商店: http://localhost:3000/api/shops/public");

    console.log("\n📦 公開商品 API:");
    for (const p of createdProducts) {
        console.log(`   http://localhost:3000/api/products/${p.id}/public`);
    }

    console.log("\n🛒 訪客結帳連結:");
    for (const p of createdProducts) {
        console.log(`   ${p.name}:`);
        console.log(`   http://localhost:3000/checkout?productId=${p.id}&quantity=1`);
    }

    console.log("\n" + "═".repeat(70));
}

main()
    .catch((e) => {
        console.error("❌ 錯誤:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
