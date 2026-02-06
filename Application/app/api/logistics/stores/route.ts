import { NextRequest, NextResponse } from "next/server";
import { authWithTenant } from "@/lib/api/auth-helpers";

/**
 * 超商門市資料介面
 */
interface ConvenienceStore {
  storeId: string;
  storeName: string;
  storeAddress: string;
  storeType: string;
  city: string;
  district: string;
  latitude?: number;
  longitude?: number;
}

/**
 * GET /api/logistics/stores
 * 取得超商門市列表（供超商取貨選擇）
 */
export async function GET(request: NextRequest) {
  try {
    const { session } = await authWithTenant();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "請先登入" },
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") || "ECPAY";
    const storeType = searchParams.get("storeType"); // SEVEN, FAMILY, HILIFE, OK
    const city = searchParams.get("city");
    const keyword = searchParams.get("keyword");

    // TODO: 實際應呼叫物流供應商 API 取得門市資料
    // 這裡提供模擬資料作為示範

    let stores: ConvenienceStore[] = [];

    if (provider === "ECPAY") {
      // ECPay 物流 API 需要實作 GetMapByAddress 或 GetMapHTML
      // https://developers.ecpay.com.tw/?p=7326
      
      // 模擬門市資料
      stores = [
        {
          storeId: "991182",
          storeName: "全家台北信義店",
          storeAddress: "台北市信義區信義路五段7號",
          storeType: "FAMILY",
          city: "台北市",
          district: "信義區",
          latitude: 25.0330,
          longitude: 121.5654,
        },
        {
          storeId: "170868",
          storeName: "7-ELEVEN 世貿門市",
          storeAddress: "台北市信義區信義路五段5號",
          storeType: "SEVEN",
          city: "台北市",
          district: "信義區",
          latitude: 25.0332,
          longitude: 121.5651,
        },
        {
          storeId: "H123456",
          storeName: "萊爾富信義店",
          storeAddress: "台北市信義區松仁路100號",
          storeType: "HILIFE",
          city: "台北市",
          district: "信義區",
          latitude: 25.0350,
          longitude: 121.5670,
        },
        {
          storeId: "OK12345",
          storeName: "OK超商信義店",
          storeAddress: "台北市信義區忠孝東路五段68號",
          storeType: "OK",
          city: "台北市",
          district: "信義區",
          latitude: 25.0410,
          longitude: 121.5680,
        },
      ];
    }

    // 篩選門市類型
    if (storeType) {
      stores = stores.filter((s) => s.storeType === storeType);
    }

    // 篩選城市
    if (city) {
      stores = stores.filter((s) => s.city === city);
    }

    // 關鍵字搜尋
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      stores = stores.filter(
        (s) =>
          s.storeName.toLowerCase().includes(lowerKeyword) ||
          s.storeAddress.toLowerCase().includes(lowerKeyword)
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        provider,
        stores,
        total: stores.length,
      },
    });
  } catch (error) {
    console.error("Get stores error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "取得門市列表失敗" },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/logistics/stores
 * ECPay 門市選擇回傳 (CVSStoreCallback)
 * 接收使用者在 ECPay 地圖選擇的門市資訊
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // ECPay 回傳的門市資訊
    const storeData = {
      merchantId: formData.get("MerchantID"),
      merchantTradeNo: formData.get("MerchantTradeNo"),
      storeId: formData.get("CVSStoreID"),
      storeName: formData.get("CVSStoreName"),
      storeAddress: formData.get("CVSAddress"),
      storeTelephone: formData.get("CVSTelephone"),
      storeOutSide: formData.get("CVSOutSide"),
      extraData: formData.get("ExtraData"),
    };

    // TODO: 將門市資訊儲存至 session 或暫存表
    // 然後重導向回結帳頁面

    return NextResponse.json({
      success: true,
      data: storeData,
    });
  } catch (error) {
    console.error("Store callback error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "處理門市選擇失敗" },
      },
      { status: 500 }
    );
  }
}
