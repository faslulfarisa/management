-- 165_pending_punch_reviews.sql
-- Durable review queue for valid biometric punches that cannot be mapped to an
-- employee at ingestion time. Additive only.

CREATE TABLE IF NOT EXISTS pending_punch_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,

  provider_name TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  punch_timestamp TIMESTAMPTZ NOT NULL,
  punch_type TEXT,
  device_id TEXT,
  terminal_id UUID REFERENCES attendance_terminals(id) ON DELETE SET NULL,
  terminal_serial_number TEXT,
  attendance_source TEXT,
  request_id TEXT,
  correlation_id TEXT,
  sync_batch_id UUID,
  source_ip INET,
  source_user_agent TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  diagnostics JSONB NOT NULL DEFAULT '{}',
  mapping_suggestions JSONB NOT NULL DEFAULT '[]',

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'mapped', 'retrying', 'processed', 'ignored', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  last_error TEXT,
  resolved_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_pending_punch_reviews_pending
  ON pending_punch_reviews (tenant_id, status, created_at DESC)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_pending_punch_reviews_employee_code
  ON pending_punch_reviews (tenant_id, employee_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_punch_reviews_request
  ON pending_punch_reviews (tenant_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pending_punch_reviews_device
  ON pending_punch_reviews (tenant_id, provider_name, device_id, punch_timestamp DESC)
  WHERE device_id IS NOT NULL;

ALTER TABLE punch_fingerprints
  ADD COLUMN IF NOT EXISTS pending_review_id UUID REFERENCES pending_punch_reviews(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS punch_submission_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  request_timestamp TIMESTAMPTZ NOT NULL,
  request_id TEXT,
  source_ip INET,
  user_agent TEXT,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',

  UNIQUE (tenant_id, principal_type, principal_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_punch_submission_nonces_expiry
  ON punch_submission_nonces (expires_at);

COMMENT ON TABLE pending_punch_reviews IS
  'Review queue for valid attendance punches whose employee_code is not mapped yet. '
  'Rows preserve raw payloads, diagnostics, mapping suggestions, retry history, and final links.';

COMMENT ON TABLE punch_submission_nonces IS
  'Durable replay protection for terminal, mobile, Python, and integration punch submissions.';
