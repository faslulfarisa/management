-- Migration 052: Multi-step approval tracking on leave_requests, expenses, reimbursements
-- Phase 6: wires branch_approval_chains into the three workflow tables.
-- Safe: additive only — new columns with sensible defaults, no existing data touched.

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS approval_step  INT   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log   JSONB NOT NULL DEFAULT '[]';

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS approval_step  INT   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log   JSONB NOT NULL DEFAULT '[]';

ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS approval_step  INT   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log   JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_lr_approval_step    ON leave_requests(tenant_id, approval_step)  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_exp_approval_step   ON expenses(tenant_id, approval_step)         WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reimb_approval_step ON reimbursements(tenant_id, approval_step)   WHERE status = 'pending';
