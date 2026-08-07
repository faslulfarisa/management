-- 164_adms_lifecycle.sql
-- Completes ADMS/iClock lifecycle state tracking for device heartbeats,
-- command transfer timestamps, command return timestamps, and return codes.
-- SAFE: additive only.

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adms_registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adms_last_transfer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adms_last_return_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_version TEXT;

ALTER TABLE biometric_device_commands
  ADD COLUMN IF NOT EXISTS transfer_stamp TEXT,
  ADD COLUMN IF NOT EXISTS return_stamp TEXT,
  ADD COLUMN IF NOT EXISTS return_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_zkteco_active_device_sn
  ON integrations ((config->>'device_sn'))
  WHERE type = 'zkteco'
    AND is_active = true
    AND config->>'device_sn' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_biometric_devices_zkteco_active_serial
  ON biometric_devices (provider_name, serial_number)
  WHERE provider_name = 'zkteco'
    AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_biometric_devices_adms_seen
  ON biometric_devices (tenant_id, provider_name, last_seen_at DESC)
  WHERE provider_name = 'zkteco';

CREATE INDEX IF NOT EXISTS idx_bdc_device_serial_status
  ON biometric_device_commands (tenant_id, provider_name, device_serial_number, status, queued_at DESC);
