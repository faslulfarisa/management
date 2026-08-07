-- 160_enterprise_scale_database_preparation.sql
-- Enterprise-scale database preparation for high-volume deployments.
--
-- Safe migration only:
-- - Does not partition existing hot tables in place.
-- - Does not move, archive, delete, or rewrite business data.
-- - Adds metadata, empty historical tables, maintenance recommendations, and
--   table-level maintenance settings that prepare future online cutovers.

CREATE TABLE IF NOT EXISTS enterprise_partition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL UNIQUE,
  partition_key TEXT NOT NULL,
  partition_interval TEXT NOT NULL DEFAULT 'monthly',
  desired_strategy TEXT NOT NULL DEFAULT 'range',
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'validated', 'ready_for_cutover', 'active', 'paused', 'retired')),
  retain_hot_months INTEGER NOT NULL,
  precreate_months_ahead INTEGER NOT NULL DEFAULT 3,
  keep_empty_months_behind INTEGER NOT NULL DEFAULT 1,
  proposed_parent_table TEXT NOT NULL,
  proposed_default_partition TEXT,
  cutover_requires TEXT NOT NULL DEFAULT 'dedicated migration window',
  validation_query TEXT,
  rollback_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE enterprise_partition_plans IS
  'Declarative monthly partitioning plan. Rows are advisory until a separate cutover migration creates partitioned parents and migrates data.';

CREATE TABLE IF NOT EXISTS enterprise_partition_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  partition_name TEXT NOT NULL,
  partition_from DATE NOT NULL,
  partition_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'created', 'attached', 'detached', 'archived', 'dropped', 'skipped')),
  row_count_estimate BIGINT,
  last_analyzed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(table_name, partition_from)
);

CREATE INDEX IF NOT EXISTS idx_partition_windows_table_from
  ON enterprise_partition_windows(table_name, partition_from DESC);

CREATE TABLE IF NOT EXISTS enterprise_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL UNIQUE,
  tenant_scoped BOOLEAN NOT NULL DEFAULT true,
  time_column TEXT NOT NULL,
  hot_retention_months INTEGER NOT NULL,
  archive_after_months INTEGER NOT NULL,
  hard_delete_after_months INTEGER,
  archive_enabled BOOLEAN NOT NULL DEFAULT true,
  cleanup_enabled BOOLEAN NOT NULL DEFAULT false,
  legal_hold_supported BOOLEAN NOT NULL DEFAULT true,
  cleanup_batch_size INTEGER NOT NULL DEFAULT 5000,
  max_runtime_seconds INTEGER NOT NULL DEFAULT 300,
  strategy TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE enterprise_retention_policies IS
  'Retention and archive policy registry. cleanup_enabled is intentionally false by default so this migration cannot change runtime data lifecycle behavior.';

CREATE TABLE IF NOT EXISTS enterprise_archive_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  archive_table_name TEXT NOT NULL,
  tenant_id UUID,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'completed', 'failed', 'cancelled')),
  rows_selected BIGINT NOT NULL DEFAULT 0,
  rows_archived BIGINT NOT NULL DEFAULT 0,
  rows_deleted BIGINT NOT NULL DEFAULT 0,
  checksum TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archive_batches_table_created
  ON enterprise_archive_batches(table_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_archive_batches_tenant_status
  ON enterprise_archive_batches(tenant_id, status, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS enterprise_maintenance_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL
    CHECK (job_type IN ('archive', 'cleanup', 'partition_create', 'partition_validate', 'analyze', 'vacuum', 'index_maintenance', 'connection_review')),
  target_table TEXT,
  recommended_schedule TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  max_runtime_seconds INTEGER NOT NULL DEFAULT 900,
  advisory_lock_key BIGINT,
  sql_template TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE enterprise_maintenance_jobs IS
  'External scheduler registry for maintenance tasks. Jobs are disabled by default and require an application or DBA scheduler to execute.';

CREATE TABLE IF NOT EXISTS enterprise_database_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  target_name TEXT,
  recommendation TEXT NOT NULL,
  rationale TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  applied_by_migration BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category, target_name, recommendation)
);

