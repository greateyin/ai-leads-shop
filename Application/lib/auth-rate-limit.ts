/**
 * 簡易 In-Memory Rate Limiter
 * 
 * 用於保護認證端點免受暴力攻擊
 * 注意：在多實例部署時需要改用 Redis
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// 定期清理過期記錄（每分鐘）
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60 * 1000);

interface RateLimitOptions {
    windowMs?: number;  // 時間窗口（毫秒）
    max?: number;       // 最大請求數
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfterMs?: number;
}

/**
 * 檢查 IP 是否超過速率限制
 */
export function checkRateLimit(
    identifier: string,
    options: RateLimitOptions = {}
): RateLimitResult {
    const { windowMs = 60 * 1000, max = 10 } = options;
    const now = Date.now();

    let entry = rateLimitStore.get(identifier);

    // 如果沒有記錄或已過期，創建新記錄
    if (!entry || entry.resetAt < now) {
        entry = {
            count: 1,
            resetAt: now + windowMs,
        };
        rateLimitStore.set(identifier, entry);

        return {
            allowed: true,
            remaining: max - 1,
            resetAt: new Date(entry.resetAt),
        };
    }

    // 增加計數
    entry.count++;

    if (entry.count > max) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: new Date(entry.resetAt),
            retryAfterMs: entry.resetAt - now,
        };
    }

    return {
        allowed: true,
        remaining: max - entry.count,
        resetAt: new Date(entry.resetAt),
    };
}

/**
 * 預設配置常量
 */
export const AUTH_RATE_LIMITS = {
    // 登入：每分鐘 5 次
    LOGIN: { windowMs: 60 * 1000, max: 5 },
    // 忘記密碼：每分鐘 3 次
    FORGOT_PASSWORD: { windowMs: 60 * 1000, max: 3 },
    // 註冊：每分鐘 5 次
    REGISTER: { windowMs: 60 * 1000, max: 5 },
    // 驗證碼重發：每分鐘 2 次
    RESEND_VERIFICATION: { windowMs: 60 * 1000, max: 2 },
};

/**
 * 創建 Rate Limit 錯誤回應
 */
export function createRateLimitResponse(result: RateLimitResult) {
    return {
        success: false,
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "請求次數過多，請稍後再試",
            retryAfterMs: result.retryAfterMs,
            resetAt: result.resetAt.toISOString(),
        },
    };
}
