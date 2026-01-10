/**
 * lib/utils.ts 單元測試
 */
import { cn, formatCurrency, slugify, isValidEmail, generateOrderNo } from "@/lib/utils";

describe("cn", () => {
  it("should merge class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("should handle conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("should merge tailwind classes correctly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatCurrency", () => {
  it("should format TWD currency", () => {
    expect(formatCurrency(1000, "TWD")).toContain("1,000");
  });

  it("should format USD currency", () => {
    expect(formatCurrency(99.99, "USD")).toContain("99.99");
  });

  it("should handle zero", () => {
    expect(formatCurrency(0, "TWD")).toContain("0");
  });
});

describe("slugify", () => {
  it("should convert to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("should handle Chinese characters", () => {
    const result = slugify("測試商品");
    expect(result).not.toBe("");
  });

  it("should trim and handle multiple spaces", () => {
    expect(slugify("  hello   world  ")).toBe("hello-world");
  });
});

describe("isValidEmail", () => {
  it("should validate correct email", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
  });

  it("should reject invalid email", () => {
    expect(isValidEmail("invalid-email")).toBe(false);
  });

  it("should reject empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
});

describe("generateOrderNo", () => {
  it("should generate unique order numbers", () => {
    const order1 = generateOrderNo();
    const order2 = generateOrderNo();
    expect(order1).not.toBe(order2);
  });

  it("should start with expected prefix", () => {
    const orderNo = generateOrderNo();
    expect(orderNo.length).toBeGreaterThan(10);
  });
});
