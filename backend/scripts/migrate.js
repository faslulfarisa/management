require('dotenv').config({ path: __dirname + '/../.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
        process.exit(1);
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
        process.exit(1);
      }
    }
  }

  console.log('All migrations applied');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
