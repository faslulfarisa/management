import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';
import { FileUploadService } from '../../../shared/file-upload.service';

const VALID_ASSET_TYPES = ['logo_rectangular', 'logo_square'];

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class BrandingAssetService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
    private readonly fileUpload: FileUploadService,
  ) {}

  async getAssets(tenantId: string): Promise<Record<string, any>> {
    const { rows } = await this.db.query(
      `SELECT id, asset_type, file_url, file_name, file_size_bytes, mime_type,
              width, height, uploaded_by, created_at, updated_at
       FROM branding_assets
       WHERE tenant_id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [tenantId],
    );
    // Keyed by asset_type for O(1) lookup on the frontend
    return rows.reduce<Record<string, any>>((acc, row) => {
      acc[row.asset_type] = row;
      return acc;
    }, {});
  }

  async uploadAsset(
    tenantId: string,
    userId: string,
    assetType: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
    meta: RequestMeta,
  ) {
    if (!VALID_ASSET_TYPES.includes(assetType)) {
      throw new BadRequestException(
        `Invalid asset type "${assetType}". Valid types: ${VALID_ASSET_TYPES.join(', ')}`,
      );
    }

    this.fileUpload.validateImageFile(file.buffer, file.mimetype);

    const fileUrl = await this.fileUpload.uploadImage(
      file.buffer,
      file.mimetype,
      'branding',
      tenantId,
      file.originalname,
    );

    return this.db.transaction(async (client) => {
      // Deactivate any existing active asset of the same type
      await client.query(
        `UPDATE branding_assets
         SET is_active = FALSE, updated_at = now()
         WHERE tenant_id = $1 AND asset_type = $2 AND is_active = TRUE AND deleted_at IS NULL`,
        [tenantId, assetType],
      );

      // Keep tenants.logo_url in sync when the rectangular logo is updated
      if (assetType === 'logo_rectangular') {
        await client.query(
          `UPDATE tenants SET logo_url = $1, updated_at = now() WHERE id = $2`,
          [fileUrl, tenantId],
        );
      }

      const { rows } = await client.query(
        `INSERT INTO branding_assets
           (tenant_id, asset_type, file_url, file_name, file_size_bytes, mime_type, is_active, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
         RETURNING id, asset_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by, created_at`,
        [tenantId, assetType, fileUrl, file.originalname, file.size, file.mimetype, userId],
      );

      await this.auditLog.log({
        tenantId,
        userId,
        entityType: 'branding_asset',
        entityId: rows[0].id,
        action: 'upload',
        newValues: { assetType, fileUrl, fileName: file.originalname },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return rows[0];
    });
  }

  async deleteAsset(
    tenantId: string,
    userId: string,
    assetId: string,
    meta: RequestMeta,
  ) {
    const { rows } = await this.db.query(
      `SELECT id, asset_type, file_url
       FROM branding_assets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [assetId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Branding asset not found');

    const asset = rows[0];

    await this.db.query(
      `UPDATE branding_assets SET deleted_at = now(), is_active = FALSE, updated_at = now() WHERE id = $1`,
      [assetId],
    );

    // Fire-and-forget: storage deletion failure is logged but doesn't fail the request
    this.fileUpload.deleteFile(asset.file_url);

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'branding_asset',
      entityId: assetId,
      action: 'delete',
      oldValues: { assetType: asset.asset_type, fileUrl: asset.file_url },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { success: true };
  }
}
