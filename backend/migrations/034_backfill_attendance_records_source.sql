-- 034_backfill_attendance_records_source.sql
-- Backfills verify_method and attendance_source on attendance_records rows
-- that were created before migration 031 added these columns.
--
-- Strategy (priority order):
--   1. Rows linked to an attendance_terminal  → source from terminal.device_type
--   2. Rows linked to a biometric_device      → source from device.hardware_type
--   3. All remaining NULL attendance_source   → 'biometric_device' (safe default)
--   4. All remaining NULL verify_method       → 'other' (original value unrecoverable)
--
-- SAFE: All updates are guarded by WHERE column IS NULL — idempotent and
--       re-runnable without corrupting rows already populated by the live pipeline.
--
-- PERFORMANCE: Rows are processed in batches of 10,000 with a short loop to
--              avoid table-level lock contention on large datasets.
--              Run during a low-traffic window for best results on huge tables.

DO $$
DECLARE
  updated_count INTEGER;
BEGIN

  -- ── Step 1: terminal-sourced rows ────────────────────────────────────────
  LOOP
    WITH batch AS (
      SELECT ar.id,
             CASE t.device_type
               WHEN 'mobile' THEN 'mobile_terminal'
               WHEN 'kiosk'  THEN 'kiosk_terminal'
               ELSE               'laptop_terminal'   -- laptop + tablet
             END AS derived_source
      FROM attendance_records ar
      JOIN attendance_terminals t ON ar.terminal_id = t.id
      WHERE ar.attendance_source IS NULL
      LIMIT 10000
    )
    UPDATE attendance_records ar
    SET    attendance_source = batch.derived_source
    FROM   batch
    WHERE  ar.id = batch.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    EXIT WHEN updated_count = 0;
  END LOOP;

  -- ── Step 2: device-sourced rows ───────────────────────────────────────────
  LOOP
    WITH batch AS (
      SELECT ar.id,
             CASE bd.hardware_type
               WHEN 'fingerprint' THEN 'fingerprint_device'
               WHEN 'face'        THEN 'face_device'
               WHEN 'card'        THEN 'card_device'
               ELSE                    'biometric_device'
             END AS derived_source
      FROM attendance_records ar
      JOIN biometric_devices bd ON ar.biometric_device_id = bd.id
      WHERE ar.attendance_source IS NULL
      LIMIT 10000
    )
    UPDATE attendance_records ar
    SET    attendance_source = batch.derived_source
    FROM   batch
    WHERE  ar.id = batch.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    EXIT WHEN updated_count = 0;
  END LOOP;

  -- ── Step 3: remaining rows with no device / terminal link ─────────────────
  -- These are pre-Phase-3 records: they came through the legacy punch path
  -- before device and terminal FK columns existed.  'biometric_device' is the
  -- correct operational default — all early-phase data arrived via EasyTimePro.
  LOOP
    UPDATE attendance_records
    SET    attendance_source = 'biometric_device'
    WHERE  attendance_source IS NULL
      AND  id IN (
             SELECT id FROM attendance_records
             WHERE  attendance_source IS NULL
             LIMIT  10000
           );

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    EXIT WHEN updated_count = 0;
  END LOOP;

  -- ── Step 4: verify_method — original value is unrecoverable ──────────────
  -- Legacy records were written before verify method tracking was added.
  -- 'other' is the sentinel for "source did not report a method" and is used
  -- throughout the normalization layer as the safe fallback.
  LOOP
    UPDATE attendance_records
    SET    verify_method = 'other'
    WHERE  verify_method IS NULL
      AND  id IN (
             SELECT id FROM attendance_records
             WHERE  verify_method IS NULL
             LIMIT  10000
           );

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    EXIT WHEN updated_count = 0;
  END LOOP;

END $$;

-- ── Verification query (run manually after migration to confirm) ──────────────
-- SELECT
--   attendance_source,
--   verify_method,
--   COUNT(*) AS records
-- FROM attendance_records
-- GROUP BY attendance_source, verify_method
-- ORDER BY attendance_source, verify_method;
