/**
 * Multi-provider storage adapter
 * Supports: PostgreSQL (default), Vercel Blob, Cloudflare R2, AWS S3
 * 
 * Based on single-class-0.8.0 implementation
 */

import { db } from "@/lib/db";

export type StorageProvider = "POSTGRES" | "VERCEL_BLOB" | "CLOUDFLARE_R2" | "AWS_S3";

export interface StorageConfig {
    provider: StorageProvider;
    // Vercel Blob
    blobReadWriteToken?: string;
    // Cloudflare R2
    r2AccountId?: string;
    r2AccessKeyId?: string;
    r2SecretAccessKey?: string;
    r2BucketName?: string;
    r2PublicUrl?: string;
    // AWS S3
    s3Region?: string;
    s3AccessKeyId?: string;
    s3SecretAccessKey?: string;
    s3BucketName?: string;
    s3Endpoint?: string;
}

export interface UploadResult {
    url: string;
    provider: StorageProvider;
}

/**
 * Get current storage configuration from database
 */
export async function getStorageConfig(): Promise<StorageConfig> {
    const settings = await db.systemSettings.findUnique({
        where: { id: "global" },
    });

    if (!settings) {
        return { provider: "POSTGRES" };
    }

    return {
        provider: settings.storageProvider as StorageProvider,
        blobReadWriteToken: settings.blobReadWriteToken || undefined,
        r2AccountId: settings.r2AccountId || undefined,
        r2AccessKeyId: settings.r2AccessKeyId || undefined,
        r2SecretAccessKey: settings.r2SecretAccessKey || undefined,
        r2BucketName: settings.r2BucketName || undefined,
        r2PublicUrl: settings.r2PublicUrl || undefined,
        s3Region: settings.s3Region || undefined,
        s3AccessKeyId: settings.s3AccessKeyId || undefined,
        s3SecretAccessKey: settings.s3SecretAccessKey || undefined,
        s3BucketName: settings.s3BucketName || undefined,
        s3Endpoint: settings.s3Endpoint || undefined,
    };
}

/**
 * Upload file to the configured storage provider
 */
export async function uploadToStorage(
    file: Buffer,
    fileName: string,
    mimeType: string,
    config?: StorageConfig
): Promise<UploadResult> {
    const storageConfig = config || (await getStorageConfig());

    switch (storageConfig.provider) {
        case "VERCEL_BLOB":
            return uploadToVercelBlob(file, fileName, mimeType, storageConfig);
        case "CLOUDFLARE_R2":
            return uploadToR2(file, fileName, mimeType, storageConfig);
        case "AWS_S3":
            return uploadToS3(file, fileName, mimeType, storageConfig);
        default:
            // PostgreSQL - return empty URL, data will be stored in DB
            return { url: "", provider: "POSTGRES" };
    }
}

/**
 * Delete file from external storage
 */
export async function deleteFromStorage(
    url: string,
    config?: StorageConfig
): Promise<void> {
    if (!url) return;

    const storageConfig = config || (await getStorageConfig());

    switch (storageConfig.provider) {
        case "VERCEL_BLOB":
            await deleteFromVercelBlob(url, storageConfig);
            break;
        case "CLOUDFLARE_R2":
            await deleteFromR2(url, storageConfig);
            break;
        case "AWS_S3":
            await deleteFromS3(url, storageConfig);
            break;
    }
}

/**
 * Download file from external storage
 */
export async function downloadFromStorage(
    url: string
): Promise<Buffer | null> {
    if (!url) return null;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error("Failed to download from storage:", error);
        return null;
    }
}

// ============ Vercel Blob ============
// NOTE: External storage requires installing optional packages:
// - Vercel Blob: pnpm add @vercel/blob
// - R2/S3: pnpm add @aws-sdk/client-s3

async function uploadToVercelBlob(
    file: Buffer,
    fileName: string,
    mimeType: string,
    config: StorageConfig
): Promise<UploadResult> {
    const token = config.blobReadWriteToken;
    if (!token) {
        throw new Error("Vercel Blob token not configured");
    }

    // Check if @vercel/blob is installed
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { put } = require("@vercel/blob");
        const blob = await put(fileName, file, {
            access: "public",
            token,
            contentType: mimeType,
        });
        return { url: blob.url, provider: "VERCEL_BLOB" };
    } catch {
        throw new Error("Vercel Blob SDK not installed. Run: pnpm add @vercel/blob");
    }
}

async function deleteFromVercelBlob(
    url: string,
    config: StorageConfig
): Promise<void> {
    const token = config.blobReadWriteToken;
    if (!token) return;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { del } = require("@vercel/blob");
        await del(url, { token });
    } catch (error) {
        console.error("Failed to delete from Vercel Blob:", error);
    }
}

// ============ Cloudflare R2 ============

/**
 * Helper to get AWS SDK
 * Returns null if not installed (optional dependency)
 */
function getS3Client() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require("@aws-sdk/client-s3");
    } catch {
        return null;
    }
}

async function uploadToR2(
    file: Buffer,
    fileName: string,
    mimeType: string,
    config: StorageConfig
): Promise<UploadResult> {
    const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName, r2PublicUrl } = config;

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
        throw new Error("Cloudflare R2 configuration incomplete");
    }

    const sdk = getS3Client();
    if (!sdk) {
        throw new Error("AWS SDK not installed. Run: pnpm add @aws-sdk/client-s3");
    }

    const { S3Client, PutObjectCommand } = sdk;

    const client = new S3Client({
        region: "auto",
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
        },
    });

    const key = `uploads/${Date.now()}-${fileName}`;

    await client.send(
        new PutObjectCommand({
            Bucket: r2BucketName,
            Key: key,
            Body: file,
            ContentType: mimeType,
        })
    );

    // Construct public URL
    const publicUrl = r2PublicUrl
        ? `${r2PublicUrl.replace(/\/$/, "")}/${key}`
        : `https://${r2BucketName}.${r2AccountId}.r2.dev/${key}`;

    return { url: publicUrl, provider: "CLOUDFLARE_R2" };
}

