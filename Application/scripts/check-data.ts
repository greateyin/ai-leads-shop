/**
 * 簡單查詢腳本 - 檢查現有資料
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    console.log("📊 查詢現有資料...\n");

    // 查詢 Tenants
    const tenants = await prisma.tenant.findMany({ take: 5 });
    console.log("Tenants:", tenants.length);
    for (const t of tenants) {
        console.log(`  - ${t.name} (${t.id})`);
    }

    // 查詢 Shops
    const shops = await prisma.shop.findMany({ take: 5 });
    console.log("\nShops:", shops.length);
    for (const s of shops) {
        console.log(`  - ${s.name} (slug: ${s.slug}, id: ${s.id})`);
    }

    // 查詢 Products
    const products = await prisma.product.findMany({
        where: { status: "PUBLISHED" },
        take: 5,
    });
    console.log("\nPublished Products:", products.length);
    for (const p of products) {
        console.log(`  - ${p.name} (price: ${p.price}, id: ${p.id})`);
    }

    // 測試連結
    if (products.length > 0) {
        console.log("\n🔗 測試連結:");
        console.log("   公開商店 API: http://localhost:3000/api/shops/public");
        for (const p of products) {
            console.log(`   商品結帳: http://localhost:3000/checkout?productId=${p.id}&quantity=1`);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
