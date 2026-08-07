-- 043_backfill_branches_from_properties.sql
-- Seeds one branch per existing property so all tenants start branch-aware.
-- Existing property_id link is preserved on each branch row for FK traceability.
-- Run after 042_branches.sql
-- SAFE: INSERT with ON CONFLICT DO NOTHING — no existing data overwritten.

INSERT INTO branches (
  tenant_id,
  name,
  code,
  branch_type,
  address,
  gstin,
  timezone,
  geo_lat,
  geo_lng,
  geofence_radius_meters,
  status,
  is_active,
  property_id,
  created_at,
  updated_at
)
SELECT
  p.tenant_id,
  p.name,
  p.code,
  COALESCE(p.property_type, 'main'),
  p.address,
  p.gstin,
  COALESCE(p.timezone, 'Asia/Kolkata'),
  p.geo_lat,
  p.geo_lng,
  COALESCE(p.geofence_radius_meters, 200),
  CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END,
  p.is_active,
  p.id,
  p.created_at,
  p.updated_at
FROM properties p
WHERE p.deleted_at IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;
