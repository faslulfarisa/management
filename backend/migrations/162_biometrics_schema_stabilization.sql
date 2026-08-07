-- 162_biometrics_schema_stabilization.sql
-- Biometrics production stabilization: additive schema alignment for ADMS push,
-- TCP pull, EasyTimePro, trusted terminals, mobile punches, durable replay
-- protection, command queue, offline buffering, and provider mappings.
--
-- SAFE: additive only. No existing data is removed or rewritten.

-- ---------------------------------------------------------------------------
-- attendance_records: queryable punch provenance fields
-- ---------------------------------------------------------------------------

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS sync_batch_id UUID,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS terminal_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS work_code TEXT,
  ADD COLUMN IF NOT EXISTS punch_state TEXT,
  ADD COLUMN IF NOT EXISTS raw_verify_type TEXT,
  ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS gps_accuracy_meters NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS gps_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ip INET,
  ADD COLUMN IF NOT EXISTS source_user_agent TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_attendance_records_gps_latitude'
      AND conrelid = 'attendance_records'::regclass
  ) THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT chk_attendance_records_gps_latitude
      CHECK (gps_latitude IS NULL OR (gps_latitude >= -90 AND gps_latitude <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_attendance_records_gps_longitude'
      AND conrelid = 'attendance_records'::regclass
  ) THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT chk_attendance_records_gps_longitude
      CHECK (gps_longitude IS NULL OR (gps_longitude >= -180 AND gps_longitude <= 180));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_records_sync_batch
  ON attendance_records (tenant_id, sync_batch_id)
  WHERE sync_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_request_id
  ON attendance_records (tenant_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_work_code
  ON attendance_records (tenant_id, work_code, date DESC)
  WHERE work_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_punch_state
  ON attendance_records (tenant_id, punch_state, date DESC)
  WHERE punch_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_terminal_serial
  ON attendance_records (tenant_id, terminal_serial_number, date DESC)
  WHERE terminal_serial_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_gps
  ON attendance_records (tenant_id, gps_recorded_at DESC)
  WHERE gps_latitude IS NOT NULL AND gps_longitude IS NOT NULL;

-- ---------------------------------------------------------------------------
-- attendance_terminals: stable terminal identity and heartbeat detail
-- ---------------------------------------------------------------------------

ALTER TABLE attendance_terminals
  ADD COLUMN IF NOT EXISTS terminal_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_ip INET,
  ADD COLUMN IF NOT EXISTS heartbeat_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_terminals_tenant_serial
  ON attendance_terminals (tenant_id, terminal_serial_number)
  WHERE terminal_serial_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_terminals_tenant_fingerprint
  ON attendance_terminals (tenant_id, device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_terminals_last_heartbeat
  ON attendance_terminals (tenant_id, last_heartbeat_at DESC)
  WHERE last_heartbeat_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- biometric_devices: richer heartbeat/status metadata for device monitoring
-- ---------------------------------------------------------------------------

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_ip INET,
  ADD COLUMN IF NOT EXISTS heartbeat_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_timezone TEXT,
  ADD COLUMN IF NOT EXISTS last_adms_stamp TEXT,
  ADD COLUMN IF NOT EXISTS last_adms_op_stamp TEXT,
  ADD COLUMN IF NOT EXISTS command_capabilities JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_biometric_devices_last_heartbeat
  ON biometric_devices (tenant_id, last_heartbeat_at DESC)
  WHERE last_heartbeat_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biometric_devices_status
  ON biometric_devices (tenant_id, status);

-- ---------------------------------------------------------------------------
-- punch_fingerprints: durable replay context for devices, terminals and batches
-- ---------------------------------------------------------------------------

ALTER TABLE punch_fingerprints
  ADD COLUMN IF NOT EXISTS biometric_device_id UUID REFERENCES biometric_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES attendance_terminals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_device_id TEXT,
  ADD COLUMN IF NOT EXISTS attendance_source TEXT,
  ADD COLUMN IF NOT EXISTS raw_verify_type TEXT,
  ADD COLUMN IF NOT EXISTS work_code TEXT,
  ADD COLUMN IF NOT EXISTS punch_state TEXT,
  ADD COLUMN IF NOT EXISTS sync_batch_id UUID,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS source_ip INET;

CREATE INDEX IF NOT EXISTS idx_pf_sync_batch
  ON punch_fingerprints (tenant_id, sync_batch_id)
  WHERE sync_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pf_source_device
  ON punch_fingerprints (tenant_id, provider_name, source_device_id, punched_at DESC)
  WHERE source_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pf_terminal
  ON punch_fingerprints (terminal_id, punched_at DESC)
  WHERE terminal_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Provider employee mappings: EasyTimePro/ZKTeco/external user identity bridge
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS biometric_employee_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,

  employee_code TEXT NOT NULL,
  provider_employee_id TEXT,
  provider_user_id TEXT,
  device_user_id TEXT,
  card_number TEXT,

  mapping_status TEXT NOT NULL DEFAULT 'active'
    CHECK (mapping_status IN ('active', 'inactive', 'conflict', 'unmapped')),
  confidence NUMERIC(5, 2),
  source TEXT NOT NULL DEFAULT 'sync',
  metadata JSONB NOT NULL DEFAULT '{}',

  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, provider_name, employee_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bem_provider_employee_id
  ON biometric_employee_mappings (tenant_id, provider_name, provider_employee_id)
  WHERE provider_employee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bem_provider_user_id
  ON biometric_employee_mappings (tenant_id, provider_name, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bem_employee
  ON biometric_employee_mappings (tenant_id, employee_id)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bem_integration
  ON biometric_employee_mappings (integration_id)
  WHERE integration_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Durable command queue for ADMS/device command polling and result tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS biometric_device_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  biometric_device_id UUID REFERENCES biometric_devices(id) ON DELETE SET NULL,

  provider_name TEXT NOT NULL,
  device_serial_number TEXT NOT NULL,
  command_key TEXT NOT NULL,
  command_type TEXT NOT NULL,
  command_payload JSONB NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'acknowledged', 'succeeded', 'failed', 'expired', 'cancelled')),
  priority INT NOT NULL DEFAULT 100,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,

  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  result_code TEXT,
  result_message TEXT,
  result_payload JSONB,
  last_error TEXT,
  correlation_id TEXT,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, provider_name, device_serial_number, command_key)
);

