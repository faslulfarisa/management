# AWS PostgreSQL Production Readiness

This project is prepared for Amazon Aurora PostgreSQL or Amazon RDS PostgreSQL, but this document does not deploy AWS infrastructure.

## Target Engine

- Use Aurora PostgreSQL or RDS PostgreSQL on a currently supported AWS engine version in the target Region.
- Recommended major versions for new production deployments: PostgreSQL 17 or 18.
- Minimum project compatibility target: PostgreSQL 13.
- Confirm final engine/minor availability in AWS immediately before provisioning.

## Required Extensions

The migrations use UUID defaults and observability features that require:

- `uuid-ossp`
- `pgcrypto`
- `pg_stat_statements`

Migration `161_aws_postgresql_production_readiness.sql` attempts safe extension creation and records status in `aws_postgresql_readiness_checks`.

For `pg_stat_statements`, configure the DB parameter group:

```text
shared_preload_libraries = 'pg_stat_statements'
```

Apply the parameter group change with the AWS-required reboot or failover window before relying on query statistics.

## Connection Pooling

Use RDS Proxy for production write traffic when backend replicas can scale horizontally.

Recommended environment shape:

```text
DATABASE_URL=postgresql://<user>:<password>@<rds-proxy-endpoint>:5432/<db>
DATABASE_POOL_MAX=5
DATABASE_MIGRATION_POOL_MAX=1
DATABASE_POOL_MAX_LIFETIME_SECONDS=300
DATABASE_TCP_KEEPALIVE=true
DATABASE_APPLICATION_NAME=hrms-backend
```

Keep `DATABASE_POOL_MAX * backend_replica_count` below the RDS Proxy/database connection budget.

## SSL

Use encrypted connections in production:

```text
DATABASE_SSL_MODE=require
```

Use `verify-full` only when the runtime image includes the AWS RDS CA bundle and hostname verification is expected to pass:

```text
DATABASE_SSL_MODE=verify-full
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

Do not use `DATABASE_SSL_MODE=disable` outside local development.

## Secrets

Production credentials should come from AWS Secrets Manager, injected into runtime as `DATABASE_URL` or equivalent discrete settings.

When RDS Proxy is used, associate the proxy with Secrets Manager credentials and rotate through AWS-managed workflows.

## Backups And PITR

Configure in AWS:

- Automated backups enabled.
- Point-in-time recovery window aligned to compliance needs.
- Regular restore test into a non-production database.
- Snapshot retention and copy policy for disaster recovery requirements.

No application migration can prove PITR; treat restore testing as a release gate.

## Availability And Replication

- Use Multi-AZ for production.
- For Aurora, route write traffic through the cluster/proxy writer endpoint.
- Add reader endpoints/read replicas for reporting and export workloads only after read routing is implemented deliberately.
- Do not point write paths at read replicas.

## Migration Execution

Run migrations from a controlled one-off task with production SSL settings:

```text
npm run db:migrate --workspace=backend
```

Use credentials that can create allowed extensions. If extension creation is restricted, pre-create extensions with an RDS/Aurora privileged role, then rerun migrations.

The existing migration runner executes `CREATE INDEX CONCURRENTLY` migrations outside a transaction, which is required by PostgreSQL. Avoid running multiple migration tasks concurrently.

## Verification Query

After migrations, inspect:

```sql
SELECT check_name, category, status, details
FROM aws_postgresql_readiness_checks
ORDER BY category, check_name;
```

Any `action_required` row must be resolved before production cutover.
