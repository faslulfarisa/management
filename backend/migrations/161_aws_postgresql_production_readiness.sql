-- 161_aws_postgresql_production_readiness.sql
-- Preparation metadata for Amazon Aurora PostgreSQL / Amazon RDS PostgreSQL.
--
-- Safe migration only:
-- - Does not deploy AWS infrastructure.
-- - Does not change application data.
-- - Records engine/extension/readiness checks for operators.
-- - Attempts optional extension creation, but records action_required instead
--   of failing when RDS/Aurora privileges or parameter groups need DBA action.

CREATE TABLE IF NOT EXISTS aws_postgresql_readiness_checks (
  id BIGSERIAL PRIMARY KEY,
  check_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('ready', 'compatible', 'action_required', 'unsupported', 'unknown')),
  details JSONB NOT NULL DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE aws_postgresql_readiness_checks IS
  'AWS Aurora/RDS PostgreSQL readiness checks captured by migrations. Rows are advisory and do not deploy infrastructure.';

CREATE TABLE IF NOT EXISTS aws_postgresql_deployment_requirements (
  id BIGSERIAL PRIMARY KEY,
  requirement_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  requirement TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  required_before_production BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE aws_postgresql_deployment_requirements IS
  'Operator checklist for Aurora/RDS production deployment readiness. This table is intentionally informational.';

DO $$
DECLARE
  ext_name TEXT;
  ext_status TEXT;
  ext_details JSONB;
BEGIN
  FOREACH ext_name IN ARRAY ARRAY['uuid-ossp', 'pgcrypto', 'pg_stat_statements']
  LOOP
    BEGIN
      EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I', ext_name);
      ext_status := 'ready';
      ext_details := jsonb_build_object(
        'extension', ext_name,
        'installed', true,
        'operator_note', 'Extension exists or was created successfully.'
      );
    EXCEPTION
      WHEN insufficient_privilege THEN
        ext_status := 'action_required';
        ext_details := jsonb_build_object(
          'extension', ext_name,
          'installed', false,
          'operator_note', 'Create this extension with an RDS/Aurora role that has extension privileges.'
        );
      WHEN undefined_file THEN
        ext_status := 'unsupported';
        ext_details := jsonb_build_object(
          'extension', ext_name,
          'installed', false,
          'operator_note', 'This extension is not available for the selected PostgreSQL engine/version.'
        );
      WHEN OTHERS THEN
        ext_status := 'action_required';
        ext_details := jsonb_build_object(
          'extension', ext_name,
          'installed', false,
          'sqlstate', SQLSTATE,
          'error', SQLERRM,
          'operator_note', 'Review engine version, extension allowlist, and parameter group settings.'
        );
    END;

    INSERT INTO aws_postgresql_readiness_checks (check_name, category, status, details)
    VALUES ('extension:' || ext_name, 'extensions', ext_status, ext_details)
    ON CONFLICT (check_name) DO UPDATE SET
      status = EXCLUDED.status,
      details = EXCLUDED.details,
      checked_at = now();
  END LOOP;
END $$;

INSERT INTO aws_postgresql_readiness_checks (check_name, category, status, details)
SELECT
  'postgresql:version',
  'engine',
  CASE WHEN current_setting('server_version_num')::INT >= 130000 THEN 'compatible' ELSE 'unsupported' END,
  jsonb_build_object(
    'server_version', current_setting('server_version'),
    'server_version_num', current_setting('server_version_num')::INT,
    'minimum_project_version', '13',
    'recommended_aws_major_versions', jsonb_build_array('17', '18'),
    'operator_note', 'Use an Aurora/RDS PostgreSQL major version that is currently supported in the target AWS Region.'
  )
ON CONFLICT (check_name) DO UPDATE SET
  status = EXCLUDED.status,
  details = EXCLUDED.details,
  checked_at = now();

INSERT INTO aws_postgresql_readiness_checks (check_name, category, status, details)
SELECT
  'uuid:functions',
  'uuid',
  CASE
    WHEN to_regprocedure('uuid_generate_v4()') IS NOT NULL AND to_regprocedure('gen_random_uuid()') IS NOT NULL THEN 'ready'
    WHEN to_regprocedure('uuid_generate_v4()') IS NOT NULL OR to_regprocedure('gen_random_uuid()') IS NOT NULL THEN 'action_required'
    ELSE 'unsupported'
  END,
  jsonb_build_object(
    'uuid_generate_v4_available', to_regprocedure('uuid_generate_v4()') IS NOT NULL,
    'gen_random_uuid_available', to_regprocedure('gen_random_uuid()') IS NOT NULL,
    'operator_note', 'Existing migrations use both uuid_generate_v4() and gen_random_uuid(); keep uuid-ossp and pgcrypto/core UUID support available.'
  )
ON CONFLICT (check_name) DO UPDATE SET
  status = EXCLUDED.status,
  details = EXCLUDED.details,
  checked_at = now();

INSERT INTO aws_postgresql_readiness_checks (check_name, category, status, details)
SELECT
  'jsonb:compatibility',
  'jsonb',
  'compatible',
  jsonb_build_object(
    'jsonb_available', ('{}'::jsonb IS NOT NULL),
    'operator_note', 'Project migrations and queries rely on JSONB columns and GIN indexes; Aurora/RDS PostgreSQL supports JSONB on supported versions.'
  )
ON CONFLICT (check_name) DO UPDATE SET
  status = EXCLUDED.status,
  details = EXCLUDED.details,
  checked_at = now();

INSERT INTO aws_postgresql_readiness_checks (check_name, category, status, details)
SELECT
  'pg_stat_statements:preload',
  'observability',
  CASE
    WHEN current_setting('shared_preload_libraries', true) ILIKE '%pg_stat_statements%' THEN 'ready'
    ELSE 'action_required'
  END,
  jsonb_build_object(
    'shared_preload_libraries', current_setting('shared_preload_libraries', true),
    'operator_note', 'Enable pg_stat_statements in the RDS/Aurora parameter group and reboot/fail over as AWS requires before relying on query statistics.'
  )
ON CONFLICT (check_name) DO UPDATE SET
  status = EXCLUDED.status,
  details = EXCLUDED.details,
  checked_at = now();

INSERT INTO aws_postgresql_readiness_checks (check_name, category, status, details)
SELECT
  'ssl:server',
  'security',
  CASE WHEN COALESCE(NULLIF(current_setting('ssl', true), ''), 'off') = 'on' THEN 'ready' ELSE 'action_required' END,
  jsonb_build_object(
    'server_ssl', current_setting('ssl', true),
    'operator_note', 'Aurora/RDS PostgreSQL supports SSL/TLS. Production application config should use DATABASE_SSL_MODE=require or verify-full.'
  )
ON CONFLICT (check_name) DO UPDATE SET
  status = EXCLUDED.status,
  details = EXCLUDED.details,
  checked_at = now();

INSERT INTO aws_postgresql_readiness_checks (check_name, category, status, details)
SELECT
  'replication:wal_level',
  'replication',
  CASE
    WHEN current_setting('wal_level', true) IN ('replica', 'logical') THEN 'ready'
    ELSE 'unknown'
  END,
  jsonb_build_object(
    'wal_level', current_setting('wal_level', true),
    'operator_note', 'Read replicas and Multi-AZ are managed by AWS; logical replication requires parameter-group review.'
  )
ON CONFLICT (check_name) DO UPDATE SET
  status = EXCLUDED.status,
  details = EXCLUDED.details,
  checked_at = now();

INSERT INTO aws_postgresql_deployment_requirements (
  requirement_key, category, requirement, recommendation, required_before_production, notes
) VALUES
  (
    'engine-version', 'engine',
    'Use a currently supported Aurora PostgreSQL or RDS PostgreSQL major/minor version in the target AWS Region.',
    'Prefer PostgreSQL 17 or 18 unless another AWS-supported version is mandated by compatibility testing.',
    true,
    'Confirm current regional availability immediately before provisioning.'
  ),
  (
    'extensions', 'extensions',
    'Ensure uuid-ossp, pgcrypto, and pg_stat_statements are available.',
    'Install uuid-ossp and pgcrypto during migrations. Enable pg_stat_statements in the parameter group before production observability cutover.',
    true,
    'pg_stat_statements typically requires shared_preload_libraries and a reboot/failover window.'
  ),
  (
    'ssl', 'security',
    'Use encrypted client connections.',
    'Set DATABASE_SSL_MODE=require for RDS Proxy or verify-full when the runtime has the AWS RDS CA bundle available.',
    true,
    'Do not use DATABASE_SSL_MODE=disable outside local development.'
  ),
  (
    'rds-proxy', 'connection_pooling',
    'Use RDS Proxy or a compatible PostgreSQL pooler for horizontally scaled backend replicas.',
    'Point DATABASE_URL at the RDS Proxy endpoint and keep DATABASE_POOL_MAX small per replica.',
    true,
    'RDS Proxy credentials should be backed by AWS Secrets Manager.'
  ),
  (
    'secrets-manager', 'secrets',
    'Store production database credentials in AWS Secrets Manager.',
    'Inject DATABASE_URL or discrete DB settings from Secrets Manager at runtime; rotate credentials through RDS Proxy where possible.',
    true,
    'Do not commit production database credentials to env files.'
  ),
  (
    'backups-pitr', 'backup',
    'Enable automated backups and point-in-time recovery.',
    'Use AWS automated backups with a retention window aligned to compliance requirements, and test restore into a staging database.',
    true,
    'This is configured in AWS, not by application migrations.'
  ),
  (
    'multi-az', 'availability',
    'Use Multi-AZ for production.',
    'Use Aurora cluster writer/reader endpoints or RDS Multi-AZ deployment depending on selected engine.',
    true,
    'Application code should connect through stable endpoints, preferably RDS Proxy for write traffic.'
  ),
  (
    'read-replicas', 'scaling',
    'Prepare read replicas for reporting and export workloads.',
    'Keep read-only reporting endpoints separate from the primary DATABASE_URL before routing traffic.',
    false,
    'No application routing change is made by this migration.'
  ),
  (
    'migration-runner', 'migrations',
    'Run migrations from a controlled task with SSL enabled and extension-capable credentials.',
    'Use npm run db:migrate from a one-off ECS task, CI job, or bastion with DATABASE_SSL_MODE=require or verify-full.',
    true,
    'Concurrent-index migrations intentionally run outside a transaction in the existing runner.'
  )
ON CONFLICT (requirement_key) DO UPDATE SET
  category = EXCLUDED.category,
  requirement = EXCLUDED.requirement,
  recommendation = EXCLUDED.recommendation,
  required_before_production = EXCLUDED.required_before_production,
  notes = EXCLUDED.notes,
  updated_at = now();
