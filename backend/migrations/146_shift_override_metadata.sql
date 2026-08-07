-- 146_shift_override_metadata.sql
-- Store action-specific resolution metadata, for example leave type mapping.

ALTER TABLE shift_override_requests
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
