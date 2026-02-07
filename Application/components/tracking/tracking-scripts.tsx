"use client";

import Script from "next/script";

/**
 * 追蹤腳本設定介面
 */
export interface TrackingScriptsProps {
  /** Google Analytics 4 Measurement ID */
  ga4MeasurementId?: string | null;
  /** Meta (Facebook) Pixel ID */
  metaPixelId?: string | null;
  /** Google Tag Manager Container ID */
  gtmContainerId?: string | null;
  /** TikTok Pixel ID */
  tiktokPixelId?: string | null;
  /** LINE Tag ID */
  lineTagId?: string | null;
}

/**
 * 追蹤腳本元件
 * 根據租戶設定注入對應的追蹤代碼
 */
export function TrackingScripts({
  ga4MeasurementId,
  metaPixelId,
  gtmContainerId,
  tiktokPixelId,
  lineTagId,
}: TrackingScriptsProps) {
  return (
    <>
      {/* Google Tag Manager */}
      {gtmContainerId && (
        <>
          <Script
            id="gtm-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${gtmContainerId}');
              `,
            }}
          />
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmContainerId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        </>
      )}

      {/* Google Analytics 4 (若未使用 GTM) */}
      {ga4MeasurementId && !gtmContainerId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`}
            strategy="afterInteractive"
          />
          <Script
            id="ga4-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${ga4MeasurementId}');
                window.GA_MEASUREMENT_ID = '${ga4MeasurementId}';
              `,
            }}
          />
        </>
      )}

      {/* Meta (Facebook) Pixel */}
      {metaPixelId && (
        <Script
          id="meta-pixel-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `,
          }}
        />
      )}

      {/* TikTok Pixel */}
      {tiktokPixelId && (
        <Script
          id="tiktok-pixel-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function (w, d, t) {
                w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
                ttq.load('${tiktokPixelId}');
                ttq.page();
              }(window, document, 'ttq');
            `,
          }}
        />
      )}

      {/* LINE Tag */}
      {lineTagId && (
        <Script
          id="line-tag-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(g,d,o){
                g._ltq=g._ltq||[];g._lt=g._lt||function(){g._ltq.push(arguments)};
                var h=d.getElementsByTagName(o)[0];
                var j=d.createElement(o);j.async=1;
                j.src='https://d.line-scdn.net/n/line_tag/public/release/v1/lt.js';
                h.parentNode.insertBefore(j,h);
              })(window, document, 'script');
              _lt('init', {
                customerType: 'lap',
                tagId: '${lineTagId}'
              });
              _lt('send', 'pv', ['${lineTagId}']);
            `,
          }}
        />
      )}
    </>
  );
}

/**
 * 追蹤事件用的商品項目介面
 */
interface TrackingItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
}

/**
 * 追蹤事件輔助函式
 * 支援 GA4、Meta Pixel、TikTok Pixel、LINE Tag 事件推送
 */
