import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

export interface BrandingPackage {
  companyName: string;
  legalName: string | null;
  gstin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  squareLogoUrl: string | null;
  invoiceLogoUrl: string | null;
  payslipLogoUrl: string | null;
  reportLogoUrl: string | null;
  watermarkEnabled: boolean;
  watermarkText: string | null;
  watermarkOpacity: number;
  footerText: string | null;
  headerColor: string | null;
  accentColor: string | null;
  showGstin: boolean;
  showAddress: boolean;
  logoPlacement: string;
}

@Injectable()
export class BrandingEngineService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Returns a flat branding package for use by PDF/document generators.
   * Branch-level document_branding_config overrides org-wide config.
   * Asset fallback: logo_rectangular → tenants.logo_url. logo_square falls back to logo_rectangular.
   */
  async getBrandingPackage(
    tenantId: string,
    documentType: string,
    branchId?: string,
  ): Promise<BrandingPackage> {
    const [tenantResult, assetResult] = await Promise.all([
      this.db.query(
        `SELECT name, legal_name, gstin, primary_email, phone_number,
                registered_address, operational_address, logo_url
         FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),
      this.db.query(
        `SELECT asset_type, file_url FROM branding_assets
         WHERE tenant_id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
        [tenantId],
      ),
    ]);

    const tenant = tenantResult.rows[0] || {};
    const assets: Record<string, string> = {};
    for (const a of assetResult.rows) assets[a.asset_type] = a.file_url;

    // Resolve document branding config — branch-specific first, then org-wide
    let config: Record<string, any> | null = null;
    if (branchId) {
      const { rows } = await this.db.query(
        `SELECT * FROM document_branding_config
         WHERE tenant_id = $1 AND document_type = $2 AND branch_id = $3`,
        [tenantId, documentType, branchId],
      );
      if (rows.length) config = rows[0];
    }
    if (!config) {
      const { rows } = await this.db.query(
        `SELECT * FROM document_branding_config
         WHERE tenant_id = $1 AND document_type = $2 AND branch_id IS NULL`,
        [tenantId, documentType],
      );
      config = rows[0] || null;
    }

    // Build a human-readable address string from JSONB
    const addrObj: Record<string, string> | null =
      tenant.registered_address || tenant.operational_address || null;
    let address: string | null = null;
    if (addrObj) {
      address = [addrObj.line1, addrObj.line2, addrObj.city, addrObj.state, addrObj.country, addrObj.postal_code]
        .filter(Boolean)
        .join(', ') || null;
    }

    const rectangularLogo = assets['logo_rectangular'] || tenant.logo_url || null;
    const squareLogo = assets['logo_square'] || rectangularLogo;

    return {
      companyName:      tenant.name || '',
      legalName:        tenant.legal_name || null,
      gstin:            tenant.gstin || null,
      address,
      phone:            tenant.phone_number || null,
      email:            tenant.primary_email || null,
      logoUrl:          rectangularLogo,
      squareLogoUrl:    squareLogo,
      invoiceLogoUrl:   rectangularLogo,
      payslipLogoUrl:   rectangularLogo,
      reportLogoUrl:    rectangularLogo,
      watermarkEnabled: config?.watermark_enabled ?? false,
      watermarkText:    config?.watermark_text ?? null,
      watermarkOpacity: parseFloat(config?.watermark_opacity ?? '0.10'),
      footerText:       config?.footer_text ?? null,
      headerColor:      config?.header_color ?? null,
      accentColor:      config?.accent_color ?? null,
      showGstin:        config?.show_gstin ?? true,
      showAddress:      config?.show_address ?? true,
      logoPlacement:    config?.logo_placement ?? 'top-left',
    };
  }
}
