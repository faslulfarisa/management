-- Migration 087: Fine & Deduction Audit Tracking
-- Add audit tracking columns to employee_fines and create fine_deduction_audit_history

-- 1. Add columns to employee_fines
ALTER TABLE employee_fines ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE employee_fines ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE employee_fines ADD COLUMN IF NOT EXISTS change_reason TEXT;
ALTER TABLE employee_fines ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE employee_fines ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;

-- 2. Create history table
CREATE TABLE IF NOT EXISTS fine_deduction_audit_history (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fine_id               UUID        NOT NULL REFERENCES employee_fines(id) ON DELETE CASCADE,
  field_changed         TEXT        NOT NULL,
  old_value             TEXT,
  new_value             TEXT,
  change_reason         TEXT        NOT NULL,
  edited_by             UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  editor_user_type      TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdah_fine
  ON fine_deduction_audit_history(fine_id);
