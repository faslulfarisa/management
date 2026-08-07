# AI-HRMS Production Database Readiness Report

Generated: 2026-07-14

Scope: PostgreSQL schema, migrations, constraints, indexes, tenant isolation, high-volume tables, domain integrity, connection pooling, AWS Aurora/RDS readiness, and production validation tooling.

## Executive Status

Status: Prepared, not live-certified.

The project now includes production validation tooling, AWS readiness metadata, enterprise-scale archive/partition planning, multi-currency schema support, performance indexes, security hardening, and a safer migration runner. The backend builds successfully.

Live data certification is blocked because the configured `DATABASE_URL` rejected `psql` authentication before any read-only validation query could run. No live database changes were made by this audit.

## Validation Performed

- Reviewed migration ordering and migration runner behavior.
- Reviewed schema hardening migrations `155` through `161`.
- Reviewed high-volume domains: attendance, audit logs, notifications, approval requests, payroll, finance, recruitment, biometrics, scheduling.
- Verified backend compilation with `npm run build --workspace=backend`.
- Verified `backend/scripts/migrate.js` syntax with `node --check`.
- Added read-only validation pack: `backend/scripts/production-db-validation.sql`.
- Attempted live read-only validation with `psql`; blocked by database authentication/user-info format.
- Refreshed AWS Aurora/RDS PostgreSQL extension/version expectations from current AWS documentation.

## Critical Issues

1. Live production data validation is not complete.
   - Evidence: `psql` connection to the configured database failed with `EINVALIDUSERINFO` before validation SQL could run.
   - Impact: Cannot certify live foreign-key health, orphan counts, duplicate attendance rows, invalid indexes, dead tuple pressure, or live AWS extension state.
   - Required action: Fix production/staging `DATABASE_URL` or provide AWS/RDS credentials, then run:

```text
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/production-db-validation.sql
```

2. Production must apply the pending hardening/readiness migrations before AWS cutover.
   - Relevant migrations: `155_database_architecture_cleanup.sql` through `161_aws_postgresql_production_readiness.sql`.
   - Impact if not applied: missing FK cleanup, security metadata, performance indexes, payroll schema flexibility, currency snapshots, enterprise retention scaffolding, and AWS readiness checks.
   - Required action: Run migrations through the controlled runner after validating credentials and SSL.

## High Issues

1. Database-level tenant isolation is prepared but not enabled.
   - Evidence: migration `156` creates RLS policies and `app_security.current_tenant_id()`, but intentionally does not enable RLS.
   - Impact: Current tenant isolation remains primarily application-enforced. A query bug can still cross tenant boundaries unless every path is correctly scoped.
   - Recommendation: Add DB session tenant context support in the backend, validate all request paths, then enable RLS table-by-table in a separate rollout.

2. Migration numeric prefixes are duplicated.
   - Duplicates found: `065`, `092`, `140`, `141`, `142`, `143`, `146`.
   - Impact: Filename sorting is deterministic, but duplicate sequence numbers weaken auditability and release review.
   - Recommendation: Keep already-applied filenames immutable, but enforce unique numeric prefixes for all new migrations.

3. At least one constraint is intentionally `NOT VALID`.
   - Evidence: `151_approval_workflow_registry_guard.sql` adds a workflow-type guard as `NOT VALID`.
   - Impact: Existing invalid rows would remain possible until validation runs.
   - Recommendation: Run the validation pack, clean any invalid workflow rows, then validate the constraint in a dedicated migration.

4. RDS/Aurora observability requires parameter-group action.
   - Evidence: `pg_stat_statements` can require `shared_preload_libraries`.
   - Impact: Query plan and slow-query analysis will be weaker if the extension is installed but not preloaded.
   - Recommendation: Enable `pg_stat_statements` in the AWS parameter group before production cutover.

## Medium Issues

1. Some list endpoints still use offset pagination or unbounded `SELECT *`.
   - Examples observed in billing, notifications, integrations, and report/export-style reads.
   - Impact: Large tables can suffer latency growth and unnecessary row materialization.
   - Recommendation: Continue moving high-volume APIs to keyset pagination and explicit column lists.

2. Concurrent-index migrations are necessarily non-transactional.
   - Mitigation added: migration runner now uses a PostgreSQL advisory lock to prevent concurrent runners.
   - Residual risk: A failed concurrent-index migration can partially apply indexes before failing, as PostgreSQL requires those statements outside a transaction.
   - Recommendation: Run migrations once per deployment and inspect `schema_migrations` plus invalid indexes after failure.

