/**
 * UUIDv7 ID Generator Utility
 *
 * UUIDv7 provides time-ordered, globally unique identifiers that work with
 * PostgreSQL's native uuid type and offer excellent B-tree index performance.
 *
 * Reference: RFC 9562
 *
 * @example
 * ```typescript
 * import { generateId } from "@/lib/id";
 *
 * const userId = generateId();  // "018f6d2c-1b4e-7000-8000-1234567890ab"
 * ```
 */

import { v7 as uuidv7, validate as uuidValidate } from "uuid";

/**
 * 生成 UUIDv7 識別碼
 * 時間排序、全域唯一，適合用於 PostgreSQL uuid 類型的主鍵
 */
export function generateId(): string {
    return uuidv7();
}

/**
 * 驗證字串是否為有效的 UUID
 */
export function isValidId(id: string): boolean {
    return uuidValidate(id);
}

/**
 * 批量生成多個 UUIDv7
 */
export function generateIds(count: number): string[] {
    return Array.from({ length: count }, () => uuidv7());
}

/**
 * 從 UUIDv7 提取時間戳（毫秒）
 * 僅適用於 UUIDv7
 */
export function extractTimestamp(uuid: string): number | null {
    if (!uuidValidate(uuid)) return null;

    // UUIDv7 前 48 bits 是 Unix 時間戳（毫秒）
    const hex = uuid.replace(/-/g, "");
    const timestampHex = hex.substring(0, 12);
    return parseInt(timestampHex, 16);
}

/**
 * 取得 UUIDv7 對應的 Date 物件
 */
export function extractDate(uuid: string): Date | null {
    const timestamp = extractTimestamp(uuid);
    return timestamp ? new Date(timestamp) : null;
}
