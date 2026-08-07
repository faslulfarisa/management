require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Check what the tenant_subscriptions FK actually points to
  const fks = await p.query(`
    SELECT 
      conname,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'tenant_subscriptions' AND c.contype = 'f'
  `);
  console.log('tenant_subscriptions foreign keys:');
  fks.rows.forEach(r => console.log(' -', r.conname, ':', r.definition));

  // Check which tables exist related to plans/subscriptions
  const tables = await p.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'hms_schema' 
    AND tablename LIKE '%plan%' OR tablename LIKE '%subscri%'
    ORDER BY tablename
  `);
  console.log('\nPlan/subscription tables:');
  tables.rows.forEach(r => console.log(' -', r.tablename));

  await p.end();
}

main().catch(e => { console.error(e.message); p.end(); });
