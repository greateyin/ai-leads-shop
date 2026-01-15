"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileIcon, X, Image as ImageIcon } from "lucide-react";
import {
    initUpload,
    uploadChunkFormData,
    finalizeUpload,
} from "@/lib/actions/upload";
import Image from "next/image";

// Local type to avoid stale Prisma client cache issues
type FileEntityType = "SHOP" | "PRODUCT" | "BLOG" | "ORDER" | "USER" | "SYSTEM";

interface FileUploadProps {
    value?: string; // File ID
    fileName?: string; // Optional initial file name
    previewUrl?: string; // Optional preview URL for images
    onChange?: (id: string, url: string) => void;
    onUploadComplete?: (id: string, url: string, fileName: string) => void;
    label: string;
    entityType?: FileEntityType;
    entityId?: string | null;
    fieldName?: string | null;
    accept?: string;
    helperText?: string;
    showPreview?: boolean;
}

const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunks

export function FileUpload({
    value,
    fileName: initialFileName,
    previewUrl: initialPreviewUrl,
    onChange,
    onUploadComplete,
    label,
    entityType = "PRODUCT",
    entityId = null,
    fieldName = null,
    accept = "image/*",
    helperText,
    showPreview = true,
}: FileUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [fileName, setFileName] = useState<string | undefined>(initialFileName);
    const [previewUrl, setPreviewUrl] = useState<string | undefined>(
        initialPreviewUrl
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isImage = (mimeType: string) => mimeType.startsWith("image/");

    const onFileChange = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            setIsUploading(true);
            setProgress(0);

            // Create local preview for images
            if (showPreview && isImage(file.type)) {
                const reader = new FileReader();
                reader.onload = (e) => setPreviewUrl(e.target?.result as string);
                reader.readAsDataURL(file);
            }

            try {
                // 1. Initialize Upload
                const initResult = await initUpload({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    entityType,
                    entityId,
                    fieldName,
                });

                if (initResult.error || !initResult.fileId) {
                    throw new Error(initResult.error || "Failed to initialize upload");
                }

                const fileId = initResult.fileId;

                // 2. Chunked upload
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(file.size, start + CHUNK_SIZE);
                    const chunk = file.slice(start, end);

                    const formData = new FormData();
                    formData.append("fileId", fileId);
                    formData.append("chunk", chunk);

                    const chunkResult = await uploadChunkFormData(formData);
                    if (chunkResult.error) {
                        throw new Error(chunkResult.error);
                    }

                    // Update progress
                    setProgress(Math.round(((i + 1) / totalChunks) * 100));
                }

                // 3. Finalize
                const finalResult = await finalizeUpload(fileId);
                if (finalResult.error) {
                    throw new Error(finalResult.error);
                }

                if (onChange && finalResult.id && finalResult.url) {
                    onChange(finalResult.id, finalResult.url);
                }
                if (
                    onUploadComplete &&
                    finalResult.id &&
                    finalResult.url &&
                    finalResult.name
                ) {
                    onUploadComplete(finalResult.id, finalResult.url, finalResult.name);
                }

                setFileName(finalResult.name);
                if (finalResult.url) {
                    setPreviewUrl(finalResult.url);
                }
                console.log("上傳成功");
            } catch (error) {
                console.error("上傳失敗:", error);
                alert(error instanceof Error ? error.message : "上傳失敗");
                setPreviewUrl(undefined);
            } finally {
                setIsUploading(false);
                setProgress(0);
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        },
        [entityType, entityId, fieldName, onChange, onUploadComplete, showPreview]
    );

    const handleRemove = useCallback(() => {
        if (onChange) onChange("", "");
        setFileName(undefined);
        setPreviewUrl(undefined);
    }, [onChange]);

    return (
        <div className="space-y-4 w-full">
            <Label>{label}</Label>

            {value ? (
                <div className="space-y-3">
                    {/* Preview */}
                    {showPreview && previewUrl && (
                        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
                            <Image
                                src={previewUrl}
                                alt={fileName || "Preview"}
                                fill
                                className="object-cover"
                            />
                        </div>
                    )}

                    {/* File info */}
                    <div className="flex items-center gap-4 p-4 border rounded-lg bg-slate-50">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            {showPreview && previewUrl ? (
                                <ImageIcon className="h-5 w-5 text-blue-600" />
                            ) : (
                                <FileIcon className="h-5 w-5 text-blue-600" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                                {fileName || "已上傳檔案"}
                            </p>
                            <p className="text-xs text-slate-500 truncate">ID: {value}</p>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemove}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ) : (
                <div
                    className="border-2 border-dashed rounded-lg p-8 hover:bg-slate-50 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer relative overflow-hidden"
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                    {isUploading && (
                        <div
                            className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    )}

                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                        {isUploading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Upload className="h-5 w-5" />
                        )}
                    </div>
                    <p className="text-sm font-medium text-slate-500">
                        {isUploading ? `上傳中... ${progress}%` : "點擊上傳檔案"}
                    </p>
                    {helperText && (
                        <p className="text-xs text-slate-400">{helperText}</p>
                    )}
                </div>
            )}

            <Input
                ref={fileInputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={onFileChange}
                disabled={isUploading}
            />
        </div>
    );
}
