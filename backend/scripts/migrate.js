require('dotenv').config({ path: __dirname + '/../.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATION_LOCK_KEY = 220946871;

function parsePositiveInt(value, fallback) {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) return undefined;
  try {
    return new URL(process.env.DATABASE_URL);
  } catch {
    return undefined;
  }
}

function isLocalDatabase(url) {
  return !!url && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
}

function getSslConfig(url) {
  const mode = (process.env.DATABASE_SSL_MODE || '').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'require' || mode === 'verify-full') {
    return { rejectUnauthorized: parseBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, mode === 'verify-full') };
  }
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (isLocalDatabase(url)) return false;
  return { rejectUnauthorized: parseBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, false) };
}

// Strip leading/trailing comment lines from a SQL fragment, keeping the SQL body.
function stripLeadingComments(s) {
  return s
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
}

// Split a SQL file into individual statements, preserving all non-comment SQL.
function splitStatements(sql) {
  return sql
    .split(';')
    .map(stripLeadingComments)
    .filter(s => s.length > 0);
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getSslConfig(databaseUrl),
    application_name: process.env.DATABASE_APPLICATION_NAME || 'hrms-migrations',
    keepAlive: parseBoolean(process.env.DATABASE_TCP_KEEPALIVE, true),
    keepAliveInitialDelayMillis: parsePositiveInt(process.env.DATABASE_TCP_KEEPALIVE_INITIAL_DELAY_MS, 10000),
    max: parsePositiveInt(process.env.DATABASE_MIGRATION_POOL_MAX, 1),
    connectionTimeoutMillis: parsePositiveInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS, 5000),
  });

  const migrationLock = await pool.connect();
  try {
    const lock = await migrationLock.query('SELECT pg_try_advisory_lock($1) AS acquired', [MIGRATION_LOCK_KEY]);
    if (!lock.rows[0]?.acquired) {
      throw new Error('Another migration runner is already active');
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    )`);

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (exists.rows.length > 0) {
        console.log(`SKIP: ${file} (already applied)`);
        continue;
      }

      console.log(`APPLY: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // CONCURRENTLY index creation cannot run inside a transaction block.
      // Detect and execute each statement individually without a wrapping transaction.
      const needsNoTransaction = /CREATE INDEX CONCURRENTLY/i.test(sql);

      if (needsNoTransaction) {
        const client = await pool.connect();
        try {
          const statements = splitStatements(sql);
          for (const stmt of statements) {
            await client.query(stmt);
          }
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          console.log(`  (ran ${statements.length} statement(s) outside transaction)`);
        } catch (e) {
          console.error(`FAILED: ${file}`, e.message);
          client.release();
          process.exitCode = 1;
          return;
        }
        client.release();
      } else {
        await pool.query('BEGIN');
        try {
          await pool.query(sql);
          await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          await pool.query('COMMIT');
        } catch (e) {
          await pool.query('ROLLBACK');
          console.error(`FAILED: ${file}`, e.message);
          process.exitCode = 1;
          return;
        }
      }
    }

    console.log('All migrations applied');
  } finally {
    try {
      await migrationLock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      migrationLock.release();
      await pool.end();
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
