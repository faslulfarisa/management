-- production-db-validation.sql
-- Read-only production validation pack for AI-HRMS PostgreSQL.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/production-db-validation.sql
--
-- This file does not mutate data or schema.

\pset pager off
\pset tuples_only off
\pset format aligned

SELECT
  'engine.version' AS check_name,
  'aws' AS category,
  CASE WHEN current_setting('server_version_num')::INT >= 130000 THEN 'pass' ELSE 'fail' END AS status,
  current_setting('server_version') AS detail;

SELECT
  'extensions.required' AS check_name,
  'aws' AS category,
  CASE WHEN COUNT(*) FILTER (WHERE p.installed_version IS NOT NULL) = 3 THEN 'pass' ELSE 'fail' END AS status,
  jsonb_object_agg(req.name, COALESCE(p.installed_version, CASE WHEN p.name IS NULL THEN 'unavailable' ELSE 'missing' END)) AS detail
FROM (VALUES ('uuid-ossp'), ('pgcrypto'), ('pg_stat_statements')) AS req(name)
LEFT JOIN pg_available_extensions p ON p.name = req.name;

SELECT
  'pg_stat_statements.preload' AS check_name,
  'aws' AS category,
  CASE WHEN current_setting('shared_preload_libraries', true) ILIKE '%pg_stat_statements%' THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(current_setting('shared_preload_libraries', true), '') AS detail;

SELECT
  'ssl.server' AS check_name,
  'aws' AS category,
  CASE WHEN COALESCE(current_setting('ssl', true), 'off') = 'on' THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(current_setting('ssl', true), 'unknown') AS detail;

SELECT
  'migrations.duplicate_numeric_prefixes' AS check_name,
  'migrations' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(jsonb_agg(jsonb_build_object('prefix', prefix, 'files', files) ORDER BY prefix), '[]'::jsonb) AS detail
FROM (
  SELECT
    substring(filename from '^([0-9]+)') AS prefix,
    jsonb_agg(filename ORDER BY filename) AS files
  FROM schema_migrations
  WHERE filename ~ '^[0-9]+'
  GROUP BY substring(filename from '^([0-9]+)')
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  'constraints.not_valid' AS check_name,
  'schema' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COALESCE(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'constraint', conname) ORDER BY conrelid::regclass::text, conname), '[]'::jsonb) AS detail
FROM pg_constraint
WHERE NOT convalidated;

SELECT
  'foreign_keys.missing_child_index' AS check_name,
  'performance' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(jsonb_agg(jsonb_build_object(
    'table', table_name,
    'constraint', constraint_name,
    'columns', fk_columns
  ) ORDER BY table_name, constraint_name), '[]'::jsonb) AS detail
FROM (
  SELECT
    c.conrelid::regclass::text AS table_name,
    c.conname AS constraint_name,
    c.conkey AS fk_attnums,
    ARRAY_AGG(a.attname ORDER BY ord.n) AS fk_columns
  FROM pg_constraint c
  JOIN unnest(c.conkey) WITH ORDINALITY AS ord(attnum, n) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ord.attnum
  WHERE c.contype = 'f'
  GROUP BY c.oid, c.conrelid, c.conname, c.conkey
) fk
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_index i
  WHERE i.indrelid = fk.table_name::regclass
    AND i.indisvalid
    AND (
      SELECT ARRAY_AGG(i.indkey[pos]::SMALLINT ORDER BY pos)
      FROM generate_series(0, array_length(fk.fk_attnums, 1) - 1) AS pos
    ) = fk.fk_attnums
);

SELECT
  'indexes.invalid' AS check_name,
  'schema' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COALESCE(jsonb_agg(indexrelid::regclass::text ORDER BY indexrelid::regclass::text), '[]'::jsonb) AS detail
FROM pg_index
WHERE NOT indisvalid OR NOT indisready;

SELECT
  'indexes.duplicates' AS check_name,
  'performance' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(jsonb_agg(jsonb_build_object(
    'table', table_name,
    'definition', normalized_definition,
    'indexes', indexes
  ) ORDER BY table_name), '[]'::jsonb) AS detail
FROM (
  SELECT
    schemaname || '.' || tablename AS table_name,
    regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ON ', 'CREATE INDEX ON ') AS normalized_definition,
    jsonb_agg(indexname ORDER BY indexname) AS indexes
  FROM pg_indexes
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY schemaname, tablename, regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ON ', 'CREATE INDEX ON ')
  HAVING COUNT(*) > 1
) duplicate_indexes;

SELECT
  'tenant_tables.missing_tenant_fk' AS check_name,
  'tenant_isolation' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb) AS detail
FROM (
  SELECT c.table_schema || '.' || c.table_name AS table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name = c.table_name
   AND t.table_type = 'BASE TABLE'
  WHERE c.column_name = 'tenant_id'
    AND c.table_schema = 'public'
    AND c.table_name <> 'tenants'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint pc
      WHERE pc.contype = 'f'
        AND pc.conrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
        AND pc.confrelid = 'tenants'::regclass
    )
) missing_fk;

SELECT
  'rls.tenant_tables_without_rls' AS check_name,
  'tenant_isolation' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(jsonb_agg(relname ORDER BY relname), '[]'::jsonb) AS detail