async function deleteFromR2(url: string, config: StorageConfig): Promise<void> {
    const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName, r2PublicUrl } = config;

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) return;

    try {
        const sdk = getS3Client();
        if (!sdk) {
            console.warn("AWS SDK not installed, skipping R2 delete");
            return;
        }

        const { S3Client, DeleteObjectCommand } = sdk;

        const client = new S3Client({
            region: "auto",
            endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: r2AccessKeyId,
                secretAccessKey: r2SecretAccessKey,
            },
        });

        // Extract key from URL
        const baseUrl = r2PublicUrl || `https://${r2BucketName}.${r2AccountId}.r2.dev`;
        const key = url.replace(baseUrl.replace(/\/$/, "") + "/", "");

        await client.send(
            new DeleteObjectCommand({
                Bucket: r2BucketName,
                Key: key,
            })
        );
    } catch (error) {
        console.error("Failed to delete from R2:", error);
    }
}

// ============ AWS S3 ============

async function uploadToS3(
    file: Buffer,
    fileName: string,
    mimeType: string,
    config: StorageConfig
): Promise<UploadResult> {
    const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3BucketName, s3Endpoint } = config;

    if (!s3Region || !s3AccessKeyId || !s3SecretAccessKey || !s3BucketName) {
        throw new Error("AWS S3 configuration incomplete");
    }

    const sdk = getS3Client();
    if (!sdk) {
        throw new Error("AWS SDK not installed. Run: pnpm add @aws-sdk/client-s3");
    }

    const { S3Client, PutObjectCommand } = sdk;

    const clientConfig: {
        region: string;
        credentials: { accessKeyId: string; secretAccessKey: string };
        endpoint?: string;
        forcePathStyle?: boolean;
    } = {
        region: s3Region,
        credentials: {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
        },
    };

    if (s3Endpoint) {
        clientConfig.endpoint = s3Endpoint;
        clientConfig.forcePathStyle = true;
    }

    const client = new S3Client(clientConfig);
    const key = `uploads/${Date.now()}-${fileName}`;

    await client.send(
        new PutObjectCommand({
            Bucket: s3BucketName,
            Key: key,
            Body: file,
            ContentType: mimeType,
        })
    );

    // Construct URL
    const url = s3Endpoint
        ? `${s3Endpoint.replace(/\/$/, "")}/${s3BucketName}/${key}`
        : `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${key}`;

    return { url, provider: "AWS_S3" };
}

async function deleteFromS3(url: string, config: StorageConfig): Promise<void> {
    const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3BucketName, s3Endpoint } = config;

    if (!s3Region || !s3AccessKeyId || !s3SecretAccessKey || !s3BucketName) return;

    try {
        const sdk = getS3Client();
        if (!sdk) {
            console.warn("AWS SDK not installed, skipping S3 delete");
            return;
        }

        const { S3Client, DeleteObjectCommand } = sdk;

        const clientConfig: {
            region: string;
            credentials: { accessKeyId: string; secretAccessKey: string };
            endpoint?: string;
            forcePathStyle?: boolean;
        } = {
            region: s3Region,
            credentials: {
                accessKeyId: s3AccessKeyId,
                secretAccessKey: s3SecretAccessKey,
            },
        };

        if (s3Endpoint) {
            clientConfig.endpoint = s3Endpoint;
            clientConfig.forcePathStyle = true;
        }

        const client = new S3Client(clientConfig);

        // Extract key from URL
        const urlObj = new URL(url);
        const key = urlObj.pathname.replace(`/${s3BucketName}/`, "").replace(/^\//, "");

        await client.send(
            new DeleteObjectCommand({
                Bucket: s3BucketName,
                Key: key,
            })
        );
    } catch (error) {
        console.error("Failed to delete from S3:", error);
    }
}

/**
 * Validate storage provider configuration
 */
export function validateStorageConfig(
    provider: StorageProvider,
    config: StorageConfig
): string | null {
    switch (provider) {
        case "VERCEL_BLOB":
            if (!config.blobReadWriteToken) {
                return "Vercel Blob Read/Write Token is required";
            }
            break;
        case "CLOUDFLARE_R2":
            if (!config.r2AccountId) return "R2 Account ID is required";
            if (!config.r2AccessKeyId) return "R2 Access Key ID is required";
            if (!config.r2SecretAccessKey) return "R2 Secret Access Key is required";
            if (!config.r2BucketName) return "R2 Bucket Name is required";
            break;
        case "AWS_S3":
            if (!config.s3Region) return "S3 Region is required";
            if (!config.s3AccessKeyId) return "S3 Access Key ID is required";
            if (!config.s3SecretAccessKey) return "S3 Secret Access Key is required";
            if (!config.s3BucketName) return "S3 Bucket Name is required";
            break;
    }
    return null;
}

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(provider: StorageProvider): string {
    const names: Record<StorageProvider, string> = {
        POSTGRES: "PostgreSQL (Database)",
        VERCEL_BLOB: "Vercel Blob",
        CLOUDFLARE_R2: "Cloudflare R2",
        AWS_S3: "AWS S3",
    };
    return names[provider] || provider;
}
