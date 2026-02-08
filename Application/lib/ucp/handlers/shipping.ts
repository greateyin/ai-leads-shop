/**
 * UCP Shipping Calculation
 *
 * 封裝運費計算邏輯，整合既有 lib/logistics 模組，
 * 提供 Google v1 checkout session 所需的 delivery options 與運費重算。
 *
 * @module lib/ucp/handlers/shipping
 */

import { db } from "@/lib/db";
import { calculateShippingFee, type ShippingType } from "@/lib/logistics";
import type { UcpAddress, UcpMoney } from "@/lib/ucp/types";

// ===========================================
// Delivery Option 定義
// ===========================================

/** 可選配送方式 */
export interface DeliveryOption {
    /** 唯一識別碼，用於 selectedDeliveryOptionRef */
    ref: string;
    /** 顯示名稱 */
    name: string;
    /** 配送類型（對應 logistics 模組） */
    shippingType: ShippingType;
    /** 運費（UCP minor units） */
    cost: UcpMoney;
    /** 預估配送天數 */
    estimatedDays: number;
}

// ===========================================
// 商家運費設定（從 shop config 讀取）
// ===========================================

/** 商家可用的配送方式設定 */
interface ShopShippingConfig {
    /** 啟用的配送方式 */
    enabledTypes: ShippingType[];
    /** 免運門檻（0 = 無免運） */
    freeShippingThreshold: number;
    /** 幣別 */
    currency: string;
}

/**
 * 從商店設定讀取運費配置
 * @param shopId - 商店 ID
 * @returns 運費配置
 */
async function getShopShippingConfig(shopId: string): Promise<ShopShippingConfig> {
    const shop = await db.shop.findFirst({
        where: { id: shopId },
        select: { config: true, currency: true },
    });

    const config = shop?.config as Record<string, unknown> | null;
    const shippingConfig = config?.shipping as Record<string, unknown> | undefined;

    return {
        enabledTypes: (shippingConfig?.enabledTypes as ShippingType[]) || [
            "HOME",
            "CVS_711",
            "CVS_FAMI",
        ],
        freeShippingThreshold: (shippingConfig?.freeShippingThreshold as number) || 1000,
        currency: shop?.currency || "TWD",
    };
}

// ===========================================
// 配送方式顯示名稱
// ===========================================

const DELIVERY_DISPLAY_NAMES: Record<ShippingType, string> = {
    HOME: "宅配到府",
    CVS_PICKUP: "超商取貨",
    CVS_FAMI: "全家取貨",
    CVS_711: "7-11 取貨",
    CVS_HILIFE: "萊爾富取貨",
};

const DELIVERY_ESTIMATED_DAYS: Record<ShippingType, number> = {
    HOME: 3,
    CVS_PICKUP: 3,
    CVS_FAMI: 3,
    CVS_711: 3,
    CVS_HILIFE: 3,
};

// ===========================================
// 公開 API
// ===========================================

/**
 * 取得商家可用的配送方式與費用
 *
 * @param shopId - 商店 ID
 * @param cartSubtotal - 購物車小計（已轉換為整數金額）
 * @param shippingAddress - 收件地址（影響是否可宅配等）
 * @returns 可選配送方式清單
 */
export async function getAvailableDeliveryOptions(
    shopId: string,
    cartSubtotal: number,
    shippingAddress?: UcpAddress
): Promise<DeliveryOption[]> {
    const config = await getShopShippingConfig(shopId);
    const options: DeliveryOption[] = [];

    for (const type of config.enabledTypes) {
        const fee = calculateShippingFee(type, cartSubtotal);

        options.push({
            ref: type.toLowerCase().replace(/_/g, "-"),
            name: DELIVERY_DISPLAY_NAMES[type] || type,
            shippingType: type,
            cost: {
                value: Math.round(fee * 100),
                currency: config.currency,
            },
            estimatedDays: DELIVERY_ESTIMATED_DAYS[type] || 5,
        });
    }

    return options;
}

/**
 * 根據選定的 delivery option ref 計算實際運費
 *
 * @param shopId - 商店 ID
 * @param deliveryRef - 使用者選定的配送方式 ref（例如 "home", "cvs-711"）
 * @param cartSubtotal - 購物車小計
 * @returns 運費 UcpMoney，若 ref 無效則回傳 null
 */
export async function calculateDeliveryFee(
    shopId: string,
    deliveryRef: string,
    cartSubtotal: number
): Promise<UcpMoney | null> {
    const config = await getShopShippingConfig(shopId);

    // ref → ShippingType 映射
    const refToType: Record<string, ShippingType> = {};
    for (const type of config.enabledTypes) {
        refToType[type.toLowerCase().replace(/_/g, "-")] = type;
    }

    const shippingType = refToType[deliveryRef];
    if (!shippingType) return null;

    const fee = calculateShippingFee(shippingType, cartSubtotal);

    return {
        value: Math.round(fee * 100),
        currency: config.currency,
    };
}

/**
 * 使用預設配送方式計算運費（沒有 deliveryRef 時的 fallback）
 *
 * @param shopId - 商店 ID
 * @param cartSubtotal - 購物車小計
 * @param hasShippingAddress - 是否有寄送地址
 * @returns 運費金額（非 minor units）
 */
export async function calculateDefaultShippingFee(
    shopId: string,
    cartSubtotal: number,
    hasShippingAddress: boolean
): Promise<number> {
    if (!hasShippingAddress) return 0;

    const config = await getShopShippingConfig(shopId);
    const defaultType = config.enabledTypes[0] || "HOME";

    return calculateShippingFee(defaultType, cartSubtotal);
}
