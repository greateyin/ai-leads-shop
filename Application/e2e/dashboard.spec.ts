/**
 * 儀表板 E2E 測試
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  // 需要登入的測試會在 CI 中使用 mock auth
  test.describe.configure({ mode: "serial" });

  test("should display dashboard after login", async ({ page }) => {
    // TODO: 實作登入後的測試
    // 這需要設定測試用戶或 mock authentication
    test.skip();
  });

  test("sidebar navigation should work", async ({ page }) => {
    // TODO: 需要先登入
    test.skip();
  });

  test("products page should be accessible", async ({ page }) => {
    // TODO: 需要先登入
    test.skip();
  });

  test("orders page should be accessible", async ({ page }) => {
    // TODO: 需要先登入
    test.skip();
  });
});

test.describe("Dashboard - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("should be responsive on mobile", async ({ page }) => {
    await page.goto("/");
    // 確認頁面在手機尺寸下正常顯示
    await expect(page.locator("body")).toBeVisible();
  });
});
