-- Migration 054: Centralized approval_requests registry
-- Provides a single cross-module inbox, analytics surface, and audit trail for
-- all approval workflows. Entity tables (leave_requests, expenses, etc.) remain
-- authoritative for domain columns; this table mirrors approval lifecycle state.
-- Safe: new table only — no existing tables modified.

CREATE TABLE IF NOT EXISTS approval_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Workflow identification
  workflow_type    TEXT        NOT NULL,
  -- Supported: leave|expense|reimbursement|transfer|payroll|
  --   attendance_correction|manual_attendance|overtime|shift_change|
  --   biometric_device|onboarding|exit_clearance|ff_settlement|
  --   salary_revision|role_change|policy_change|vendor_approval

  -- Pointer to the underlying entity row
  entity_id        UUID        NOT NULL,
  entity_table     TEXT        NOT NULL,

  -- Submitter context
  submitted_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  branch_id        UUID        REFERENCES branches(id) ON DELETE SET NULL,
  department_id    UUID        REFERENCES departments(id) ON DELETE SET NULL,

  -- Human-readable display
  title            TEXT        NOT NULL,
  description      TEXT,

  -- Approval chain progression (mirrors entity approval_step)
  current_step     INT         NOT NULL DEFAULT 1,
  total_steps      INT,

  -- Status lifecycle
  status           TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'under_review', 'approved', 'partially_approved',
      'rejected', 'escalated', 'cancelled', 'expired'
    )),

  -- Priority and SLA
  priority         TEXT        NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  sla_hours        INT,
  due_at           TIMESTAMPTZ,

  -- Full immutable audit trail
  -- Each entry: { step, actor_id, action, reason, remarks, timestamp, role, ip_address }
  approval_log     JSONB       NOT NULL DEFAULT '[]',

  -- Top-level rejection reason for quick query (also stored in approval_log)
  rejection_reason TEXT,

  -- Workflow-type-specific display context (employee name, dates, amounts, etc.)
  metadata         JSONB       NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

-- Inbox query (most critical read path): pending items per tenant
CREATE INDEX IF NOT EXISTS idx_ar_tenant_status
  ON approval_requests(tenant_id, status)
  WHERE status IN ('pending', 'under_review', 'escalated');

-- Branch-scoped inbox (approver sees items for their branch)
CREATE INDEX IF NOT EXISTS idx_ar_branch
  ON approval_requests(tenant_id, branch_id)
  WHERE status IN ('pending', 'under_review');

-- Entity sync lookups (ApprovalEngineService.syncEntityStatus)
CREATE INDEX IF NOT EXISTS idx_ar_entity
  ON approval_requests(entity_table, entity_id);

-- Analytics and workflow-type filtering
CREATE INDEX IF NOT EXISTS idx_ar_workflow
  ON approval_requests(tenant_id, workflow_type);

-- SLA expiry cron job
CREATE INDEX IF NOT EXISTS idx_ar_due_at
  ON approval_requests(due_at)
  WHERE status IN ('pending', 'under_review') AND due_at IS NOT NULL;

-- Submitter's "My Submitted" inbox
CREATE INDEX IF NOT EXISTS idx_ar_submitted_by
  ON approval_requests(tenant_id, submitted_by);