3. RLS rollout requires pool/session discipline.
   - Impact: With RDS Proxy or pooled sessions, tenant settings must be set and reset for every transaction/request.
   - Recommendation: Use `SET LOCAL` inside transactions or guarded session initialization before enabling RLS.

4. Archive/partition strategy is prepared but not active.
   - Evidence: migration `160` creates plans/history tables, not live partitions.
   - Impact: Millions of attendance/audit rows are supported by indexes now, but physical partition pruning is not yet active.
   - Recommendation: Use the staged cutover plan after production query windows and retention rules are approved.

## Low Issues

1. `.env.example` now includes AWS knobs, but production still needs secret injection wiring from AWS Secrets Manager/ECS/EKS.
2. The validation pack reports manual-review rows for approval entities because entity tables vary by workflow.
3. Duplicate or unused indexes can only be confirmed against live `pg_stat_user_indexes` after representative traffic.

## Readiness By Domain

- Schema consistency: Prepared. Validation pack checks invalid constraints, invalid indexes, duplicate indexes, missing FK child indexes, duplicate migration prefixes.
- Foreign keys: Improved by migration `155`; live validation required for final certification.
- Indexes/performance: Improved by migration `157`; validation pack checks invalid/duplicate indexes and dead tuple pressure.
- Unique constraints: Existing attendance uniqueness and payroll/finance uniqueness remain intact; validation pack checks duplicate attendance employee-day rows.
- Tenant isolation: App-level isolation exists; DB-level policies are prepared but RLS is not enabled yet.
- Security: Migrations add app security schema, sensitive-column comments, blind indexes, and AWS SSL/pool config.
- Payroll: Component schema and currency snapshots are prepared; validation pack checks payslip totals and payroll payment/payslip consistency.
- Attendance: High-volume indexes, retention/partition planning, and duplicate/open-break checks are prepared.
- Recruitment: Validation pack checks application/candidate/vacancy tenant consistency.
- Finance: Multi-currency snapshots and invoice/vendor bill total checks are prepared.
- Notifications: Feed indexes and cleanup strategy are prepared; validation pack checks active unread rows without users.
- Audit logs: High-volume indexes, archive planning, AWS readiness checks, and volume checks are prepared.
- Approval engine: Workflow registry guard exists but requires live validation of `NOT VALID` constraint.
- Biometrics: Attendance ingest indexes and sync failure checks are prepared.
- Scheduling: Shift/attendance indexes and retention planning are prepared.
- Connection pools: Backend and migration runner now support AWS SSL settings, RDS Proxy-friendly pool sizing, keepalive, and application names.
- Migration ordering: Runner uses advisory lock; duplicate numeric prefixes remain an audit concern.
- AWS deployment: Prepared for Aurora/RDS PostgreSQL with extension checks, SSL mode, RDS Proxy, Secrets Manager guidance, backup/PITR guidance, Multi-AZ/read-replica guidance.

## Required Pre-Cutover Checklist

1. Provision Aurora PostgreSQL or RDS PostgreSQL on a currently supported AWS version. Prefer PostgreSQL 17 or 18 after staging compatibility tests.
2. Enable automated backups, PITR, Multi-AZ, deletion protection, and required retention.
3. Configure parameter groups for `pg_stat_statements`.
4. Store DB credentials in AWS Secrets Manager and connect the app through RDS Proxy.
5. Set production DB env:

```text
DATABASE_SSL_MODE=require
DATABASE_POOL_MAX=5
DATABASE_MIGRATION_POOL_MAX=1
DATABASE_APPLICATION_NAME=hrms-backend
DATABASE_TCP_KEEPALIVE=true
```

6. Run migrations once from a controlled deployment task.
7. Run `backend/scripts/production-db-validation.sql`.
8. Resolve every `fail` row and approve every `warn` row.
9. Capture `EXPLAIN (ANALYZE, BUFFERS)` for attendance, payroll, notifications, audit logs, recruitment, and finance list/report queries against production-like data.
10. Only after app session tenant context is implemented, enable RLS in a controlled table-by-table rollout.

## Conclusion

The database project is prepared for AWS production deployment from a schema, migration, and operational-readiness standpoint. Final production certification requires applying the pending migrations to the target AWS database and running the read-only validation pack against real data.
