-- Migration 108: Extend exit_requests / exit_checklist / exit_clearances /
-- final_settlements for the full offboarding workflow (approval-engine sync
-- columns, notice period tracking, withdrawal, template linkage, FnF audit
-- breakdown). Additive only — safe on existing data.

-- ─── exit_requests ───────────────────────────────────────────────────────────
ALTER TABLE exit_requests
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approval_step INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approval_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS withdrawn_reason TEXT,
  ADD COLUMN IF NOT EXISTS notice_start_date DATE,
  ADD COLUMN IF NOT EXISTS notice_end_date DATE,
  ADD COLUMN IF NOT EXISTS notice_period_waived_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_buyout_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_pay_recovery_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'self_service',
  ADD COLUMN IF NOT EXISTS attendance_frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE exit_requests DROP CONSTRAINT IF EXISTS exit_requests_status_check;
ALTER TABLE exit_requests ADD CONSTRAINT exit_requests_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'rejected', 'withdrawn',
    'notice_period', 'clearance_in_progress', 'pending_settlement',
    'settled', 'completed', 'cancelled'
  ));

ALTER TABLE exit_requests DROP CONSTRAINT IF EXISTS exit_requests_request_type_check;
ALTER TABLE exit_requests ADD CONSTRAINT exit_requests_request_type_check
  CHECK (request_type IN (
    'resignation', 'retirement', 'termination',
    'contract_completion', 'mutual_separation', 'absconding'
  ));

ALTER TABLE exit_requests DROP CONSTRAINT IF EXISTS exit_requests_source_check;
ALTER TABLE exit_requests ADD CONSTRAINT exit_requests_source_check
  CHECK (source IN ('self_service', 'hr_admin'));

CREATE INDEX IF NOT EXISTS idx_exit_requests_branch ON exit_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_exit_requests_submitted_by ON exit_requests(submitted_by);

-- ─── exit_checklist ──────────────────────────────────────────────────────────
ALTER TABLE exit_checklist
  ADD COLUMN IF NOT EXISTS template_item_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE exit_checklist DROP CONSTRAINT IF EXISTS exit_checklist_priority_check;
ALTER TABLE exit_checklist ADD CONSTRAINT exit_checklist_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- ─── exit_clearances ─────────────────────────────────────────────────────────
ALTER TABLE exit_clearances
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE exit_clearances DROP CONSTRAINT IF EXISTS exit_clearances_status_check;
ALTER TABLE exit_clearances ADD CONSTRAINT exit_clearances_status_check
  CHECK (status IN ('pending', 'in_review', 'cleared', 'rejected', 'returned', 'blocked'));

-- ─── final_settlements ───────────────────────────────────────────────────────
ALTER TABLE final_settlements
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approval_step INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approval_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS tax_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_recovery DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calc_breakdown JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_auto_calculated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS pdf_document_id UUID REFERENCES documents(id);

ALTER TABLE final_settlements DROP CONSTRAINT IF EXISTS final_settlements_payment_status_check;
ALTER TABLE final_settlements ADD CONSTRAINT final_settlements_payment_status_check
  CHECK (payment_status IN ('pending', 'pending_approval', 'approved', 'rejected', 'paid', 'on_hold'));

CREATE INDEX IF NOT EXISTS idx_final_settlements_branch ON final_settlements(branch_id);
