-- 106_attendance_performance_engine.sql
-- Attendance Behaviour Performance Engine: wires existing attendance data
-- into the Performance Module (review_cycles / kras / kpis / performance_reviews
-- from 019_compliance_performance.sql) as an automatically-computed, fully
-- config-driven score component.
--
-- Run after: 105_attendance_summary_payroll_lock_v2.sql
-- SAFE: fully additive (new tables + nullable/defaulted ALTER columns).

-- ── Per-tenant scoring configuration ─────────────────────────────────────────
-- One JSONB-config row per tenant. Holds weightages, penalty/bonus
-- parameters, and rating buckets — see AttendanceBehaviourConfigService for
-- the shape (DEFAULT_CONFIG) and validation rules. Mirrors the JSONB-config
-- pattern already used by document_branding_config / automation_rules rather
-- than adding ~15 individual typed columns for values admins should be able
-- to retune without a migration.
CREATE TABLE IF NOT EXISTS performance_configuration (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE,
  config JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Per-employee, per-cycle attendance behaviour snapshot ───────────────────
-- Computed once when a review cycle goes active, recomputable while the
-- cycle is open, frozen (status='frozen') the moment the cycle is approved
-- or locked. Generate/recalculate/override events are written to the
-- existing `audit_logs` table rather than a parallel version-history table —
-- that audit trail also feeds the Performance Timeline UI.
CREATE TABLE IF NOT EXISTS attendance_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  cycle_id UUID NOT NULL REFERENCES review_cycles(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  business_working_days INT NOT NULL DEFAULT 0,
  present_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  half_day_count INT NOT NULL DEFAULT 0,
  late_count INT NOT NULL DEFAULT 0,
  unapproved_absence_days INT NOT NULL DEFAULT 0,
  paid_leave_days INT NOT NULL DEFAULT 0,
  unpaid_leave_days INT NOT NULL DEFAULT 0,
  approved_ot_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  corrections_count INT NOT NULL DEFAULT 0,

  attendance_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  attendance_compliance_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  component_scores JSONB NOT NULL DEFAULT '{}',
  behaviour_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  behaviour_rating VARCHAR(40),

  status VARCHAR(20) NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated', 'recalculated', 'frozen')),
  generation_version INT NOT NULL DEFAULT 1,
  config_version INT NOT NULL DEFAULT 1,
  generated_by UUID REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_by UUID REFERENCES users(id),
  frozen_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, employee_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_aps_tenant_cycle ON attendance_performance_snapshots(tenant_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_aps_employee ON attendance_performance_snapshots(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_aps_status ON attendance_performance_snapshots(tenant_id, status);

-- ── performance_reviews: score breakdown + attendance override ──────────────
ALTER TABLE performance_reviews
  ADD COLUMN IF NOT EXISTS kra_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS kpi_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS attendance_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS attendance_score_original NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS attendance_score_overridden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS attendance_override_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS attendance_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_snapshot_id UUID REFERENCES attendance_performance_snapshots(id),
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id);

-- ── review_cycles: last-calculated marker for the admin UI ──────────────────
ALTER TABLE review_cycles
  ADD COLUMN IF NOT EXISTS attendance_last_calculated_at TIMESTAMPTZ;
