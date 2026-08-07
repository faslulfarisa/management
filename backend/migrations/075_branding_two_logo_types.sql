-- Migration 075: Consolidate branding assets to two logo types
-- Old types: primary_logo, dark_logo, favicon, invoice_logo, payslip_logo, report_logo, seal
-- New types: logo_rectangular (wide format), logo_square (1:1 format)

-- Migrate primary_logo → logo_rectangular (keep the most recent active one)
UPDATE branding_assets
SET asset_type = 'logo_rectangular', updated_at = now()
WHERE asset_type = 'primary_logo';

-- Migrate favicon → logo_square (keep the most recent active one)
UPDATE branding_assets
SET asset_type = 'logo_square', updated_at = now()
WHERE asset_type = 'favicon';

-- Delete all other old types that no longer exist
DELETE FROM branding_assets
WHERE asset_type IN ('dark_logo', 'invoice_logo', 'payslip_logo', 'report_logo', 'seal');

-- If a tenant ended up with two logo_rectangular rows (primary_logo + something else renamed),
-- deactivate the older one so the unique active index is satisfied.
UPDATE branding_assets ba
SET is_active = FALSE, updated_at = now()
WHERE asset_type IN ('logo_rectangular', 'logo_square')
  AND deleted_at IS NULL
  AND is_active = TRUE
  AND id != (
    SELECT id FROM branding_assets b2
    WHERE b2.tenant_id = ba.tenant_id
      AND b2.asset_type = ba.asset_type
      AND b2.deleted_at IS NULL
      AND b2.is_active = TRUE
    ORDER BY b2.created_at DESC
    LIMIT 1
  );
