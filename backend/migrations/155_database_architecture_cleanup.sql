-- 155_database_architecture_cleanup.sql
-- Production hardening pass for schema hygiene only.
-- Safe/data-preserving: no tables are dropped, no business data is deleted.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Standardize UUID primary key defaults on the project's original generator.
DO $$
DECLARE
  column_record RECORD;
BEGIN
  FOR column_record IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'id'
      AND data_type = 'uuid'
      AND (
        column_default IS NULL
        OR column_default NOT ILIKE '%uuid_generate_v4%'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT uuid_generate_v4()',
      column_record.table_schema,
      column_record.table_name,
      column_record.column_name
    );
  END LOOP;
END $$;

-- Standardize timestamp defaults and nullability for audit timestamps.
DO $$
DECLARE
  column_record RECORD;
BEGIN
  FOR column_record IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('created_at', 'updated_at')
      AND data_type IN ('timestamp with time zone', 'timestamp without time zone')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT now()',
      column_record.table_schema,
      column_record.table_name,
      column_record.column_name
    );

    EXECUTE format(
      'UPDATE %I.%I SET %I = now() WHERE %I IS NULL',
      column_record.table_schema,
      column_record.table_name,
      column_record.column_name,
      column_record.column_name
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL',
      column_record.table_schema,
      column_record.table_name,
      column_record.column_name
    );
  END LOOP;
END $$;

-- Replace exact duplicate indexes with standard names.
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant_id
  ON webhooks(tenant_id);

DROP INDEX IF EXISTS idx_wh_tenant;
DROP INDEX IF EXISTS idx_webhooks_tenant;

CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_tenant_employee_created_at
  ON attendance_audit_logs(tenant_id, employee_id, created_at DESC);

DROP INDEX IF EXISTS idx_aal_tenant_emp;
DROP INDEX IF EXISTS idx_audit_emp_created;

-- Add missing leading indexes for all existing foreign keys.
DO $$
DECLARE
  fk_record RECORD;
  index_name TEXT;
  column_list TEXT;
BEGIN
  FOR fk_record IN
    WITH fk AS (
      SELECT
        con.oid,
        con.conname,
        rel.relname AS table_name,
        rel.oid AS table_oid,
        con.conkey,
        array_agg(att.attname ORDER BY cols.ordinality) AS column_names
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
      WHERE con.contype = 'f'
        AND nsp.nspname = 'public'
      GROUP BY con.oid, con.conname, rel.relname, rel.oid, con.conkey
    )
    SELECT fk.*
    FROM fk
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_index idx
      WHERE idx.indrelid = fk.table_oid
        AND idx.indisvalid
        AND idx.indnkeyatts >= array_length(fk.conkey, 1)
        AND idx.indkey[0:array_length(fk.conkey, 1) - 1] = fk.conkey::int2[]
    )
  LOOP
    column_list := array_to_string(
      ARRAY(SELECT format('%I', col) FROM unnest(fk_record.column_names) AS col),
      ', '
    );
    index_name := left(
      'idx_' || fk_record.table_name || '_' || array_to_string(fk_record.column_names, '_') || '_fk',
      55
    ) || '_' || substr(md5(fk_record.table_name || array_to_string(fk_record.column_names, '_')), 1, 7);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(%s)',
      index_name,
      fk_record.table_name,
      column_list
    );
  END LOOP;
END $$;

-- Add high-confidence missing foreign keys. Constraints are added only when
-- existing data is clean; otherwise the migration preserves data and reports a notice.
DO $$
DECLARE
  fk_record RECORD;
  constraint_name TEXT;
  orphan_count BIGINT;