export const trackingEvents = {
  /**
   * 追蹤頁面瀏覽
   */
  pageView: (url: string) => {
    // GA4
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("config", window.GA_MEASUREMENT_ID, {
        page_path: url,
      });
    }
    // Meta Pixel
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
    // TikTok
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.page();
    }
  },

  /**
   * 追蹤商品列表曝光 (GA4: view_item_list)
   */
  viewItemList: (listName: string, items: TrackingItem[]) => {
    // GA4
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "view_item_list", {
        item_list_name: listName,
        items: items.map((item, index) => ({
          item_id: item.id,
          item_name: item.name,
          price: item.price,
          quantity: item.quantity,
          index,
          item_category: item.category,
        })),
      });
    }
    // Meta Pixel - ViewContent for list
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "ViewContent", {
        content_type: "product_group",
        content_ids: items.map((i) => i.id),
        contents: items.map((i) => ({ id: i.id, quantity: i.quantity })),
      });
    }
    // TikTok
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.track("ViewContent", {
        content_type: "product_group",
        content_id: items.map((i) => i.id).join(","),
        quantity: items.length,
      });
    }
  },

  /**
   * 追蹤商品列表中的點擊 (GA4: select_item)
   */
  selectItem: (listName: string, item: TrackingItem, index: number) => {
    // GA4
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "select_item", {
        item_list_name: listName,
        items: [
          {
            item_id: item.id,
            item_name: item.name,
            price: item.price,
            quantity: item.quantity,
            index,
            item_category: item.category,
          },
        ],
      });
    }
  },

  /**
   * 追蹤商品詳情頁瀏覽 (GA4: view_item)
   */
  viewItem: (product: TrackingItem) => {
    // GA4
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "view_item", {
        currency: "TWD",
        value: product.price,
        items: [
          {
            item_id: product.id,
            item_name: product.name,
            price: product.price,
            quantity: 1,
            item_category: product.category,
          },
        ],
      });
    }
    // Meta Pixel
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "ViewContent", {
        content_ids: [product.id],
        content_name: product.name,
        content_type: "product",
        value: product.price,
        currency: "TWD",
      });
    }
    // TikTok
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.track("ViewContent", {
        content_id: product.id,
        content_name: product.name,
        content_type: "product",
        price: product.price,
        value: product.price,
        currency: "TWD",
      });
    }
    // LINE Tag
    if (typeof window !== "undefined" && window._lt) {
      window._lt("send", "cv", { type: "ViewContent" });
    }
  },

  /**
   * 追蹤加入購物車
   */
  addToCart: (product: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    category?: string;
  }) => {
    // GA4
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "add_to_cart", {
        currency: "TWD",
        value: product.price * product.quantity,
        items: [
          {
            item_id: product.id,
            item_name: product.name,
            price: product.price,
            quantity: product.quantity,
            item_category: product.category,
          },
        ],
      });
    }
    // Meta Pixel
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "AddToCart", {
        content_ids: [product.id],
        content_name: product.name,
        content_type: "product",
        value: product.price * product.quantity,
        currency: "TWD",
      });
    }
    // TikTok
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.track("AddToCart", {
        content_id: product.id,
        content_name: product.name,
        quantity: product.quantity,
        price: product.price,
        value: product.price * product.quantity,
        currency: "TWD",
      });
    }
  },

  /**
   * 追蹤購買完成
   */
  purchase: (order: {
    id: string;
    total: number;
    items: Array<{ id: string; name: string; price: number; quantity: number; category?: string }>;
  }) => {
    // GA4
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "purchase", {
        transaction_id: order.id,
        value: order.total,
        currency: "TWD",
        items: order.items.map((item) => ({
          item_id: item.id,
          item_name: item.name,
          price: item.price,
          quantity: item.quantity,
          item_category: item.category,
        })),
      });
    }
    // Meta Pixel
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "Purchase", {
        content_ids: order.items.map((i) => i.id),
        content_type: "product",
        value: order.total,
        currency: "TWD",
        num_items: order.items.length,
      });
    }
    // TikTok
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.track("CompletePayment", {
        content_id: order.id,
        quantity: order.items.length,
        value: order.total,
        currency: "TWD",
      });
    }
    // LINE Tag
    if (typeof window !== "undefined" && window._lt) {
      window._lt("send", "cv", { type: "Purchase" });
    }
  },

  /**
   * 追蹤開始結帳 (GA4: begin_checkout)
   */
  beginCheckout: (cart: {
    total: number;
    items: Array<{ id: string; name: string; price: number; quantity: number; category?: string }>;
  }) => {
    // GA4
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "begin_checkout", {
        currency: "TWD",
        value: cart.total,
        items: cart.items.map((item) => ({
          item_id: item.id,
          item_name: item.name,
          price: item.price,
          quantity: item.quantity,
          item_category: item.category,
        })),
      });
    }
    // Meta Pixel
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "InitiateCheckout", {
        content_ids: cart.items.map((i) => i.id),
        content_type: "product",
        value: cart.total,
        currency: "TWD",
        num_items: cart.items.length,
      });
    }
    // TikTok
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.track("InitiateCheckout", {
        content_id: cart.items.map((i) => i.id).join(","),
        quantity: cart.items.length,
        value: cart.total,
        currency: "TWD",
      });
    }
    // LINE Tag
    if (typeof window !== "undefined" && window._lt) {
      window._lt("send", "cv", { type: "InitiateCheckout" });
    }
  },
};

// 擴展 Window 介面以支援追蹤全域變數
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: {
      page: () => void;
      track: (event: string, data?: Record<string, unknown>) => void;
    };
    _lt?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    GA_MEASUREMENT_ID?: string;
  }
}
