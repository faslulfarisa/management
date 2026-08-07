-- Migration 046: Add branch_id to biometric_devices
-- Phase 2 of Branch module integration

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Indexes for branch-scoped device queries
CREATE INDEX IF NOT EXISTS idx_biometric_devices_branch
  ON biometric_devices(branch_id) WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biometric_devices_tenant_branch
  ON biometric_devices(tenant_id, branch_id) WHERE branch_id IS NOT NULL;
