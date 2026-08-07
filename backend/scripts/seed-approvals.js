/**
 * Approval system seed: creates approval chains, branch_user_access,
 * and sample pending requests (leave, expense, reimbursement) so the
 * approval inbox can be tested end-to-end.
 *
 * Usage:  node scripts/seed-approvals.js
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── IDs pulled from existing data ──────────────────────────────────────────
const TENANT_ID   = '05cb23d9-16b7-4dde-8523-9f0e90f4bd5e'; // Demo Hotel Group
const BRANCH_ID   = 'fde64ce3-4be6-4dde-82b2-513104bf4102'; // Grand Palace Hotel
const BRANCH2_ID  = '9bcf2f47-4ae9-44d0-9926-dc9dd062c208'; // Royal Banquet Hall
const ADMIN_USER  = 'be26269c-8966-4de4-a126-d8b104b76b14'; // admin@demo.com

// Employees at Grand Palace Hotel
const EMP1 = '06d7dc5f-7578-4b77-9ff3-27b4ef35b37b'; // Aarav Sharma
const EMP2 = 'f3411fa6-50f2-4211-87f0-908cdeb42d6a'; // Priya Patel
const EMP3 = 'a4dfbd40-b37e-4b54-ac5e-ae31d0076c5d'; // Neha Reddy
const EMP4 = 'f5f41e2e-208c-4860-b385-131322cb2ed9'; // Rahul Verma

// Leave type IDs
const CASUAL_LT    = '6005a6f1-0af1-4aeb-a82b-380eced393cf';
const SICK_LT      = '09d8f2cd-0e0c-48ca-8de0-1e2f770911ae';
const PRIVILEGE_LT = '3bd27054-0957-40d2-9a43-0b834b51f037';

// ── Helpers ────────────────────────────────────────────────────────────────
function uuid() {
  return require('crypto').randomUUID();
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

async function upsert(client, table, conflictCol, row) {
  const keys   = Object.keys(row);
  const values = Object.values(row);
  const cols   = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders})
     ON CONFLICT (${conflictCol}) DO NOTHING`,
    values,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Branch user access ───────────────────────────────────────────
    console.log('→ Seeding branch_user_access…');

    // Admin user gets org_admin role (unique per tenant+branch+user).
    // The inbox query also checks branch_manager/branch_hr steps,
    // so we use org_admin which the engine treats as bypass.
    await client.query(`
      INSERT INTO branch_user_access (id, tenant_id, branch_id, user_id, role, is_active, created_at)
      VALUES ($1, $2, $3, $4, 'org_admin', true, now())
      ON CONFLICT (tenant_id, branch_id, user_id) DO UPDATE SET role = 'org_admin', is_active = true
    `, [uuid(), TENANT_ID, BRANCH_ID, ADMIN_USER]);

    // Also give access to second branch for cross-branch testing
    await client.query(`
      INSERT INTO branch_user_access (id, tenant_id, branch_id, user_id, role, is_active, created_at)
      VALUES ($1, $2, $3, $4, 'org_admin', true, now())
      ON CONFLICT (tenant_id, branch_id, user_id) DO UPDATE SET role = 'org_admin', is_active = true
    `, [uuid(), TENANT_ID, BRANCH2_ID, ADMIN_USER]);

    console.log('  ✓ branch_user_access');

    // ── 2. Approval chains ──────────────────────────────────────────────
    console.log('→ Seeding branch_approval_chains…');

    // Leave: branch_hr → org_admin (2-step)
    await client.query(`
      INSERT INTO branch_approval_chains
        (id, tenant_id, branch_id, workflow_type, steps, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,'leave',
        '[{"step":1,"role":"branch_hr"},{"step":2,"role":"org_admin"}]',
        true, now(), now())
      ON CONFLICT (tenant_id, branch_id, workflow_type) DO UPDATE
        SET steps = EXCLUDED.steps, is_active = true
    `, [uuid(), TENANT_ID, BRANCH_ID]);

    // Expense: branch_manager → org_admin (2-step)
    await client.query(`
      INSERT INTO branch_approval_chains
        (id, tenant_id, branch_id, workflow_type, steps, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,'expense',
        '[{"step":1,"role":"branch_manager"},{"step":2,"role":"org_admin"}]',
        true, now(), now())
      ON CONFLICT (tenant_id, branch_id, workflow_type) DO UPDATE
        SET steps = EXCLUDED.steps, is_active = true
    `, [uuid(), TENANT_ID, BRANCH_ID]);

    // Reimbursement: branch_hr → org_admin (2-step)
    await client.query(`
      INSERT INTO branch_approval_chains
        (id, tenant_id, branch_id, workflow_type, steps, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,'reimbursement',
        '[{"step":1,"role":"branch_hr"},{"step":2,"role":"org_admin"}]',
        true, now(), now())
      ON CONFLICT (tenant_id, branch_id, workflow_type) DO UPDATE
        SET steps = EXCLUDED.steps, is_active = true
    `, [uuid(), TENANT_ID, BRANCH_ID]);

    // Attendance correction: branch_manager only (1-step)
    await client.query(`
      INSERT INTO branch_approval_chains
        (id, tenant_id, branch_id, workflow_type, steps, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,'attendance_correction',
        '[{"step":1,"role":"branch_manager"}]',
        true, now(), now())
      ON CONFLICT (tenant_id, branch_id, workflow_type) DO UPDATE
        SET steps = EXCLUDED.steps, is_active = true
    `, [uuid(), TENANT_ID, BRANCH_ID]);

    // Expense chain also for branch 2
    await client.query(`
      INSERT INTO branch_approval_chains
        (id, tenant_id, branch_id, workflow_type, steps, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,'expense',
        '[{"step":1,"role":"org_admin"}]',
        true, now(), now())
      ON CONFLICT (tenant_id, branch_id, workflow_type) DO UPDATE
        SET steps = EXCLUDED.steps, is_active = true
    `, [uuid(), TENANT_ID, BRANCH2_ID]);

    console.log('  ✓ branch_approval_chains');

    // ── 3. Leave requests + approval_requests ───────────────────────────
    console.log('→ Seeding leave requests…');

    const leaveSeeds = [
      { emp: EMP1, name: 'Aarav Sharma',  lt: CASUAL_LT,    ltName: 'Casual Leave',    start: daysFromNow(5),  end: daysFromNow(7),   days: 3,  reason: 'Family function and travel', priority: 'normal' },
      { emp: EMP2, name: 'Priya Patel',   lt: SICK_LT,      ltName: 'Sick Leave',       start: daysFromNow(2),  end: daysFromNow(3),   days: 2,  reason: 'Fever and doctor appointment',  priority: 'high' },
      { emp: EMP3, name: 'Neha Reddy',    lt: PRIVILEGE_LT, ltName: 'Privilege Leave',  start: daysFromNow(10), end: daysFromNow(14),  days: 5,  reason: 'Annual vacation planned in advance', priority: 'normal' },
      { emp: EMP4, name: 'Rahul Verma',   lt: CASUAL_LT,    ltName: 'Casual Leave',     start: daysFromNow(1),  end: daysFromNow(1),   days: 1,  reason: 'Personal errand', priority: 'urgent' },
    ];

    for (const s of leaveSeeds) {
      const leaveId = uuid();
      const arId    = uuid();
      const due     = new Date();
      due.setHours(due.getHours() + 48);

      await client.query(`
        INSERT INTO leave_requests
          (id, tenant_id, employee_id, leave_type_id, start_date, end_date, days,
           reason, status, approval_step, approval_log, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',1,'[]'::jsonb, now(), now())
      `, [leaveId, TENANT_ID, s.emp, s.lt, s.start, s.end, s.days, s.reason]);

      await client.query(`
        INSERT INTO approval_requests
          (id, tenant_id, workflow_type, entity_id, entity_table, submitted_by,
           branch_id, title, description, current_step, total_steps,
           status, priority, sla_hours, due_at, approval_log, metadata, created_at, updated_at)
        VALUES ($1,$2,'leave',$3,'leave_requests',$4,$5,$6,$7,1,2,
                'pending',$8,48,$9,'[]'::jsonb,
                $10::jsonb, now(), now())
      `, [
        arId, TENANT_ID, leaveId, ADMIN_USER, BRANCH_ID,
        `Leave: ${s.name} — ${s.ltName} (${s.days} day${s.days>1?'s':''})`,
        `${s.start} to ${s.end} · Reason: ${s.reason}`,
        s.priority,
        due.toISOString(),
        JSON.stringify({ employee_name: s.name, leave_type: s.ltName, days: s.days, employee_id: s.emp }),
      ]);

      console.log(`  ✓ Leave: ${s.name}`);
    }

    // ── 4. Expenses + approval_requests ────────────────────────────────
    console.log('→ Seeding expenses…');

    const expenseSeeds = [
      { emp: EMP1, name: 'Aarav Sharma',  cat: 'travel',       amount: 4500,  desc: 'Cab fare for client visit — Bengaluru airport',  priority: 'normal' },
      { emp: EMP2, name: 'Priya Patel',   cat: 'food',          amount: 1200,  desc: 'Team lunch — Q2 planning meet',                  priority: 'normal' },
      { emp: EMP3, name: 'Neha Reddy',    cat: 'accommodation', amount: 8750,  desc: 'Hotel stay — 2 nights for conference',            priority: 'high' },
    ];

    for (const s of expenseSeeds) {
      const expId = uuid();
      const arId  = uuid();
      const due   = new Date();
      due.setHours(due.getHours() + 24);

      await client.query(`
        INSERT INTO expenses
          (id, tenant_id, employee_id, category, amount, currency, date,
           description, status, branch_id, approval_step, approval_log, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'INR',now(),$6,'pending',$7,1,'[]'::jsonb,now(),now())
      `, [expId, TENANT_ID, s.emp, s.cat, s.amount, s.desc, BRANCH_ID]);

      await client.query(`
        INSERT INTO approval_requests
          (id, tenant_id, workflow_type, entity_id, entity_table, submitted_by,
           branch_id, title, description, current_step, total_steps,
           status, priority, sla_hours, due_at, approval_log, metadata, created_at, updated_at)
        VALUES ($1,$2,'expense',$3,'expenses',$4,$5,$6,$7,1,2,
                'pending',$8,24,$9,'[]'::jsonb,$10::jsonb,now(),now())
      `, [
        arId, TENANT_ID, expId, ADMIN_USER, BRANCH_ID,
        `Expense: ${s.name} — ${s.cat} ₹${s.amount.toLocaleString('en-IN')}`,
        s.desc,
        s.priority,
        due.toISOString(),
        JSON.stringify({ employee_name: s.name, category: s.cat, amount: s.amount }),
      ]);

      console.log(`  ✓ Expense: ${s.name} (${s.cat})`);
    }

    // ── 5. Reimbursements + approval_requests ──────────────────────────
    console.log('→ Seeding reimbursements…');

    const reimbSeeds = [
      { emp: EMP4, name: 'Rahul Verma', cat: 'travel',   amount: 3200, desc: 'Train tickets — Mumbai–Pune return',     claim: 'RMB-2026-001', priority: 'normal' },
      { emp: EMP1, name: 'Aarav Sharma', cat: 'supplies', amount: 980,  desc: 'Office stationery — notepads and pens', claim: 'RMB-2026-002', priority: 'low' },
    ];

    for (const s of reimbSeeds) {
      const reimbId = uuid();
      const arId    = uuid();
      const due     = new Date();
      due.setHours(due.getHours() + 72);

      await client.query(`
        INSERT INTO reimbursements
          (id, tenant_id, employee_id, claim_number, category, amount, currency,
           expense_date, description, status, branch_id, approval_step, approval_log, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'INR',now(),$7,'pending',$8,1,'[]'::jsonb,now(),now())
      `, [reimbId, TENANT_ID, s.emp, s.claim, s.cat, s.amount, s.desc, BRANCH_ID]);

      await client.query(`
        INSERT INTO approval_requests
          (id, tenant_id, workflow_type, entity_id, entity_table, submitted_by,
           branch_id, title, description, current_step, total_steps,
           status, priority, sla_hours, due_at, approval_log, metadata, created_at, updated_at)
        VALUES ($1,$2,'reimbursement',$3,'reimbursements',$4,$5,$6,$7,1,2,
                'pending',$8,72,$9,'[]'::jsonb,$10::jsonb,now(),now())
      `, [
        arId, TENANT_ID, reimbId, ADMIN_USER, BRANCH_ID,
        `Reimbursement: ${s.name} — ${s.claim} ₹${s.amount.toLocaleString('en-IN')}`,
        s.desc,
        s.priority,
        due.toISOString(),
        JSON.stringify({ employee_name: s.name, claim_number: s.claim, category: s.cat, amount: s.amount }),
      ]);

      console.log(`  ✓ Reimbursement: ${s.name} (${s.claim})`);
    }

    // ── 6. One already-approved leave (for submitted / history view) ────
    console.log('→ Seeding one approved leave for history…');
    {
      const leaveId = uuid();
      const arId    = uuid();
      const log = JSON.stringify([
        { step: 1, actor_id: ADMIN_USER, action: 'approved', reason: 'Approved as per policy', role: 'branch_hr',  timestamp: new Date(Date.now() - 3600_000).toISOString() },
        { step: 2, actor_id: ADMIN_USER, action: 'approved', reason: 'Final approval granted',  role: 'org_admin', timestamp: new Date(Date.now() - 1800_000).toISOString() },
      ]);

      await client.query(`
        INSERT INTO leave_requests
          (id, tenant_id, employee_id, leave_type_id, start_date, end_date, days,
           reason, status, approved_by, approved_at, approval_step, approval_log, approval_reason, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,3,
                'Approved leave for testing history view',
                'approved',$7,now(),2,$8::jsonb,'Approved as per policy',now() - interval '2 hours',now())
      `, [leaveId, TENANT_ID, EMP2, SICK_LT, daysFromNow(-3), daysFromNow(-1), ADMIN_USER, log]);

      await client.query(`
        INSERT INTO approval_requests
          (id, tenant_id, workflow_type, entity_id, entity_table, submitted_by,
           branch_id, title, current_step, total_steps, status, priority, sla_hours,
           approval_log, metadata, created_at, updated_at, resolved_at)
        VALUES ($1,$2,'leave',$3,'leave_requests',$4,$5,
                'Leave: Priya Patel — Sick Leave (3 days)',
                2,2,'approved','normal',48,
                $6::jsonb,
                '{"employee_name":"Priya Patel","leave_type":"Sick Leave","days":3}'::jsonb,
                now() - interval '2 hours', now(), now())
      `, [arId, TENANT_ID, leaveId, ADMIN_USER, BRANCH_ID, log]);

      console.log('  ✓ Approved leave (Priya Patel — history)');
    }

    // ── 7. One rejected expense ─────────────────────────────────────────
    {
      const expId = uuid();
      const arId  = uuid();
      const log = JSON.stringify([
        { step: 1, actor_id: ADMIN_USER, action: 'rejected', reason: 'Receipt not attached — please resubmit with proof', role: 'branch_manager', timestamp: new Date(Date.now() - 7200_000).toISOString() },
      ]);

      await client.query(`
        INSERT INTO expenses
          (id, tenant_id, employee_id, category, amount, currency, date,
           description, status, branch_id, approved_by, approved_at,
           approval_step, approval_log, approval_reason, created_at, updated_at)
        VALUES ($1,$2,$3,'marketing',15000,'INR',now(),
                'Digital ads spend — Google Ads Q2',
                'rejected',$4,$5,now(),1,$6::jsonb,
                'Receipt not attached — please resubmit with proof',
                now() - interval '3 hours', now())
      `, [expId, TENANT_ID, EMP4, BRANCH_ID, ADMIN_USER, log]);

      await client.query(`
        INSERT INTO approval_requests
          (id, tenant_id, workflow_type, entity_id, entity_table, submitted_by,
           branch_id, title, description, current_step, total_steps,
           status, priority, sla_hours, rejection_reason,
           approval_log, metadata, created_at, updated_at, resolved_at)
        VALUES ($1,$2,'expense',$3,'expenses',$4,$5,
                'Expense: Rahul Verma — marketing ₹15,000',
                'Digital ads spend — Google Ads Q2',
                1,2,'rejected','high',24,
                'Receipt not attached — please resubmit with proof',
                $6::jsonb,
                '{"employee_name":"Rahul Verma","category":"marketing","amount":15000}'::jsonb,
                now() - interval '3 hours', now(), now())
      `, [arId, TENANT_ID, expId, ADMIN_USER, BRANCH_ID, log]);

      console.log('  ✓ Rejected expense (Rahul Verma — history)');
    }

    await client.query('COMMIT');
    console.log('\n✅ Seed complete. Summary:');
    console.log('   4 pending leave requests');
    console.log('   3 pending expense claims');
    console.log('   2 pending reimbursements');
    console.log('   1 approved leave (history)');
    console.log('   1 rejected expense (history)');
    console.log('\n   Login as admin@demo.com → Approvals inbox should show 9 pending items');
    console.log('   (4 leaves at step 1 matching branch_hr, 3 expenses at step 1 matching branch_manager, 2 reimbs at step 1 matching branch_hr)');
    console.log('   Since admin has all three roles, all 9 will appear in inbox.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
