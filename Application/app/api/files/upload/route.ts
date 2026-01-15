import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadToStorage, getStorageConfig } from "@/lib/storage";
import { generateId } from "@/lib/id";

// Route segment config for App Router
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local type to avoid stale Prisma client cache issues
type FileEntityType = "SHOP" | "PRODUCT" | "BLOG" | "ORDER" | "USER" | "SYSTEM";
const VALID_ENTITY_TYPES: FileEntityType[] = ["SHOP", "PRODUCT", "BLOG", "ORDER", "USER", "SYSTEM"];

/**
 * Maximum file sizes by entity type
 */
const MAX_FILE_SIZES: Record<string, number> = {
    PRODUCT: 50 * 1024 * 1024, // 50MB
    BLOG: 10 * 1024 * 1024, // 10MB
    SHOP: 10 * 1024 * 1024, // 10MB
    USER: 5 * 1024 * 1024, // 5MB
    ORDER: 10 * 1024 * 1024, // 10MB
    SYSTEM: 10 * 1024 * 1024, // 10MB
};
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Allowed MIME types for upload
 */
const ALLOWED_MIME_TYPES = [
    // Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Archives
    "application/zip",
    "application/x-zip-compressed",
    // Video
    "video/mp4",
    "video/webm",
    // Icons
    "image/x-icon",
    "image/vnd.microsoft.icon",
];

/**
 * POST /api/files/upload
 * Upload a file directly (for smaller files)
 */
export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Parse form data
        let formData;
        try {
            formData = await request.formData();
        } catch {
            return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
        }

        const file = formData.get("file") as File | null;
        const entityType = formData.get("entityType") as FileEntityType;
        const entityId = formData.get("entityId") as string | null;
        const fieldName = formData.get("fieldName") as string | null;

        // Validate required fields
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!entityType) {
            return NextResponse.json(
                { error: "Entity type is required" },
                { status: 400 }
            );
        }

        // Validate entity type is a valid enum value
        if (!VALID_ENTITY_TYPES.includes(entityType)) {
            return NextResponse.json(
                { error: `Invalid entity type: ${entityType}` },
                { status: 400 }
            );
        }

        // Get max file size for this entity type
        const maxFileSize = MAX_FILE_SIZES[entityType] || DEFAULT_MAX_FILE_SIZE;

        // Validate file size
        if (file.size > maxFileSize) {
            return NextResponse.json(
                {
                    error: `File size exceeds ${maxFileSize / 1024 / 1024}MB limit for ${entityType} files`,
                },
                { status: 400 }
            );
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: `File type ${file.type} is not allowed` },
                { status: 400 }
            );
        }

        // Convert file to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Get storage configuration
        const storageConfig = await getStorageConfig();

        let blobUrl: string | null = null;
        let fileData: Buffer | null = null;

        // Upload based on storage provider
        if (storageConfig.provider !== "POSTGRES") {
            // Upload to external storage (R2, S3, or Vercel Blob)
            try {
                const uploadResult = await uploadToStorage(
                    buffer,
                    file.name,
                    file.type,
                    storageConfig
                );
                blobUrl = uploadResult.url;
            } catch (error) {
                console.error("External storage upload failed:", error);
                // Fallback to PostgreSQL
                fileData = buffer;
            }
        } else {
            // Store in PostgreSQL
            fileData = buffer;
        }

        // Insert into database
        const insertedFile = await db.file.create({
            data: {
                id: generateId(),
                tenantId: session.user.tenantId,
                fileName: file.name,
                mimeType: file.type,
                fileSize: file.size,
                data: fileData ? new Uint8Array(fileData) : null,
                blobUrl: blobUrl,
                entityType: entityType,
                entityId: entityId || null,
                fieldName: fieldName || null,
                uploadedBy: session.user.id,
            },
            select: {
                id: true,
                fileName: true,
                mimeType: true,
                fileSize: true,
                blobUrl: true,
            },
        });

        // Return file URL (served via /api/files/[id] which will redirect if blobUrl exists)
        const fileUrl = insertedFile.blobUrl || `/api/files/${insertedFile.id}`;

        return NextResponse.json({
            success: true,
            file: {
                id: insertedFile.id,
                url: fileUrl,
                fileName: insertedFile.fileName,
                mimeType: insertedFile.mimeType,
                fileSize: insertedFile.fileSize,
            },
        });
    } catch (error) {
        console.error("File upload error:", error);
        return NextResponse.json(
            { error: "Failed to upload file" },
            { status: 500 }
        );
    }
}
