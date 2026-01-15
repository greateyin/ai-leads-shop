import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function createTestAccount() {
    const email = "test@example.com";
    const password = "test1234";
    const hashedPassword = await bcrypt.hash(password, 12);

    const userId = randomUUID();
    const tenantId = randomUUID();
    const shopId = randomUUID();
    const userTenantId = randomUUID();

    console.log("Creating test account...");
    console.log("Email:", email);
    console.log("Password:", password);

    try {
        // 先檢查是否已存在
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            console.log("\n========================================");
            console.log("⚠️ 帳號已存在，使用現有帳號登入：");
            console.log("Email:", email);
            console.log("Password:", password);
            console.log("========================================\n");
            return;
        }

        // 1. 先建立租戶 (User 需要 tenantId)
        const tenant = await prisma.tenant.create({
            data: {
                id: tenantId,
                name: "測試商店",
                subdomain: `test-${Date.now()}`, // 確保唯一
            },
        });
        console.log("✅ Tenant created:", tenant.id);

        // 2. 建立用戶
        const user = await prisma.user.create({
            data: {
                id: userId,
                tenantId: tenant.id,
                email,
                name: "測試用戶",
                passwordHash: hashedPassword,
                role: "OWNER",
                emailVerified: new Date(),
            },
        });
        console.log("✅ User created:", user.id);

        // 3. 建立商店
        const shop = await prisma.shop.create({
            data: {
                id: shopId,
                tenantId,
                ownerId: userId,
                name: "測試商店",
                slug: `test-shop-${Date.now()}`,
                currency: "TWD",
                timezone: "Asia/Taipei",
            },
        });
        console.log("✅ Shop created:", shop.id);

        // 4. 建立用戶與租戶的關聯
        await prisma.userTenant.create({
            data: {
                id: userTenantId,
                userId,
                tenantId,
                role: "OWNER",
                isDefault: true,
            },
        });
        console.log("✅ UserTenant relation created");

        // 5. 建立一些測試商品
        await prisma.product.create({
            data: {
                id: randomUUID(),
                tenantId,
                shopId,
                name: "測試商品",
                slug: `test-product-${Date.now()}`,
                sku: `SKU-${Date.now()}`,
                price: 999,
                stock: 100,
                status: "PUBLISHED",
            },
        });
        console.log("✅ Test product created");

        console.log("\n========================================");
        console.log("✅ 測試帳號建立成功！");
        console.log("========================================");
        console.log("Email:", email);
        console.log("Password:", password);
        console.log("Tenant:", tenant.subdomain);
        console.log("Shop:", shop.slug);
        console.log("========================================\n");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

createTestAccount();
