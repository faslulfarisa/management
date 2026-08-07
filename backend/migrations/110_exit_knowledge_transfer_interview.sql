-- Migration 110: Knowledge transfer and exit interview tables.
-- File attachments for both go through the existing generic `documents` table
-- (entity_type='exit_knowledge_transfer' / 'exit_interview') — no file columns
-- here. No password/credential fields anywhere, by design.

CREATE TABLE IF NOT EXISTS exit_knowledge_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exit_request_id UUID NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
  handover_to UUID REFERENCES employees(id),
  responsibilities TEXT,
  current_projects TEXT,
  pending_tasks TEXT,
  client_information TEXT,
  system_access TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'reviewed', 'approved')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_remarks TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ekt_request ON exit_knowledge_transfers(exit_request_id);
CREATE INDEX IF NOT EXISTS idx_ekt_tenant ON exit_knowledge_transfers(tenant_id);

CREATE TABLE IF NOT EXISTS exit_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exit_request_id UUID NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ,
  conducted_by UUID REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'completed', 'skipped')),
  overall_rating INT CHECK (overall_rating BETWEEN 1 AND 5),
  reason_for_leaving VARCHAR(100),
  responses JSONB NOT NULL DEFAULT '{}',
  would_recommend BOOLEAN,
  suggestions TEXT,
  manager_feedback TEXT,
  hr_feedback TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_interviews_request ON exit_interviews(exit_request_id);
CREATE INDEX IF NOT EXISTS idx_exit_interviews_tenant ON exit_interviews(tenant_id);
