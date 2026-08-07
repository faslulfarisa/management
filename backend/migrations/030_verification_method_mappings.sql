-- 030_verification_method_mappings.sql
-- Maps provider-specific raw verification mode values to the normalized
-- VerifyMethod enum used by the attendance engine.
-- Seeded with known EasyTimePro and ZKTeco firmware values.
-- Run after 029_biometric_sync_cursors.sql
-- SAFE: New table + seed inserts — no existing data touched.

CREATE TABLE IF NOT EXISTS verification_method_mappings (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name     TEXT  NOT NULL,
  raw_value         TEXT  NOT NULL,

  -- Must match VerifyMethod enum values in punch-event.dto.ts (lowercase)
  normalized_method TEXT  NOT NULL
    CHECK (normalized_method IN ('fingerprint', 'face', 'card', 'password', 'hybrid', 'other')),

  description       TEXT,

  UNIQUE (provider_name, raw_value)
);

-- ── EasyTimePro VerifyMode values (standard ZEM800 / ProBio / iClock firmware) ──
INSERT INTO verification_method_mappings (provider_name, raw_value, normalized_method, description) VALUES
  ('easytimepro', '0',  'password',    'Password / PIN'),
  ('easytimepro', '1',  'fingerprint', 'Fingerprint'),
  ('easytimepro', '2',  'card',        'RFID / Card'),
  ('easytimepro', '3',  'face',        'Face recognition'),
  ('easytimepro', '4',  'fingerprint', 'Fingerprint (secondary slot)'),
  ('easytimepro', '10', 'hybrid',      'Multi-modal (fingerprint + face)'),
  ('easytimepro', '15', 'other',       'WiFi / Unknown'),
  -- String variants some ETP versions emit
  ('easytimepro', 'FP',       'fingerprint', 'Fingerprint (string variant)'),
  ('easytimepro', 'FACE',     'face',        'Face (string variant)'),
  ('easytimepro', 'CARD',     'card',        'Card (string variant)'),
  ('easytimepro', 'PASSWORD', 'password',    'Password (string variant)')
ON CONFLICT (provider_name, raw_value) DO NOTHING;

-- ── ZKTeco ADMS firmware VerifyMode values ────────────────────────────────────
INSERT INTO verification_method_mappings (provider_name, raw_value, normalized_method, description) VALUES
  ('zkteco', '0',  'password',    'Password / PIN'),
  ('zkteco', '1',  'fingerprint', 'Fingerprint'),
  ('zkteco', '3',  'card',        'Card / Badge'),
  ('zkteco', '4',  'face',        'Face recognition'),
  ('zkteco', '15', 'other',       'Other / Unknown')
ON CONFLICT (provider_name, raw_value) DO NOTHING;
