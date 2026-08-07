'use client';

import { useState, useRef, useCallback } from 'react';
import { brandingAssetsApi } from '@/lib/company-profile-api';
import type { AssetType, BrandingAsset } from '@/lib/company-profile-api';
import { Upload, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  assetType: AssetType;
  label: string;
  hint: string;
  currentAsset?: BrandingAsset;
  onRefresh: () => void;
  compact?: boolean;
}

export function BrandingAssetUploader({
  assetType,
  label,
  hint,
  currentAsset,
  onRefresh,
  compact = false,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      await brandingAssetsApi.upload(assetType, selectedFile);
      setPreview(null);
      setSelectedFile(null);
      onRefresh();
    } catch {
      setError('Upload failed. Check file type and size.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentAsset) return;
    setDeleting(true);
    try {
      await brandingAssetsApi.remove(currentAsset.id);
      onRefresh();
    } catch {
      setError('Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const cancel = () => {
    setPreview(null);
    setSelectedFile(null);
    setError(null);
  };

  const displayUrl = preview ?? currentAsset?.file_url ?? null;

  return (
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {currentAsset && !preview && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            {deleting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        className={cn(
          'relative rounded-xl border-2 border-dashed transition-all duration-200 flex items-center justify-center cursor-pointer select-none',
          compact ? 'h-24 w-24' : 'h-36 w-full',
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        {displayUrl ? (
          <>
            <img
              src={displayUrl}
              alt={label}
              className={cn(
                'object-contain rounded-lg',
                compact ? 'h-16 w-16' : 'max-h-28 max-w-full p-2',
              )}
            />
            {/* Replace overlay — only for saved asset, not preview */}
            {currentAsset && !preview && (
              <div className="absolute inset-0 rounded-xl bg-black/0 hover:bg-black/50 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
                <span className="text-white text-xs font-semibold bg-black/60 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <Upload className="h-3 w-3" />
                  Replace
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground p-4">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Upload className="h-4 w-4" />
            </div>
            {!compact && (
              <div className="text-center">
                <p className="text-xs font-medium">Drop image here</p>
                <p className="text-xs opacity-60">or click to browse</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Confirm / Cancel after selection */}
      {preview && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleUpload} disabled={uploading}>
            {uploading && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
          <Button size="sm" variant="outline" onClick={cancel} disabled={uploading}>
            Cancel
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
