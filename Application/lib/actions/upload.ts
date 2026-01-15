"use server";

import { db } from "@/lib/db";
import { generateId } from "@/lib/id";
import { uploadToStorage, getStorageConfig, type StorageConfig } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// Use local type instead of importing from @prisma/client (avoids cache issues)
type FileEntityType = "SHOP" | "PRODUCT" | "BLOG" | "ORDER" | "USER" | "SYSTEM";

const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB safe limit for Vercel/proxies

/**
 * Maximum file sizes by entity type
 */
const MAX_FILE_SIZES: Record<string, number> = {
    PRODUCT: 50 * 1024 * 1024, // 50MB for product assets
    BLOG: 10 * 1024 * 1024, // 10MB for blog images
    SHOP: 10 * 1024 * 1024, // 10MB for shop assets
    USER: 5 * 1024 * 1024, // 5MB for user avatars
    ORDER: 10 * 1024 * 1024, // 10MB for order files
    SYSTEM: 10 * 1024 * 1024, // 10MB for system files
    DIGITAL_PRODUCT: 500 * 1024 * 1024, // 500MB for digital products
};
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB default

/**
 * Get current storage configuration
 */
async function getStorageSettings(): Promise<StorageConfig> {
    return await getStorageConfig();
}

/**
 * Check if using external storage (not PostgreSQL)
 */
async function isExternalStorageEnabled(): Promise<boolean> {
    const config = await getStorageSettings();
    return config.provider !== "POSTGRES";
}

/**
 * Initialize a new file upload
 */
export async function initUpload(metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    entityType: FileEntityType;
    entityId: string | null;
    fieldName: string | null;
}) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    // Validate file size
    const maxSize = MAX_FILE_SIZES[metadata.entityType] || DEFAULT_MAX_FILE_SIZE;
    if (metadata.fileSize > maxSize) {
        return { error: `File size exceeds ${maxSize / 1024 / 1024}MB limit` };
    }

    try {
        // Initialize file record with empty data
        const file = await db.file.create({
            data: {
                id: generateId(),
                tenantId: session.user.tenantId,
                fileName: metadata.fileName,
                mimeType: metadata.mimeType,
                fileSize: metadata.fileSize,
                data: Buffer.alloc(0), // Start empty
                entityType: metadata.entityType,
                entityId: metadata.entityId,
                fieldName: metadata.fieldName,
                uploadedBy: session.user.id,
            },
            select: { id: true },
        });

        // Always use chunked upload to avoid Vercel's 4.5MB payload limit
        return { success: true, fileId: file.id, useExternalStorage: false };
    } catch (error) {
        console.error("Init upload error:", error);
        return { error: "Failed to initialize upload" };
    }
}

/**
 * Upload a chunk of file data
 */
export async function uploadChunkFormData(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    const fileId = formData.get("fileId") as string;
    const chunk = formData.get("chunk") as File;

    if (!fileId || !chunk) {
        return { error: "Missing fileId or chunk" };
    }

    if (chunk.size > MAX_CHUNK_SIZE) {
        return { error: "Chunk too large" };
    }

    try {
        const buffer = Buffer.from(await chunk.arrayBuffer());

        // Get existing file data
        const existingFile = await db.file.findUnique({
            where: { id: fileId },
            select: { data: true, tenantId: true },
        });

        if (!existingFile) {
            return { error: "File not found" };
        }

        // Verify tenant access
        if (existingFile.tenantId !== session.user.tenantId) {
            return { error: "Unauthorized" };
        }

        // Append buffer to existing data
        const existingData = existingFile.data || Buffer.alloc(0);
        const newData = Buffer.concat([existingData, buffer]);

        await db.file.update({
            where: { id: fileId },
            data: { data: newData },
        });

        return { success: true };
    } catch (error) {
        console.error("Chunk upload error:", error);
        return { error: "Failed to upload chunk" };
    }
}

/**
 * Upload entire file to external storage (R2, S3, or Vercel Blob based on settings)
 * @deprecated Use chunked upload instead to avoid 413 errors
 */
