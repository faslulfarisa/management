-- 068_payslip_system.sql
-- Adds immutable snapshot support, human-readable payslip numbers, and a
-- payslip access audit log to the existing payslips table.
-- Safe: additive-only — new columns with nullable defaults, no existing data modified.

-- ─── 1. payslip_number — human-readable identifier ───────────────────────────
-- Format: PS-{YEAR}-{MM}-{seq padded to 5 digits}  e.g. PS-2026-05-00042
-- Populated by PayslipService.takeSnapshot() at processPayrollRun() time.
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS payslip_number TEXT;

-- Sparse unique index: enforced only for non-NULL rows (rows without a number
-- are drafts that haven't been snapshotted yet — don't enforce uniqueness on them).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslip_number
  ON payslips(tenant_id, payslip_number)
  WHERE payslip_number IS NOT NULL;

-- ─── 2. snapshot_data — immutable JSON snapshot captured at process time ─────
-- Stores the full enriched payslip context (employee profile, org branding,
-- salary breakdown with labeled components, attendance summary, fine details)
-- exactly as it existed when processPayrollRun() was called.
-- Application layer enforces write-once: PayslipService.takeSnapshot() uses
-- UPDATE ... WHERE snapshot_data IS NULL to prevent overwrite.
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS snapshot_data JSONB;

-- Partial index for queries that filter for snapshotted payslips
CREATE INDEX IF NOT EXISTS idx_ps_has_snapshot
  ON payslips(tenant_id, id)
  WHERE snapshot_data IS NOT NULL;

-- ─── 3. payslip_view_log — append-only access audit ──────────────────────────
-- Records every time a payslip is viewed, downloaded, or printed by an admin
-- or the employee themselves. Immutable: no updated_at column.
-- Used for compliance, security audits, and employee access history.
CREATE TABLE IF NOT EXISTS payslip_view_log (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payslip_id   UUID        NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  actor_id     UUID        NOT NULL,   -- user.sub from JWT
  actor_type   TEXT        NOT NULL    CHECK (actor_type IN ('admin', 'employee')),
  action       TEXT        NOT NULL    CHECK (action IN ('view', 'download', 'print')),
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  -- intentionally no updated_at — append-only, tamper-evident
);

CREATE INDEX IF NOT EXISTS idx_pvl_payslip
  ON payslip_view_log(payslip_id);

CREATE INDEX IF NOT EXISTS idx_pvl_tenant_date
  ON payslip_view_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pvl_actor
  ON payslip_view_log(actor_id, tenant_id);
