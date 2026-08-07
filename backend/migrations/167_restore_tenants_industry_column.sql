-- 167_restore_tenants_industry_column.sql
-- Several organization flows expect tenants.industry. Migration 094 noted that
-- it pre-existed, but older databases only have business_category. Restore the
-- nullable column and backfill it from business_category for compatibility.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS industry VARCHAR(100);

UPDATE tenants
SET industry = business_category
WHERE industry IS NULL
  AND business_category IS NOT NULL;
