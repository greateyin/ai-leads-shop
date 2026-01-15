/**
 * 測試資料產生腳本
 * 執行: npx tsx scripts/seed-test-data.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
                description: "這是一個測試商店，用於測試訪客結帳功能",
                currency: "TWD",
            },
        });
        console.log("✅ 建立 Shop:", shop.name);
    } else {
        console.log("✅ 使用現有 Shop:", shop.name);
    }

    // 4. 建立測試商品
    const productsData = [
        {
            name: "精選咖啡豆 - 衣索比亞",
            slug: "ethiopia-coffee-beans",
            summary: "來自衣索比亞的精選咖啡豆，帶有花香和莓果風味",
            descriptionMd: "## 衣索比亞咖啡豆\n\n這款咖啡豆來自衣索比亞高原，具有獨特的花香和莓果風味。\n\n### 風味特點\n- 花香\n- 莓果\n- 柑橘\n\n### 沖煮建議\n- 手沖: 92°C, 1:15 比例\n- 義式: 90°C, 18g 粉",
            price: 450,
            stock: 100,
            sku: "COFFEE-ETH-001",
        },
        {
            name: "手工皮革錢包",
            slug: "handmade-leather-wallet",
            summary: "義大利頂級牛皮手工製作，經典款式",
            descriptionMd: "## 手工皮革錢包\n\n採用義大利進口頂級牛皮，純手工縫製。\n\n### 產品特點\n- 8 個卡槽\n- 2 個鈔票夾層\n- 1 個零錢袋",
            price: 1280,
            stock: 50,
            sku: "WALLET-LTH-001",
        },
        {
            name: "無線藍牙耳機",
            slug: "wireless-bluetooth-earbuds",
            summary: "主動降噪，續航力強，音質出色",
            descriptionMd: "## 無線藍牙耳機\n\n採用最新藍牙 5.3 技術，支援主動降噪。\n\n### 規格\n- 續航: 8 小時\n- 驅動單元: 12mm\n- 防水等級: IPX5",
            price: 2990,
            stock: 30,
            sku: "EARBUDS-BT-001",
        },
    ];

    const createdProducts = [];

    for (const productData of productsData) {
        let product = await prisma.product.findFirst({
            where: {
                slug: productData.slug,
                shopId: shop.id,
            },
        });

        if (!product) {
            product = await prisma.product.create({
                data: {
                    id: randomUUID(),
                    tenantId: tenant.id,
                    shopId: shop.id,
                    ...productData,
                    status: "PUBLISHED",
                },
            });
            console.log("✅ 建立商品:", product.name);
        } else {
            // Update to PUBLISHED if not already
            if (product.status !== "PUBLISHED") {
                product = await prisma.product.update({
                    where: { id: product.id },
                    data: { status: "PUBLISHED" },
                });
            }
            console.log("✅ 商品已存在:", product.name);
        }
        createdProducts.push(product);
    }

    // 5. 顯示測試連結
    console.log("\n" + "═".repeat(70));
    console.log("📋 測試資料產生完成！");
    console.log("═".repeat(70));

    console.log("\n🔐 測試帳號:");
    console.log(`   Email: test@example.com`);
    console.log(`   Password: test123456`);

    console.log("\n🏪 公開 API:");
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