export async function uploadToExternalStorage(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    const fileId = formData.get("fileId") as string;
    const file = formData.get("file") as File;

    if (!fileId || !file) {
        return { error: "Missing fileId or file" };
    }

    try {
        // Get file metadata
        const fileRecord = await db.file.findUnique({
            where: { id: fileId },
            select: { fileName: true, mimeType: true, tenantId: true },
        });

        if (!fileRecord) {
            return { error: "File record not found" };
        }

        // Verify tenant access
        if (fileRecord.tenantId !== session.user.tenantId) {
            return { error: "Unauthorized" };
        }

        // Get storage configuration
        const storageConfig = await getStorageSettings();

        if (storageConfig.provider === "POSTGRES") {
            return { error: "External storage is not enabled" };
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to configured external storage
        const result = await uploadToStorage(
            buffer,
            fileRecord.fileName,
            fileRecord.mimeType,
            storageConfig
        );

        // Update file record with blobUrl and clear data
        await db.file.update({
            where: { id: fileId },
            data: {
                blobUrl: result.url,
                data: null,
            },
        });

        return { success: true, blobUrl: result.url };
    } catch (error) {
        console.error("External storage upload error:", error);
        return {
            error: error instanceof Error ? error.message : "External storage upload failed",
        };
    }
}

// Legacy function name for backward compatibility
export const uploadToBlob = uploadToExternalStorage;

/**
 * Finalize file upload - transfer to external storage if configured
 */
export async function finalizeUpload(fileId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: {
                id: true,
                fileName: true,
                mimeType: true,
                entityId: true,
                entityType: true,
                blobUrl: true,
                data: true,
                tenantId: true,
            },
        });

        if (!file) return { error: "File not found" };

        // Verify tenant access
        if (file.tenantId !== session.user.tenantId) {
            return { error: "Unauthorized" };
        }

        // Check if external storage is enabled and file is in PostgreSQL (not yet transferred)
        const storageConfig = await getStorageSettings();

        if (storageConfig.provider !== "POSTGRES" && !file.blobUrl && file.data) {
            // Transfer from PostgreSQL to external storage
            try {
                const buffer = file.data as Buffer;
                const result = await uploadToStorage(
                    buffer,
                    file.fileName,
                    file.mimeType,
                    storageConfig
                );

                // Update file record: set blobUrl and clear data
                await db.file.update({
                    where: { id: fileId },
                    data: {
                        blobUrl: result.url,
                        data: null,
                    },
                });

                console.log(`Transferred file ${fileId} to external storage: ${result.url}`);

                // Re-fetch to get updated record
                const updatedFile = await db.file.findUnique({
                    where: { id: fileId },
                    select: { id: true, fileName: true, blobUrl: true },
                });

                if (file.entityId) {
                    revalidatePath(`/dashboard/products/${file.entityId}`);
                }

                return {
                    success: true,
                    url: updatedFile?.blobUrl || `/api/files/${file.id}`,
                    name: file.fileName,
                    id: file.id,
                };
            } catch (transferError) {
                console.error("Failed to transfer to external storage:", transferError);
                // Fall back to serving from PostgreSQL
            }
        }

        if (file.entityId) {
            revalidatePath(`/dashboard/products/${file.entityId}`);
        }

        return {
            success: true,
            url: file.blobUrl || `/api/files/${file.id}`,
            name: file.fileName,
            id: file.id,
        };
    } catch (e) {
        console.error("Finalization error:", e);
        return { error: "Finalization failed" };
    }
}

/**
 * Delete a file
 */
export async function deleteFile(fileId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { blobUrl: true, tenantId: true, entityId: true, entityType: true },
        });

        if (!file) {
            return { error: "File not found" };
        }

        // Verify tenant access
        if (file.tenantId !== session.user.tenantId) {
            return { error: "Unauthorized" };
        }

        // Delete from external storage if applicable
        if (file.blobUrl) {
            const { deleteFromStorage } = await import("@/lib/storage");
            await deleteFromStorage(file.blobUrl);
        }

        // Delete from database
        await db.file.delete({ where: { id: fileId } });

        if (file.entityId) {
            revalidatePath(`/dashboard/products/${file.entityId}`);
        }

        return { success: true };
    } catch (error) {
        console.error("Delete file error:", error);
        return { error: "Failed to delete file" };
    }
}
