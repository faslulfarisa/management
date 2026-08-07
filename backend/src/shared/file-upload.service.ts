import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FAVICON_BYTES = 1 * 1024 * 1024;

const EXT_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

// Compliance & Document Management: broader file-type support than the
// image-only upload path above (logos/photos), with a larger size cap.
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'image/jpeg',
  'image/png',
  'application/zip',
  'application/x-zip-compressed',
];
const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

const DOCUMENT_EXT_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly useLocal: boolean;

  // MinIO fields — only used when useLocal is false
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly minioBaseUrl: string;

  // Local storage root — <project-root>/uploads
  private readonly uploadsDir: string;
  private readonly localBaseUrl: string;

  constructor() {
    this.useLocal = (process.env.STORAGE_DRIVER || 'minio') === 'local';

    if (this.useLocal) {
      this.uploadsDir = path.resolve(process.cwd(), 'uploads');
      const port = process.env.PORT || '3001';
      this.localBaseUrl = `http://localhost:${port}/uploads`;
      this.logger.log('FileUploadService: using local disk storage (STORAGE_DRIVER=local)');
    } else {
      const useSSL = process.env.MINIO_USE_SSL === 'true';
      const host = process.env.MINIO_ENDPOINT || 'localhost';
      const port = parseInt(process.env.MINIO_PORT || '9000', 10);
      this.bucket = process.env.MINIO_BUCKET || 'ai-hrms-documents';
      this.minioBaseUrl = `${useSSL ? 'https' : 'http'}://${host}:${port}`;

      this.s3 = new S3Client({
        endpoint: this.minioBaseUrl,
        region: 'us-east-1',
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
          secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        },
        forcePathStyle: true,
      });
    }
  }

  validateImageFile(buffer: Buffer, mimeType: string, isFavicon = false): void {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid file type "${mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
    const maxBytes = isFavicon ? MAX_FAVICON_BYTES : MAX_SIZE_BYTES;
    if (buffer.length > maxBytes) {
      throw new BadRequestException(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(2)} MB). ` +
        `Maximum: ${maxBytes / 1024 / 1024} MB`,
      );
    }
  }

  async uploadImage(
    buffer: Buffer,
    mimeType: string,
    folder: string,
    tenantId: string,
    originalFilename = '',
  ): Promise<string> {
    const ext = EXT_MAP[mimeType] || 'bin';
    return this.storeFile(buffer, ext, mimeType, folder, tenantId, originalFilename);
  }

  validateDocumentFile(buffer: Buffer, mimeType: string): void {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid file type "${mimeType}". Allowed: PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG, ZIP`,
      );
    }
    if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(2)} MB). ` +
        `Maximum: ${MAX_DOCUMENT_SIZE_BYTES / 1024 / 1024} MB`,
      );
    }
  }

  /** Compliance & Document Management uploads (company/employee documents, versions). */
  async uploadDocument(
    buffer: Buffer,
    mimeType: string,
    folder: string,
    tenantId: string,
    originalFilename = '',
  ): Promise<{ url: string; sizeBytes: number }> {
    const ext = DOCUMENT_EXT_MAP[mimeType] || 'bin';
    const url = await this.storeFile(buffer, ext, mimeType, folder, tenantId, originalFilename);
    return { url, sizeBytes: buffer.length };
  }

  /**
   * Secure download URL for a previously-uploaded file. Local disk storage has
   * no presign concept, so the existing static URL is returned as-is; MinIO
   * files get a short-lived signed URL instead of the static public one, so
   * confidential/restricted documents aren't reachable via a guessable path.
   */
  async getSignedDownloadUrl(fileUrl: string, expirySeconds = 300): Promise<string> {
    if (this.useLocal || !fileUrl.startsWith(this.minioBaseUrl)) return fileUrl;
    const key = fileUrl.slice(`${this.minioBaseUrl}/${this.bucket}/`.length);
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expirySeconds });
  }

  private async storeFile(
    buffer: Buffer,
    ext: string,
    mimeType: string,
    folder: string,
    tenantId: string,
    originalFilename: string,
  ): Promise<string> {
    const filename = `${uuidv4()}.${ext}`;

    if (this.useLocal) {
      const dir = path.join(this.uploadsDir, folder, tenantId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), buffer);
      return `${this.localBaseUrl}/${folder}/${tenantId}/${filename}`;
    }

    const key = `${folder}/${tenantId}/${filename}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: { tenantId, originalFilename },
      }),
    );
    return `${this.minioBaseUrl}/${this.bucket}/${key}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      if (this.useLocal) {
        const localPrefix = this.localBaseUrl + '/';
        if (fileUrl.startsWith(localPrefix)) {
          const rel = fileUrl.slice(localPrefix.length);
          const filePath = path.join(this.uploadsDir, rel);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        return;
      }

      const urlObj = new URL(fileUrl);
      const key = urlObj.pathname.replace(`/${this.bucket}/`, '');
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      this.logger.warn(`Could not delete file ${fileUrl}: ${(e as Error).message}`);
    }
  }
}
