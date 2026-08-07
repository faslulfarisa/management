/**
 * seed-departments.ts
 * Inserts a comprehensive hotel department hierarchy for the demo tenant.
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 * Does NOT wipe any other data.
 *
 * Usage:  ts-node scripts/seed-departments.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve tenant
    const { rows: tenants } = await client.query(
      `SELECT id FROM tenants WHERE slug = 'demo-hotel' AND deleted_at IS NULL LIMIT 1`,
    );
    if (!tenants.length) throw new Error("Tenant 'demo-hotel' not found — run db:seed first.");
    const tenantId: string = tenants[0].id;
    console.log(`Tenant: ${tenantId}`);

    /**
     * Helper: upsert a department and return its id.
     * parent_code = null → top-level department.
     */
    const deptMap = new Map<string, string>();

    async function upsert(
      name: string,
      code: string,
      parentCode: string | null = null,
    ): Promise<string> {
      const parentId = parentCode ? deptMap.get(parentCode) ?? null : null;

      // Try insert
      const { rows } = await client.query(
        `INSERT INTO departments (tenant_id, name, code, parent_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [tenantId, name, code, parentId],
      );

      if (rows.length) {
        deptMap.set(code, rows[0].id);
        return rows[0].id;
      }

      // Already exists — fetch and update parent if needed
      const { rows: existing } = await client.query(
        `UPDATE departments
         SET parent_id = COALESCE(parent_id, $3), updated_at = now()
         WHERE tenant_id = $1 AND code = $2 AND deleted_at IS NULL
         RETURNING id`,
        [tenantId, code, parentId],
      );
      const id = existing[0]?.id;
      if (id) deptMap.set(code, id);
      return id;
    }

    console.log('Seeding top-level divisions...');

    // ── TOP-LEVEL DIVISIONS ─────────────────────────────────────────────────
    await upsert('Rooms Division',           'RD');
    await upsert('Food & Beverage Division', 'FBD');
    await upsert('Finance & Accounts',       'FA');
    await upsert('Human Resources',          'HR');
    await upsert('Sales & Marketing',        'SM');
    await upsert('Engineering',              'ENG');
    await upsert('Security',                 'SEC');
    await upsert('Spa & Wellness',           'SPA');

    console.log('Seeding Rooms Division sub-departments...');

    // ── ROOMS DIVISION ──────────────────────────────────────────────────────
    await upsert('Front Office',     'FO',  'RD');
    await upsert('Housekeeping',     'HK',  'RD');
    await upsert('Reservations',     'RES', 'RD');
    await upsert('Concierge',        'CON', 'RD');
    await upsert('Guest Services',   'GS',  'RD');
    await upsert('Bell Desk',        'BLD', 'FO');
    await upsert('Reception',        'RCP', 'FO');
    await upsert('Night Audit',      'NAD', 'FO');
    await upsert('Public Areas',     'PA',  'HK');
    await upsert('Laundry',          'LND', 'HK');

    console.log('Seeding Food & Beverage sub-departments...');

    // ── FOOD & BEVERAGE DIVISION ────────────────────────────────────────────
    await upsert('Kitchen',          'KIT', 'FBD');
    await upsert('Restaurant',       'RST', 'FBD');
    await upsert('Banquet & Events', 'BNQ', 'FBD');
    await upsert('Bar & Lounge',     'BAR', 'FBD');
    await upsert('Room Service',     'RS',  'FBD');
    await upsert('Bakery & Pastry',  'BKY', 'KIT');
    await upsert('Cold Kitchen',     'CKT', 'KIT');
    await upsert('Stewarding',       'STW', 'KIT');

    console.log('Seeding Finance & Accounts sub-departments...');

    // ── FINANCE & ACCOUNTS ──────────────────────────────────────────────────
    await upsert('Accounts Payable',    'AP',  'FA');
    await upsert('Accounts Receivable', 'AR',  'FA');
    await upsert('Payroll',             'PAY', 'FA');
    await upsert('Internal Audit',      'IA',  'FA');
    await upsert('Procurement',         'PRC', 'FA');
    await upsert('Stores & Inventory',  'STR', 'FA');

    console.log('Seeding Human Resources sub-departments...');

    // ── HUMAN RESOURCES ─────────────────────────────────────────────────────
    await upsert('Recruitment',          'RCT', 'HR');
    await upsert('Training & Development','TND', 'HR');
    await upsert('Employee Relations',    'ER',  'HR');
    await upsert('Administration',        'ADM', 'HR');

    console.log('Seeding Sales & Marketing sub-departments...');

    // ── SALES & MARKETING ───────────────────────────────────────────────────
    await upsert('Sales',               'SAL', 'SM');
    await upsert('Marketing & PR',      'MKT', 'SM');
    await upsert('Revenue Management',  'RM',  'SM');
    await upsert('MICE & Events',       'EVM', 'SM');

    console.log('Seeding Engineering sub-departments...');

    // ── ENGINEERING ─────────────────────────────────────────────────────────
    await upsert('Civil & Maintenance', 'CVM', 'ENG');
    await upsert('Electrical',          'ELE', 'ENG');
    await upsert('HVAC & Plumbing',     'HVP', 'ENG');
    await upsert('IT & Systems',        'ITS', 'ENG');

    console.log('Seeding Security sub-departments...');

    // ── SECURITY ────────────────────────────────────────────────────────────
    await upsert('Physical Security',   'PS',   'SEC');
    await upsert('CCTV & Surveillance', 'CCTV', 'SEC');
    await upsert('Fire Safety',         'FS',   'SEC');

    console.log('Seeding Spa & Wellness sub-departments...');

    // ── SPA & WELLNESS ──────────────────────────────────────────────────────
    await upsert('Spa Therapists',  'SPAT', 'SPA');
    await upsert('Fitness & Gym',   'GYM',  'SPA');
    await upsert('Yoga & Wellness', 'YWL',  'SPA');

    await client.query('COMMIT');

    const total = deptMap.size;
    console.log(`\n✓ ${total} departments seeded successfully for tenant demo-hotel.`);
    console.log('Run the departments page to see the full hierarchy.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding departments — rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
