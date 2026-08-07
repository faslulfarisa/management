import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';

const VALID_DOCUMENT_TYPES = [
  'invoice', 'payslip', 'payroll_export', 'hr_letter',
  'offer_letter', 'experience_letter', 'report', 'quotation',
];

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class DocumentBrandingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getAllConfigs(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM document_branding_config
       WHERE tenant_id = $1
       ORDER BY document_type, branch_id NULLS FIRST`,
      [tenantId],
    );
    return rows;
  }

  async getConfig(tenantId: string, documentType: string, branchId?: string) {
    if (branchId) {
      const { rows } = await this.db.query(
        `SELECT * FROM document_branding_config
         WHERE tenant_id = $1 AND document_type = $2 AND branch_id = $3`,
        [tenantId, documentType, branchId],
      );
      if (rows.length) return rows[0];
    }

    const { rows } = await this.db.query(
      `SELECT * FROM document_branding_config
       WHERE tenant_id = $1 AND document_type = $2 AND branch_id IS NULL`,
      [tenantId, documentType],
    );
    return rows[0] || this._defaults(documentType);
  }

  async upsertConfig(
    tenantId: string,
    userId: string,
    data: {
      documentType: string;
      branchId?: string;
      logoPlacement?: string;
      watermarkEnabled?: boolean;
      watermarkText?: string;
      watermarkOpacity?: number;
      showCompanySeal?: boolean;
      footerText?: string;
      headerColor?: string;
      accentColor?: string;
      showGstin?: boolean;
      showAddress?: boolean;
      customConfig?: Record<string, any>;
    },
    meta: RequestMeta,
  ) {
    if (!VALID_DOCUMENT_TYPES.includes(data.documentType)) {
      throw new BadRequestException(
        `Invalid document type "${data.documentType}". Valid: ${VALID_DOCUMENT_TYPES.join(', ')}`,
      );
    }

    const { rows } = await this.db.query(
      `INSERT INTO document_branding_config
         (tenant_id, branch_id, document_type, logo_placement, watermark_enabled,
          watermark_text, watermark_opacity, show_company_seal, footer_text,
          header_color, accent_color, show_gstin, show_address, custom_config, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
       ON CONFLICT (tenant_id, document_type,
         COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::UUID))
       DO UPDATE SET
         logo_placement    = EXCLUDED.logo_placement,
         watermark_enabled = EXCLUDED.watermark_enabled,
         watermark_text    = EXCLUDED.watermark_text,
         watermark_opacity = EXCLUDED.watermark_opacity,
         show_company_seal = EXCLUDED.show_company_seal,
         footer_text       = EXCLUDED.footer_text,
         header_color      = EXCLUDED.header_color,
         accent_color      = EXCLUDED.accent_color,
         show_gstin        = EXCLUDED.show_gstin,
         show_address      = EXCLUDED.show_address,
         custom_config     = EXCLUDED.custom_config,
         updated_at        = now()
       RETURNING *`,
      [
        tenantId,
        data.branchId || null,
        data.documentType,
        data.logoPlacement ?? 'top-left',
        data.watermarkEnabled ?? false,
        data.watermarkText ?? null,
        data.watermarkOpacity ?? 0.10,
        data.showCompanySeal ?? false,
        data.footerText ?? null,
        data.headerColor ?? null,
        data.accentColor ?? null,
        data.showGstin ?? true,
        data.showAddress ?? true,
        data.customConfig ? JSON.stringify(data.customConfig) : null,
      ],
    );

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'document_branding_config',
      entityId: rows[0].id,
      action: 'upsert',
      newValues: rows[0],
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return rows[0];
  }

  private _defaults(documentType: string) {
    return {
      document_type: documentType,
      branch_id: null,
      logo_placement: 'top-left',
      watermark_enabled: false,
      watermark_text: null,
      watermark_opacity: '0.10',
      show_company_seal: false,
      footer_text: null,
      header_color: null,
      accent_color: null,
      show_gstin: true,
      show_address: true,
      custom_config: null,
    };
  }
}
