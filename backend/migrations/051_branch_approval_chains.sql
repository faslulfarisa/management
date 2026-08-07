-- Migration 051: Branch approval chains
-- Phase 5 foundation for Phase 6 governance: stores per-branch approval sequences
-- for leave, expense, and reimbursement workflows.
-- Safe: new table only — no existing tables modified.

CREATE TABLE IF NOT EXISTS branch_approval_chains (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

  -- What workflow this chain applies to
  workflow_type   TEXT        NOT NULL
    CHECK (workflow_type IN ('leave', 'expense', 'reimbursement', 'transfer', 'payroll')),

  -- Ordered list of approver steps (JSONB array)
  -- Each element: { step: 1, role: 'branch_manager' | 'branch_hr' | 'org_admin', approver_id: UUID|null }
  steps           JSONB       NOT NULL DEFAULT '[]',

  -- Whether this chain is active for the branch + workflow
  is_active       BOOLEAN     NOT NULL DEFAULT true,

  -- Optional: auto-approve if no action within this many hours (null = no auto-approve)
  auto_approve_hours INT,

  -- Metadata
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, branch_id, workflow_type)
);

CREATE INDEX IF NOT EXISTS idx_branch_approval_chains_branch
  ON branch_approval_chains(branch_id);

CREATE INDEX IF NOT EXISTS idx_branch_approval_chains_tenant_workflow
  ON branch_approval_chains(tenant_id, workflow_type)
  WHERE is_active = true;