CREATE INDEX IF NOT EXISTS idx_bdc_pending
  ON biometric_device_commands (tenant_id, provider_name, device_serial_number, priority, available_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_bdc_device_status
  ON biometric_device_commands (tenant_id, biometric_device_id, status, queued_at DESC)
  WHERE biometric_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bdc_integration
  ON biometric_device_commands (integration_id, queued_at DESC)
  WHERE integration_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Durable offline punch buffer. Redis remains the hot path; this table gives
-- recovery/audit semantics when a job cannot be enqueued or Redis is recycled.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS biometric_offline_punch_buffers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  source_device_id TEXT,
  terminal_id UUID REFERENCES attendance_terminals(id) ON DELETE SET NULL,
  sync_batch_id UUID,
  request_id TEXT,
  correlation_id TEXT,

  payload JSONB NOT NULL,
  punch_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'buffered'
    CHECK (status IN ('buffered', 'queued', 'processing', 'processed', 'failed', 'expired')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  buffered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  queued_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bopb_pending
  ON biometric_offline_punch_buffers (tenant_id, provider_name, status, buffered_at)
  WHERE status IN ('buffered', 'failed');

CREATE INDEX IF NOT EXISTS idx_bopb_sync_batch
  ON biometric_offline_punch_buffers (tenant_id, sync_batch_id)
  WHERE sync_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bopb_request
  ON biometric_offline_punch_buffers (tenant_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bopb_request
  ON biometric_offline_punch_buffers (tenant_id, provider_name, request_id)
  WHERE request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Durable terminal replay-protection registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS terminal_replay_nonces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  terminal_id UUID NOT NULL REFERENCES attendance_terminals(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  request_id TEXT,
  request_timestamp TIMESTAMPTZ,
  source_ip INET,
  user_agent TEXT,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',

  UNIQUE (tenant_id, terminal_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_terminal_replay_nonces_expiry
  ON terminal_replay_nonces (expires_at);

CREATE INDEX IF NOT EXISTS idx_terminal_replay_nonces_terminal
  ON terminal_replay_nonces (terminal_id, consumed_at DESC);

-- ---------------------------------------------------------------------------
-- Sync log correlation and provider lookup indexes
-- ---------------------------------------------------------------------------

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS sync_batch_id UUID,
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE biometric_sync_logs
  ADD COLUMN IF NOT EXISTS sync_batch_id UUID,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_sync_logs_batch
  ON sync_logs (tenant_id, sync_batch_id)
  WHERE sync_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_logs_provider
  ON sync_logs (tenant_id, provider_name, started_at DESC)
  WHERE provider_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biometric_sync_logs_batch
  ON biometric_sync_logs (tenant_id, sync_batch_id)
  WHERE sync_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integrations_active_type
  ON integrations (tenant_id, type, is_active);

CREATE INDEX IF NOT EXISTS idx_integrations_zkteco_device_sn
  ON integrations ((config->>'device_sn'))
  WHERE type = 'zkteco' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_integrations_easytimepro_active
  ON integrations (tenant_id, updated_at DESC)
  WHERE type = 'easytimepro' AND is_active = true;

COMMENT ON TABLE biometric_device_commands IS
  'Durable outbound command queue for ADMS/TCP biometric devices, including polling and execution results.';

COMMENT ON TABLE biometric_offline_punch_buffers IS
  'Durable offline punch buffer complementing Redis queue buffering for audit and recovery.';

COMMENT ON TABLE terminal_replay_nonces IS
  'Durable replay-protection registry for trusted terminal punches.';

COMMENT ON TABLE biometric_employee_mappings IS
  'Provider-agnostic employee identity mapping for EasyTimePro, ZKTeco and other biometric systems.';