FROM pg_class cls
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND cls.relkind = 'r'
  AND cls.relname <> 'tenants'
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = ns.nspname
      AND c.table_name = cls.relname
      AND c.column_name = 'tenant_id'
  )
  AND NOT cls.relrowsecurity;

WITH duplicates AS (
  SELECT tenant_id, employee_id, date, COUNT(*) AS rows
  FROM attendance_records
  GROUP BY tenant_id, employee_id, date
  HAVING COUNT(*) > 1
)
SELECT
  'attendance.duplicate_employee_day' AS check_name,
  'attendance' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tenant_id', tenant_id,
      'employee_id', employee_id,
      'date', date,
      'rows', rows
    ) ORDER BY date DESC)
    FROM (
      SELECT *
      FROM duplicates
      ORDER BY date DESC
      LIMIT 50
    ) limited
  ), '[]'::jsonb) AS detail
FROM duplicates;

SELECT
  'attendance.open_break_consistency' AS check_name,
  'attendance' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COUNT(*) AS detail
FROM attendance_records ar
WHERE ar.is_on_break = true
  AND NOT EXISTS (
    SELECT 1
    FROM break_sessions bs
    WHERE bs.id = ar.current_break_session_id
      AND bs.tenant_id = ar.tenant_id
      AND bs.employee_id = ar.employee_id
      AND bs.status = 'active'
  );

SELECT
  'payroll.payslip_totals' AS check_name,
  'payroll' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COUNT(*) AS detail
FROM payslips
WHERE COALESCE(gross_salary, 0) - COALESCE(total_deductions, 0) <> COALESCE(net_salary, 0);

SELECT
  'payroll.payments_without_payslip' AS check_name,
  'payroll' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COUNT(*) AS detail
FROM payroll_payments pp
LEFT JOIN payslips p ON p.id = pp.payslip_id AND p.tenant_id = pp.tenant_id
WHERE pp.payslip_id IS NOT NULL AND p.id IS NULL;

SELECT
  'finance.invoice_totals' AS check_name,
  'finance' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COUNT(*) AS detail
FROM invoices i
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT invoice_id, tenant_id, COALESCE(SUM(amount), 0) AS line_total
    FROM invoice_line_items
    GROUP BY invoice_id, tenant_id
  ) li
  WHERE li.invoice_id = i.id
    AND li.tenant_id = i.tenant_id
    AND ABS(li.line_total - COALESCE(i.subtotal, li.line_total)) > 0.01
);

SELECT
  'finance.vendor_bill_totals' AS check_name,
  'finance' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COUNT(*) AS detail
FROM vendor_bills b
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT bill_id, tenant_id, COALESCE(SUM(amount), 0) AS line_total
    FROM vendor_bill_line_items
    GROUP BY bill_id, tenant_id
  ) li
  WHERE li.bill_id = b.id
    AND li.tenant_id = b.tenant_id
    AND ABS(li.line_total - COALESCE(b.subtotal, li.line_total)) > 0.01
);

SELECT
  'recruitment.application_tenant_consistency' AS check_name,
  'recruitment' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END AS status,
  COUNT(*) AS detail
FROM applications a
LEFT JOIN candidates c ON c.id = a.candidate_id
LEFT JOIN vacancies v ON v.id = a.vacancy_id
WHERE (c.id IS NOT NULL AND c.tenant_id <> a.tenant_id)
   OR (v.id IS NOT NULL AND v.tenant_id <> a.tenant_id);

SELECT
  'notifications.active_unread_indexable' AS check_name,
  'notifications' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COUNT(*) AS detail
FROM notifications
WHERE status = 'active'
  AND is_read = false
  AND user_id IS NULL;

SELECT
  'approval.open_without_entity' AS check_name,
  'approval_engine' AS category,
  'manual_review' AS status,
  COALESCE(jsonb_agg(jsonb_build_object(
    'workflow_type', workflow_type,
    'entity_table', entity_table,
    'rows', rows
  ) ORDER BY rows DESC), '[]'::jsonb) AS detail
FROM (
  SELECT workflow_type, entity_table, COUNT(*) AS rows
  FROM approval_requests
  WHERE status IN ('pending', 'under_review', 'escalated')
  GROUP BY workflow_type, entity_table
) open_requests;

SELECT
  'biometrics.sync_failures_24h' AS check_name,
  'biometrics' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COUNT(*) AS detail
FROM sync_logs
WHERE status = 'failed'
  AND started_at >= now() - interval '24 hours';

SELECT
  'audit.recent_volume_24h' AS check_name,
  'audit_logs' AS category,
  'info' AS status,
  COUNT(*) AS detail
FROM audit_logs
WHERE created_at >= now() - interval '24 hours';

SELECT
  'maintenance.dead_tuple_pressure' AS check_name,
  'performance' AS category,
  CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'warn' END AS status,
  COALESCE(jsonb_agg(jsonb_build_object(
    'table', relname,
    'live', n_live_tup,
    'dead', n_dead_tup
  ) ORDER BY n_dead_tup DESC), '[]'::jsonb) AS detail
FROM pg_stat_user_tables
WHERE n_live_tup > 0
  AND n_dead_tup > GREATEST(10000, n_live_tup * 0.2);
