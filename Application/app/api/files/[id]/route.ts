import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authWithTenant } from "@/lib/api/auth-helpers";
import { deleteFromStorage } from "@/lib/storage";

/**
 * Check if user has access to a file based on entityType and ownership
 */
async function checkFileAccess(
    file: {
        id: string;
        tenantId: string;
        entityType: string;
        entityId: string | null;
    },
    userId: string | undefined,
    userTenantId: string | undefined,
    userRole: string | undefined
): Promise<boolean> {
    // [安全] 公開可存取的內容（已發布的商品/部落格圖片、商店 logo）不需要登入
    // 但仍需確認內容確實已公開，不可讓未公開的檔案外洩
    if (file.entityType === "SHOP" && file.entityId) {
        const shop = await db.shop.findFirst({
            where: { id: file.entityId, tenantId: file.tenantId },
            select: { id: true },
        });
        if (shop) return true;
    }

    if (file.entityType === "PRODUCT" && file.entityId) {
        const product = await db.product.findFirst({
            where: { id: file.entityId, tenantId: file.tenantId },
            select: { status: true },
        });
        if (product?.status === "PUBLISHED") return true;
    }

    if (file.entityType === "BLOG" && file.entityId) {
        const post = await db.blogPost.findFirst({
            where: { id: file.entityId, tenantId: file.tenantId },
            select: { status: true },
        });
        if (post?.status === "PUBLISHED") return true;
    }

    // [安全] 非公開內容 — 必須登入且有有效租戶
    if (!userId || !userTenantId) {
        return false;
    }

    // [安全] 必須來自同一租戶（無 tenantId 時一律拒絕，不再跳過比對）
    if (file.tenantId !== userTenantId) {
        return false;
    }

    // Admins/Owners have access to everything within their tenant
    if (userRole === "OWNER" || userRole === "ADMIN") {
        return true;
    }

    // System files are accessible within tenant
    if (file.entityType === "SYSTEM") {
        return true;
    }

    // Order files - only accessible by order owner
    if (file.entityType === "ORDER" && file.entityId) {
        const order = await db.order.findFirst({
            where: { id: file.entityId, tenantId: file.tenantId },
            select: { userId: true },
        });
        return order?.userId === userId;
    }

    // User files - only accessible by the owner
    if (file.entityType === "USER") {
        return file.entityId === userId;
    }

    // [安全] Default: deny — 未匹配的 entityType 一律拒絕
    return false;
}

/**
 * GET /api/files/[id]
 * Serve a file from storage with authentication
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Fetch file from database
        const file = await db.file.findUnique({
            where: { id },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Get user session for authorization（使用 authWithTenant 驗證 membership）
        const { session } = await authWithTenant({ requireTenant: false });
        const userId = session?.user?.id;
        const userTenantId = session?.user?.tenantId;
        const userRole = session?.user?.role;

        // Check access permission
        const hasAccess = await checkFileAccess(
            {
                id: file.id,
                tenantId: file.tenantId,
                entityType: file.entityType,
                entityId: file.entityId,
            },
            userId,
            userTenantId,
            userRole
        );

        if (!hasAccess) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // If file is stored in external storage, redirect to the URL
        if (file.blobUrl) {
            return NextResponse.redirect(file.blobUrl);
        }

        // Get the binary data and convert to Uint8Array
        if (!file.data) {
            return NextResponse.json({ error: "File data not found" }, { status: 404 });
        }

        const buffer = file.data as Buffer;
        const uint8Array = new Uint8Array(buffer);

        // Determine cache headers based on file type
        const isPublic = file.entityType === "SYSTEM" || file.entityType === "SHOP";
        const cacheControl = isPublic
            ? "public, max-age=31536000, immutable"
            : "private, max-age=3600"; // 1 hour for private content

        // Create response with proper headers
        const response = new NextResponse(uint8Array, {
            status: 200,
            headers: {
                "Content-Type": file.mimeType,
                "Content-Length": file.fileSize.toString(),
                "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
                "Cache-Control": cacheControl,
                ETag: `"${file.id}"`,
            },
        });

        return response;
    } catch (error) {
        console.error("File serve error:", error);
        return NextResponse.json(
            { error: "Failed to serve file" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/files/[id]
 * Delete a file (admin only)
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { session } = await authWithTenant();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is admin or owner（authWithTenant 已驗證 membership，此處檢查角色）
        if (session.user.role !== "OWNER" && session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Fetch file to verify tenant and get blobUrl
        const file = await db.file.findUnique({
            where: { id },
            select: { tenantId: true, blobUrl: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // [安全] 驗證檔案屬於使用者的租戶
        if (file.tenantId !== session.user.tenantId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Delete from external storage if applicable
        if (file.blobUrl) {
            try {
                await deleteFromStorage(file.blobUrl);
            } catch (error) {
                console.error("Failed to delete from external storage:", error);
                // Continue with database deletion
            }
        }

        // Delete from database（加 tenantId 限制）
        await db.file.delete({ where: { id, tenantId: session.user.tenantId } });

        return NextResponse.json({ success: true, deleted: id });
    } catch (error) {
        console.error("File delete error:", error);
        return NextResponse.json(
            { error: "Failed to delete file" },
            { status: 500 }
        );
    }
}