BEGIN
  FOR fk_record IN
    SELECT *
    FROM (VALUES
      ('api_keys', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('applications', 'resume_document_id', 'documents', 'id', 'SET NULL'),
      ('attendance_audit_logs', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('attendance_corrections', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('attendance_logs', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('attendance_records', 'shift_id', 'shift_definitions', 'id', 'SET NULL'),
      ('attendance_records', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('attendance_requests', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('attendance_sessions', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('attendance_terminals', 'branch_id', 'branches', 'id', 'SET NULL'),
      ('audit_logs', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('billing_items', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('biometric_devices', 'branch_id', 'branches', 'id', 'SET NULL'),
      ('biometric_devices', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('biometric_employees', 'hms_employee_id', 'employees', 'id', 'SET NULL'),
      ('biometric_employees', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('biometric_sync_cursors', 'integration_id', 'integrations', 'id', 'CASCADE'),
      ('biometric_sync_cursors', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('biometric_sync_logs', 'integration_id', 'integrations', 'id', 'SET NULL'),
      ('biometric_sync_logs', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('branch_approval_chains', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('break_sessions', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('candidates', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('chart_of_accounts', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('compliance_document_requests', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('compliance_document_versions', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('compliance_documents', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('compliance_filings', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('compliance_policy_acknowledgements', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('compliance_tracker_items', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('cost_centers', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('dashboard_widgets', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('departments', 'cost_center_id', 'cost_centers', 'id', 'SET NULL'),
      ('departments', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('designations', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('device_sync_logs', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('documents', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('employee_documents', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('employee_group_members', 'employee_id', 'employees', 'id', 'CASCADE'),
      ('employee_group_members', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('employee_groups', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('employee_lifecycle_events', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('employees', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('employment_types', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('expenses', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('folio_charges', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('folio_payments', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('gst_invoices', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('gst_returns', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('gst_settings', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('guest_folios', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('historical_attendance_import_staging_rows', 'employee_mapping_id', 'historical_attendance_import_employee_mappings', 'id', 'SET NULL'),
      ('holidays', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('integrations', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('interviews', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('invoice_line_items', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('job_postings', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('journal_entries', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('journal_entry_lines', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('kpi_snapshots', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('kpis', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('kras', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('leave_balances', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('leave_encashment_requests', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('leave_requests', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('leave_types', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('notifications', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('onboarding_tasks', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('overtime_requests', 'branch_id', 'branches', 'id', 'SET NULL'),
      ('overtime_requests', 'department_id', 'departments', 'id', 'SET NULL'),
      ('overtime_requests', 'employee_id', 'employees', 'id', 'CASCADE'),
      ('overtime_requests', 'ot_policy_template_id', 'templates', 'id', 'SET NULL'),
      ('overtime_requests', 'payslip_id', 'payslips', 'id', 'SET NULL'),
      ('overtime_requests', 'shift_id', 'shift_definitions', 'id', 'SET NULL'),
      ('overtime_requests', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('payroll_attendance_summary', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('payroll_attendance_summary_versions', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('payroll_payment_audit', 'actor_id', 'users', 'id', 'SET NULL'),
      ('payroll_payment_audit', 'employee_id', 'employees', 'id', 'CASCADE'),
      ('payroll_payment_audit', 'payslip_id', 'payslips', 'id', 'CASCADE'),
      ('payroll_runs', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('payslip_view_log', 'actor_id', 'users', 'id', 'SET NULL'),
      ('payslips', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('performance_configuration', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('performance_reviews', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('punch_fingerprints', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('reimbursements', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('report_export_logs', 'user_id', 'users', 'id', 'SET NULL'),
      ('review_cycles', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('role_permissions', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('salary_structures', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('service_api_keys', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('shift_assignments', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('shift_definitions', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('shift_override_requests', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('shift_overrides', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('shift_rules', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('shift_schedules', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('sync_logs', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('template_assignment_exclusions', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('template_assignments', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('templates', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('user_roles', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('users', 'employee_id', 'employees', 'id', 'SET NULL'),
      ('vendor_bill_line_items', 'tenant_id', 'tenants', 'id', 'CASCADE'),
      ('webhooks', 'tenant_id', 'tenants', 'id', 'CASCADE')
    ) AS mapping(table_name, column_name, ref_table_name, ref_column_name, delete_action)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = fk_record.table_name
        AND column_name = fk_record.column_name
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = fk_record.ref_table_name
        AND column_name = fk_record.ref_column_name
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f'
        AND nsp.nspname = 'public'
        AND rel.relname = fk_record.table_name
        AND att.attname = fk_record.column_name
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM %I t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I r WHERE r.%I = t.%I)',
      fk_record.table_name,
      fk_record.column_name,
      fk_record.ref_table_name,
      fk_record.ref_column_name,
      fk_record.column_name
    )
    INTO orphan_count;

    IF orphan_count = 0 THEN
      constraint_name := left(
        'fk_' || fk_record.table_name || '_' || fk_record.column_name,
        55
      ) || '_' || substr(md5(fk_record.table_name || fk_record.column_name || fk_record.ref_table_name), 1, 7);

      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE %s',
        fk_record.table_name,
        constraint_name,
        fk_record.column_name,
        fk_record.ref_table_name,
        fk_record.ref_column_name,
        fk_record.delete_action
      );
    ELSE
      RAISE NOTICE 'Skipping FK %.% -> %.% because % orphan row(s) exist',
        fk_record.table_name,
        fk_record.column_name,
        fk_record.ref_table_name,
        fk_record.ref_column_name,
        orphan_count;
    END IF;
  END LOOP;
END $$;

-- Indexes for newly added foreign keys.
DO $$
DECLARE
  fk_record RECORD;
  index_name TEXT;
  column_list TEXT;
BEGIN
  FOR fk_record IN
    WITH fk AS (
      SELECT
        con.oid,
        rel.relname AS table_name,
        rel.oid AS table_oid,
        con.conkey,
        array_agg(att.attname ORDER BY cols.ordinality) AS column_names
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
      WHERE con.contype = 'f'
        AND nsp.nspname = 'public'
      GROUP BY con.oid, rel.relname, rel.oid, con.conkey
    )
    SELECT fk.*
    FROM fk
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_index idx
      WHERE idx.indrelid = fk.table_oid
        AND idx.indisvalid
        AND idx.indnkeyatts >= array_length(fk.conkey, 1)
        AND idx.indkey[0:array_length(fk.conkey, 1) - 1] = fk.conkey::int2[]
    )
  LOOP
    column_list := array_to_string(
      ARRAY(SELECT format('%I', col) FROM unnest(fk_record.column_names) AS col),
      ', '
    );
    index_name := left(
      'idx_' || fk_record.table_name || '_' || array_to_string(fk_record.column_names, '_') || '_fk',
      55
    ) || '_' || substr(md5(fk_record.table_name || array_to_string(fk_record.column_names, '_')), 1, 7);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(%s)',
      index_name,
      fk_record.table_name,
      column_list
    );
  END LOOP;
END $$;

-- Legacy compatibility notes. These objects are retained because they are
-- referenced by backend services or contain production data.
COMMENT ON TABLE properties IS
  'Legacy compatibility table from the hotel/property model. Branches are the current operational unit; keep until property APIs and data are fully retired.';

COMMENT ON COLUMN branches.property_id IS
  'Legacy link to properties for migrated data and compatibility with property-scoped services.';

COMMENT ON TABLE guest_folios IS
  'Legacy hotel billing table retained because it contains data and related folio tables depend on it.';

COMMENT ON TABLE folio_charges IS
  'Legacy hotel billing table retained because guest_folios contains data.';

COMMENT ON TABLE folio_payments IS
  'Legacy hotel billing table retained because guest_folios contains data.';
