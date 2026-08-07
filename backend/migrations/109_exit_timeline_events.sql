-- Migration 109: Exit timeline events
-- Append-only stage history for an exit request, independent of the
-- approval-engine's own approval_log — this is what renders the visual
-- offboarding timeline (submitted -> approved -> notice period -> ... ->
-- completed) regardless of which sub-system drove a given stage transition.

CREATE TABLE IF NOT EXISTS exit_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exit_request_id UUID NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
  stage VARCHAR(50) NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  actor_id UUID REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_timeline_request ON exit_timeline_events(exit_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exit_timeline_tenant ON exit_timeline_events(tenant_id);
