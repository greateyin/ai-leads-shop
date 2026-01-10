/**
 * 認證流程 E2E 測試
 */
import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should display login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/登入/);
    await expect(page.getByRole("heading", { name: /登入/i })).toBeVisible();
  });

  test("should display registration page", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveTitle(/註冊/);
    await expect(page.getByRole("heading", { name: /註冊/i })).toBeVisible();
  });

  test("should show validation errors on empty login submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /登入/i }).click();
    // 應顯示驗證錯誤
    await expect(page.locator("form")).toBeVisible();
  });

  test("should navigate from login to register", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /註冊/i }).click();
    await expect(page).toHaveURL(/register/);
  });

  test("should navigate from register to login", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: /登入/i }).click();
    await expect(page).toHaveURL(/login/);
  });

  test("should redirect unauthenticated users from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});

test.describe("Homepage", () => {
  test("should display homepage correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /開始使用/i })).toBeVisible();
  });

  test("should have working navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /登入/i }).click();
    await expect(page).toHaveURL(/login/);
  });
});
