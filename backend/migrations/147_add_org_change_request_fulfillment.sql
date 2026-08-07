-- Link an additional-organization request to the organization created from it.
ALTER TABLE organization_change_requests
  ADD COLUMN IF NOT EXISTS fulfilled_tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_org_change_requests_fulfilled_tenant
  ON organization_change_requests(fulfilled_tenant_id)
  WHERE fulfilled_tenant_id IS NOT NULL;
