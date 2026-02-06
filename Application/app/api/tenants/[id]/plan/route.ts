import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { db } from "@/lib/db";

/**
 * 方案變更 Schema
 */
const updatePlanSchema = z.object({
    plan: z.enum(["SEED", "GROWTH", "PRO"]),
});

/**
 * 方案限制定義
 */
const planLimits: Record<string, { products: number; shops: number; users: number }> = {
    SEED: { products: 10, shops: 1, users: 2 },
    GROWTH: { products: 100, shops: 3, users: 10 },
    PRO: { products: -1, shops: -1, users: -1 }, // -1 表示無限制
};

/**
 * PATCH /api/tenants/[id]/plan
 * 變更租戶方案 (升級/降級)
 * 
 * 升級：直接允許
 * 降級：檢查是否超過新方案限制
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { session } = await authWithTenant();
        if (!session) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } },
                { status: 401 }
            );
        }

        // 只有 OWNER 可以變更方案
        if (session.user.role !== "OWNER") {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "權限不足" } },
                { status: 403 }
            );
        }

        const { id } = await params;

        // 確認用戶有權限操作此租戶
        if (id !== session.user.tenantId) {
            return NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: "無法變更其他租戶的方案" } },
                { status: 403 }
            );
        }

        const body = await request.json();
        const validation = updatePlanSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: "INVALID_INPUT", message: validation.error.errors[0].message },
                },
                { status: 400 }
            );
        }

        const { plan: newPlan } = validation.data;

        // 取得目前租戶資訊與使用量
        const tenant = await db.tenant.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        products: true,
                        shops: true,
                        users: true,
                    },
                },
            },
        });

        if (!tenant) {
            return NextResponse.json(
                { success: false, error: { code: "NOT_FOUND", message: "找不到租戶" } },
                { status: 404 }
            );
        }

        const currentPlan = tenant.plan;
        const newLimits = planLimits[newPlan];

        // 降級檢查：驗證功能限制
        const planHierarchy = ["SEED", "GROWTH", "PRO"];
        const isDowngrade = planHierarchy.indexOf(newPlan) < planHierarchy.indexOf(currentPlan);

        if (isDowngrade) {
            const violations: string[] = [];

            if (newLimits.products !== -1 && tenant._count.products > newLimits.products) {
                violations.push(`商品數量 (${tenant._count.products}) 超過 ${newPlan} 方案上限 (${newLimits.products})`);
            }
            if (newLimits.shops !== -1 && tenant._count.shops > newLimits.shops) {
                violations.push(`商店數量 (${tenant._count.shops}) 超過 ${newPlan} 方案上限 (${newLimits.shops})`);
            }
            if (newLimits.users !== -1 && tenant._count.users > newLimits.users) {
                violations.push(`用戶數量 (${tenant._count.users}) 超過 ${newPlan} 方案上限 (${newLimits.users})`);
            }

            if (violations.length > 0) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: "DOWNGRADE_LIMIT_EXCEEDED",
                            message: "無法降級：超出降級限制",
                            details: violations,
                        },
                    },
                    { status: 422 }
                );
            }
        }

        // 更新租戶方案
        const updatedTenant = await db.tenant.update({
            where: { id },
            data: { plan: newPlan },
        });

        // 同步更新計費帳戶 (若存在)
        await db.tenantBillingAccount.updateMany({
            where: { tenantId: id },
            data: { plan: newPlan },
        });

        return NextResponse.json({
            success: true,
            data: {
                tenant: updatedTenant,
                previousPlan: currentPlan,
                newPlan,
                action: isDowngrade ? "DOWNGRADE" : "UPGRADE",
            },
            message: `方案已${isDowngrade ? "降級" : "升級"}為 ${newPlan}`,
        });
    } catch (error) {
        console.error("變更方案錯誤:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "變更方案失敗" } },
            { status: 500 }
        );
    }
}