CREATE TABLE IF NOT EXISTS enterprise_table_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  estimated_rows BIGINT,
  total_bytes BIGINT,
  table_bytes BIGINT,
  index_bytes BIGINT,
  dead_tuples BIGINT,
  last_vacuum TIMESTAMPTZ,
  last_autovacuum TIMESTAMPTZ,
  last_analyze TIMESTAMPTZ,
  last_autoanalyze TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_table_health_table_captured
  ON enterprise_table_health_snapshots(table_name, captured_at DESC);

DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('attendance_records', 'attendance_records_history'),
      ('audit_logs', 'audit_logs_history'),
      ('notifications', 'notifications_history'),
      ('break_sessions', 'break_sessions_history'),
      ('approval_requests', 'approval_requests_history'),
      ('report_export_logs', 'report_export_logs_history')
    ) AS v(source_table, history_table)
  LOOP
    IF to_regclass(item.source_table) IS NOT NULL THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I (LIKE %I INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY)',
        item.history_table,
        item.source_table
      );

      EXECUTE format(
        'ALTER TABLE %I
           ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           ADD COLUMN IF NOT EXISTS archive_batch_id UUID,
           ADD COLUMN IF NOT EXISTS archive_reason TEXT NOT NULL DEFAULT ''retention_policy'',
           ADD COLUMN IF NOT EXISTS source_partition_name TEXT,
           ADD COLUMN IF NOT EXISTS retained_until DATE,
           ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false',
        item.history_table
      );

      EXECUTE format(
        'COMMENT ON TABLE %I IS %L',
        item.history_table,
        'Historical/archive copy table prepared for enterprise retention jobs. This migration creates structure only and does not move live rows.'
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('attendance_records_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_attendance_records_history_tenant_date
      ON attendance_records_history(tenant_id, date DESC, id);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_history_employee_date
      ON attendance_records_history(tenant_id, employee_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_history_archive
      ON attendance_records_history(archived_at DESC);
  END IF;

  IF to_regclass('audit_logs_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_history_tenant_created
      ON audit_logs_history(tenant_id, created_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_history_entity_created
      ON audit_logs_history(tenant_id, entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_history_archive
      ON audit_logs_history(archived_at DESC);
  END IF;

  IF to_regclass('notifications_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_history_user_created
      ON notifications_history(tenant_id, user_id, created_at DESC, id)
      WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_notifications_history_archive
      ON notifications_history(archived_at DESC);
  END IF;

  IF to_regclass('break_sessions_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_break_sessions_history_tenant_date
      ON break_sessions_history(tenant_id, employee_id, date DESC, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_break_sessions_history_archive
      ON break_sessions_history(archived_at DESC);
  END IF;

  IF to_regclass('approval_requests_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_approval_requests_history_tenant_created
      ON approval_requests_history(tenant_id, created_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_history_archive
      ON approval_requests_history(archived_at DESC);
  END IF;

  IF to_regclass('report_export_logs_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_report_export_logs_history_tenant_exported
      ON report_export_logs_history(tenant_id, exported_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_report_export_logs_history_archive
      ON report_export_logs_history(archived_at DESC);
  END IF;
END $$;

INSERT INTO enterprise_partition_plans (
  table_name, partition_key, retain_hot_months, precreate_months_ahead,
  proposed_parent_table, proposed_default_partition, validation_query,
  rollback_notes, notes
) VALUES
  (
    'attendance_records', 'date', 24, 6,
    'attendance_records_partitioned', 'attendance_records_default',
    'Verify every query has tenant_id and bounded date filters before cutover; preserve UNIQUE(tenant_id, employee_id, date) on partitioned parent.',
    'Keep attendance_records as source of truth until dual-write/backfill validation passes; rename tables only during a planned lock window.',
    'Monthly range partitions by attendance date. Backfill one month at a time, create local indexes matching migration 157, then cut over after counts/checksums match.'
  ),
  (
    'audit_logs', 'created_at', 18, 6,
    'audit_logs_partitioned', 'audit_logs_default',
    'Verify audit feeds and exports include created_at bounds for pruning where possible.',
    'Keep audit_logs append-only until partitioned parent is ready; route writers after validation.',
    'Monthly range partitions by created_at for append-heavy immutable audit data.'
  ),
  (
    'notifications', 'created_at', 6, 3,
    'notifications_partitioned', 'notifications_default',
    'Confirm unread and active notification queries remain tenant/user scoped.',
    'Use cleanup/archive policy before considering partition cutover.',
    'Monthly range partitions are optional; cleanup plus partial indexes may be enough for many deployments.'
  ),
  (
    'break_sessions', 'date', 24, 6,
    'break_sessions_partitioned', 'break_sessions_default',
    'Partition only after attendance_records strategy is active because break_sessions references attendance records.',
    'Keep as a regular table until attendance partition keys and FK strategy are finalized.',
    'Align monthly partitions with attendance_records by break date.'
  ),
  (
    'approval_requests', 'created_at', 36, 3,
    'approval_requests_partitioned', 'approval_requests_default',
    'Validate open approval inbox queries remain on the hot table/window.',
    'Archive resolved rows first; partition only if table growth remains high.',
    'Potential monthly partition candidate for large approval-heavy organizations.'
  ),
  (
    'report_export_logs', 'exported_at', 12, 3,
    'report_export_logs_partitioned', 'report_export_logs_default',
    'Validate export audit queries use exported_at ranges.',
    'Archive old export metadata before partitioning.',
    'Monthly partition candidate for high report/export volume.'
  )
ON CONFLICT (table_name) DO UPDATE SET
  partition_key = EXCLUDED.partition_key,
  retain_hot_months = EXCLUDED.retain_hot_months,
  precreate_months_ahead = EXCLUDED.precreate_months_ahead,
  proposed_parent_table = EXCLUDED.proposed_parent_table,
  proposed_default_partition = EXCLUDED.proposed_default_partition,
  validation_query = EXCLUDED.validation_query,
  rollback_notes = EXCLUDED.rollback_notes,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO enterprise_retention_policies (
  table_name, time_column, hot_retention_months, archive_after_months,
  hard_delete_after_months, cleanup_batch_size, max_runtime_seconds, strategy, notes
) VALUES
  (
    'attendance_records', 'date', 24, 24, 120, 10000, 600,
    'Archive closed attendance rows to attendance_records_history by tenant and month; never archive current/open break records.',
    'Keep at least two years hot for reports/payroll. Archive by month after payroll locks and statutory windows are verified.'
  ),
  (
    'audit_logs', 'created_at', 18, 18, NULL, 20000, 900,
    'Archive immutable audit rows to audit_logs_history by tenant and month; prefer indefinite archive unless customer contract specifies deletion.',
    'Large append-only audit data should be archived, compressed at storage level if available, and retained for compliance.'
  ),
  (
    'notifications', 'created_at', 6, 6, 24, 20000, 300,
    'Archive read or inactive notifications first; delete only archived records past hard retention and outside legal hold.',
    'Unread active notifications must stay hot regardless of age until product rules explicitly change.'
  ),
  (
    'break_sessions', 'date', 24, 24, 120, 10000, 600,
    'Archive completed break sessions with their attendance month; never archive active sessions.',
    'Break sessions should follow attendance retention because payroll and attendance audits can reference them.'
  ),
  (
    'approval_requests', 'created_at', 36, 36, 120, 5000, 600,
    'Archive resolved approval requests; keep pending, under_review, and escalated requests hot.',
    'Resolved approvals remain useful for audit/reporting but can leave the hot table after the retention window.'
  ),
  (
    'report_export_logs', 'exported_at', 12, 12, 60, 10000, 300,
    'Archive export logs after one year; hard delete old export metadata only after compliance review.',
    'Export logs can grow quickly in enterprise reporting workflows.'
  )
ON CONFLICT (table_name) DO UPDATE SET
  time_column = EXCLUDED.time_column,
  hot_retention_months = EXCLUDED.hot_retention_months,
  archive_after_months = EXCLUDED.archive_after_months,
  hard_delete_after_months = EXCLUDED.hard_delete_after_months,
  cleanup_batch_size = EXCLUDED.cleanup_batch_size,
  max_runtime_seconds = EXCLUDED.max_runtime_seconds,
  strategy = EXCLUDED.strategy,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO enterprise_maintenance_jobs (
  job_name, job_type, target_table, recommended_schedule, advisory_lock_key, sql_template, notes
) VALUES
  (
    'precreate_monthly_partition_windows', 'partition_create', NULL,
    'Monthly on the 25th at off-peak hours', 160001,
    'Populate enterprise_partition_windows for the next N months; create physical partitions only after the table has been cut over to partitioned storage.',
    'Planning job only until partition cutover is approved.'
  ),
  (
    'archive_attendance_records', 'archive', 'attendance_records',
    'Daily off-peak, tenant batches ordered by oldest month first', 160002,
    'Move eligible closed rows to attendance_records_history in bounded tenant/month batches, verify counts, then remove archived rows from the hot table in the same controlled batch.',
    'Keep disabled until compliance retention is approved.'
  ),
  (
    'archive_audit_logs', 'archive', 'audit_logs',
    'Daily off-peak, oldest month first', 160003,
    'Copy immutable audit rows to audit_logs_history by tenant/month, verify checksums, then optionally delete only after retention policy allows.',
    'Audit archive should be reviewed with compliance before enabling hard deletes.'
  ),
  (
    'cleanup_notifications', 'cleanup', 'notifications',
    'Hourly or daily depending on notification volume', 160004,
    'Archive read/inactive notifications past policy cutoff in small batches; keep unread active rows hot.',
    'Notification cleanup is disabled by default to preserve current product behavior.'
  ),
  (
    'analyze_high_volume_tables', 'analyze', NULL,
    'Every 15 minutes during business hours and after large imports', 160005,
    'ANALYZE attendance_records, audit_logs, notifications, break_sessions, approval_requests;',
    'Run more frequently after biometric imports and bulk payroll/reporting jobs.'
  ),
  (
    'index_health_review', 'index_maintenance', NULL,
    'Weekly off-peak', 160006,
    'Review pg_stat_user_indexes, duplicate indexes, bloat, and invalid indexes; rebuild only with a separate online maintenance plan.',
    'Use REINDEX CONCURRENTLY manually where supported; do not run blocking index rebuilds during business hours.'
  ),
  (
    'connection_pool_review', 'connection_review', NULL,
    'Weekly and after replica count changes', 160007,
    'Compare backend replica count, DATABASE_POOL_MAX, waiting connections, and database max_connections.',
    'Prefer PgBouncer or provider pooler for many backend replicas.'
  )
ON CONFLICT (job_name) DO UPDATE SET
  job_type = EXCLUDED.job_type,
  target_table = EXCLUDED.target_table,
  recommended_schedule = EXCLUDED.recommended_schedule,
  advisory_lock_key = EXCLUDED.advisory_lock_key,
  sql_template = EXCLUDED.sql_template,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO enterprise_database_recommendations (
  category, target_name, recommendation, rationale, priority, applied_by_migration
) VALUES
  (
    'partitioning', 'attendance_records',
    'Use monthly range partitions on date only after a shadow-table backfill and query-pruning validation.',
    'The current table has a primary key and tenant/employee/date uniqueness that must be preserved during cutover; in-place conversion would require locks and constraint redesign.',
    'critical', false
  ),
  (
    'partitioning', 'audit_logs',
    'Use monthly range partitions on created_at with a default partition for late-arriving rows.',
    'Audit logs are append-heavy and time-scoped; monthly partitions make retention and pruning predictable.',
    'high', false
  ),
  (
    'retention', 'notifications',
    'Keep unread active notifications hot regardless of age; archive read or inactive notifications in bounded batches.',
    'Deleting or hiding unread notifications would change user-visible behavior.',
    'high', false
  ),
  (
    'vacuum', 'attendance_records',
    'Use lower autovacuum scale factors on high-write attendance tables and schedule ANALYZE after bulk imports.',
    'Millions of rows make default scale factors too slow to react to dead tuple and statistics drift.',
    'high', true
  ),
  (
    'vacuum', 'audit_logs',
    'Favor insert-aware autovacuum settings and frequent ANALYZE for append-heavy audit logs.',
    'Fresh statistics help tenant/date feeds avoid sequential scans as volume grows.',
    'high', true
  ),
  (
    'analyze', 'high_volume_tables',
    'Run ANALYZE after monthly archive jobs, historical imports, biometric sync backfills, and partition attachment.',
    'Planner statistics must track tenant/date distribution for composite indexes and future partition pruning.',
    'high', false
  ),
  (
    'connection_efficiency', 'backend_pool',
    'Keep DATABASE_POOL_MAX small per backend replica and use a transaction/session pooler for enterprise replica counts.',
    '1000+ organizations and bursty biometric/report traffic can exhaust database connections before CPU is saturated.',
    'high', false
  ),
  (
    'index_maintenance', 'high_volume_tables',
    'Review duplicate, unused, and bloated indexes weekly using pg_stat_user_indexes and pg_stat_all_tables snapshots.',
    'High write volume makes unnecessary indexes expensive and bloat can hide behind otherwise good query plans.',
    'medium', false
  )
ON CONFLICT (category, target_name, recommendation) DO UPDATE SET
  rationale = EXCLUDED.rationale,
  priority = EXCLUDED.priority,
  applied_by_migration = EXCLUDED.applied_by_migration;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'attendance_records',
    'break_sessions',
    'audit_logs',
    'notifications',
    'approval_requests',
    'report_export_logs'
  ]
  LOOP
    IF to_regclass(target_table) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I SET (
          autovacuum_enabled = true,
          autovacuum_vacuum_scale_factor = 0.02,
          autovacuum_vacuum_threshold = 1000,
          autovacuum_analyze_scale_factor = 0.01,
          autovacuum_analyze_threshold = 1000
        )',
        target_table
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('audit_logs') IS NOT NULL THEN
    ALTER TABLE audit_logs SET (
      autovacuum_vacuum_insert_scale_factor = 0.05,
      autovacuum_vacuum_insert_threshold = 5000
    );
  END IF;

  IF to_regclass('notifications') IS NOT NULL THEN
    ALTER TABLE notifications SET (
      autovacuum_vacuum_scale_factor = 0.05,
      autovacuum_analyze_scale_factor = 0.02
    );
  END IF;
END $$;

COMMENT ON TABLE attendance_records IS
  'High-volume attendance fact table. Prepared for future monthly range partitioning by date via enterprise_partition_plans; this migration does not partition or move data.';

COMMENT ON TABLE audit_logs IS
  'Append-heavy audit fact table. Prepared for future monthly range partitioning by created_at and historical archiving via audit_logs_history; this migration does not partition or move data.';

COMMENT ON TABLE notifications IS
  'High-churn notification table. Retention policy metadata is prepared, but cleanup is disabled by default to preserve current user-visible behavior.';

COMMENT ON TABLE break_sessions IS
  'Attendance-adjacent break sessions table. Future partitioning should follow attendance_records by date after attendance cutover is complete.';
