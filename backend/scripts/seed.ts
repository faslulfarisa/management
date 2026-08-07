import 'dotenv/config';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('Seeding database with comprehensive dummy data...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Clean existing transactional and module data (Reverse Dependency Order)
    console.log('Cleaning existing transactional and master data...');
    
    // Auth and core associations
    await client.query('UPDATE users SET employee_id = NULL');
    await client.query('UPDATE departments SET branch_id = NULL, property_id = NULL');
    await client.query('UPDATE employees SET branch_id = NULL, property_id = NULL');

    const tablesToClean = [
      'reimbursements',
      'finance_payments',
      'invoice_line_items',
      'invoices',
      'vendor_bill_line_items',
      'vendor_bills',
      'cashbook_entries',
      'budgets',
      'webhook_deliveries',
      'webhooks',
      'sync_logs',
      'integrations',
      'payment_transactions',
      'subscription_invoices',
      'tenant_subscriptions',
      'subscription_plans',
      'folio_payments',
      'folio_charges',
      'guest_folios',
      'billing_items',
      'notifications',
      'gst_returns',
      'gst_invoices',
      'gst_settings',
      'expenses',
      'journal_entry_lines',
      'journal_entries',
      'chart_of_accounts',
      'final_settlements',
      'exit_clearances',
      'exit_checklist',
      'exit_requests',
      'interviews',
      'candidates',
      'job_postings',
      'payslips',
      'payroll_runs',
      'salary_structures',
      'payroll_attendance_summary_versions',
      'payroll_attendance_summary',
      'leave_requests',
      'leave_balances',
      'leave_types',
      'attendance_requests',
      'attendance_records',
      'shift_schedules',
      'shift_assignments',
      'shift_definitions',
      'employee_documents',
      'onboarding_tasks',
      'employee_lifecycle_events',
      'audit_logs',
      'employee_group_members',
      'employee_groups',
      'employees',
      'cost_centers',
      'holidays',
      'template_assignments',
      'templates',
      'branches',
      'properties'
    ];

    for (const table of tablesToClean) {
      await client.query(`DELETE FROM ${table}`);
    }
    console.log('Database cleaned successfully.');

    // 2. Tenant
    console.log('Seeding tenant...');
    const { rows: tenants } = await client.query(
      "INSERT INTO tenants (name, slug, company_code, timezone, fiscal_year_start) VALUES ('Demo Hotel Group', 'demo-hotel', 'ORGADD', 'Asia/Kolkata', 4) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, company_code = EXCLUDED.company_code RETURNING id",
    );
    const tenantId = tenants[0].id;
    console.log(`Using tenant: Demo Hotel Group (${tenantId})`);

    // 3. Admin user
    console.log('Seeding admin user...');
    
    const adminsToSeed = [
      { email: 'admin@demo.com', password: 'Admin@1234' },
      { email: 'orgadd@test.com', password: 'Org@1234' }
    ];

    const seededAdminIds: string[] = [];

    for (const adminData of adminsToSeed) {
      const passwordHash = await bcrypt.hash(adminData.password, 12);
      const { rows: existingUsers } = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [adminData.email]
      );
      let adminId = existingUsers[0]?.id;
      if (!adminId) {
        const { rows: users } = await client.query(
          'INSERT INTO users (tenant_id, email, password_hash, is_active, is_super_admin) VALUES ($1, $2, $3, true, true) RETURNING id',
          [tenantId, adminData.email, passwordHash],
        );
        adminId = users[0].id;
      } else {
        await client.query(
          'UPDATE users SET is_super_admin = true, password_hash = $2 WHERE id = $1',
          [adminId, passwordHash]
        );
      }

      // Link admin user to tenant in user_tenants
      await client.query(
        'INSERT INTO user_tenants (user_id, tenant_id, is_org_admin) VALUES ($1, $2, true) ON CONFLICT (user_id, tenant_id) DO UPDATE SET is_org_admin = true',
        [adminId, tenantId]
      );
      seededAdminIds.push(adminId);
    }
    
    // Restore adminId for the rest of the script
    const adminId = seededAdminIds[0];

    // 4. Permissions & Roles
    console.log('Seeding permissions and roles...');
    const permissions = [
      { module: 'platform.roles', action: 'view' },
      { module: 'platform.roles', action: 'create' },
      { module: 'platform.roles', action: 'edit' },
      { module: 'platform.roles', action: 'delete' },
      { module: 'platform.users', action: 'view' },
      { module: 'platform.users', action: 'create' },
      { module: 'platform.users', action: 'edit' },
      { module: 'platform.users', action: 'delete' },
      { module: 'platform.templates', action: 'view' },
      { module: 'platform.templates', action: 'create' },
      { module: 'platform.templates', action: 'edit' },
      { module: 'platform.templates', action: 'delete' },
      { module: 'platform.organizations', action: 'view' },
      { module: 'platform.organizations', action: 'create' },
      { module: 'platform.organizations', action: 'edit' },
      { module: 'platform.organizations', action: 'delete' },
      { module: 'hr.employees', action: 'view' },
      { module: 'hr.employees', action: 'create' },
      { module: 'hr.employees', action: 'edit' },
      { module: 'hr.employees', action: 'delete' },
      { module: 'hr.employees', action: 'export' },
      { module: 'hr.attendance', action: 'view' },
      { module: 'hr.attendance', action: 'create' },
      { module: 'hr.attendance', action: 'edit' },
      { module: 'hr.attendance', action: 'approve' },
      { module: 'hr.attendance', action: 'export' },
      { module: 'hr.leave', action: 'view' },
      { module: 'hr.leave', action: 'create' },
      { module: 'hr.leave', action: 'edit' },
      { module: 'hr.leave', action: 'approve' },
      { module: 'hr.leave', action: 'export' },
      { module: 'hr.payroll', action: 'view' },
      { module: 'hr.payroll', action: 'create' },
      { module: 'hr.payroll', action: 'edit' },
      { module: 'hr.payroll', action: 'approve' },
      { module: 'hr.payroll', action: 'export' },
      { module: 'hr.compliance', action: 'view' },
      { module: 'hr.compliance', action: 'create' },
      { module: 'hr.compliance', action: 'export' },
      { module: 'compliance.company_docs', action: 'manage' },
      { module: 'compliance.employee_docs', action: 'manage' },
      { module: 'compliance.employee_docs', action: 'view_own' },
      { module: 'compliance.documents', action: 'approve' },
      { module: 'compliance', action: 'admin' },
      { module: 'compliance.tracker', action: 'manage' },
      { module: 'compliance.policies', action: 'manage' },
      { module: 'compliance.policies', action: 'acknowledge' },
      { module: 'hr.recruitment', action: 'view' },
      { module: 'hr.recruitment', action: 'create' },
      { module: 'hr.recruitment', action: 'edit' },
      { module: 'hr.recruitment', action: 'approve' },
      { module: 'finance.invoices', action: 'view' },
      { module: 'finance.invoices', action: 'create' },
      { module: 'finance.invoices', action: 'edit' },
      { module: 'finance.invoices', action: 'approve' },
      { module: 'finance.invoices', action: 'export' },
      { module: 'finance.bills', action: 'view' },
      { module: 'finance.bills', action: 'create' },
      { module: 'finance.bills', action: 'approve' },
      { module: 'finance.cashbook', action: 'view' },
      { module: 'finance.cashbook', action: 'create' },
      { module: 'finance.budgets', action: 'view' },
      { module: 'finance.budgets', action: 'create' },
      { module: 'finance.budgets', action: 'approve' },
      { module: 'gst.returns', action: 'view' },
      { module: 'gst.returns', action: 'create' },
      { module: 'gst.returns', action: 'export' },
      { module: 'billing.plans', action: 'view' },
      { module: 'billing.plans', action: 'create' },
      { module: 'billing.plans', action: 'edit' },
      { module: 'billing.invoices', action: 'view' },
      { module: 'billing.invoices', action: 'create' },
      { module: 'billing.invoices', action: 'export' },
      { module: 'developer.api_keys', action: 'view' },
      { module: 'developer.api_keys', action: 'create' },
      { module: 'developer.api_keys', action: 'delete' },
      { module: 'developer.webhooks', action: 'view' },
      { module: 'developer.webhooks', action: 'create' },
      { module: 'developer.webhooks', action: 'edit' },
      { module: 'developer.webhooks', action: 'delete' },
    ];

    const permIds: string[] = [];
    for (const p of permissions) {
      const { rows } = await client.query(
        'INSERT INTO permissions (module, action) VALUES ($1, $2) ON CONFLICT (module, action) DO NOTHING RETURNING id',
        [p.module, p.action],
      );
      if (rows.length) permIds.push(rows[0].id);
      else {
        const { rows: existing } = await client.query(
          'SELECT id FROM permissions WHERE module = $1 AND action = $2',
          [p.module, p.action],
        );
        permIds.push(existing[0].id);
      }
    }

    const roleNames = ['Super Admin', 'HR Manager', 'Finance Manager', 'Employee'];
    const roleMap = new Map<string, string>();
    for (const name of roleNames) {
      // Use SELECT-then-INSERT because the unique index on roles(tenant_id, name)
      // is a partial index (WHERE deleted_at IS NULL), which ON CONFLICT column
      // syntax cannot reference directly.
      const { rows: existingRole } = await client.query(
        'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 AND deleted_at IS NULL',
        [tenantId, name],
      );
      if (existingRole.length > 0) {
        await client.query(
          'UPDATE roles SET description = $1 WHERE id = $2',
          [`${name} role`, existingRole[0].id],
        );
        roleMap.set(name, existingRole[0].id);
      } else {
        const { rows } = await client.query(
          'INSERT INTO roles (tenant_id, name, description, is_system) VALUES ($1, $2, $3, true) RETURNING id',
          [tenantId, name, `${name} role`],
        );
        roleMap.set(name, rows[0].id);
      }
    }

    // Assign all permissions to Super Admin
    const superAdminRoleId = roleMap.get('Super Admin')!;
    for (const permId of permIds) {
      await client.query(
        'INSERT INTO role_permissions (tenant_id, role_id, permission_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [tenantId, superAdminRoleId, permId],
      );
    }

    // Assign admin users to Super Admin role
    for (const aId of seededAdminIds) {
      await client.query(
        'INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [tenantId, aId, superAdminRoleId],
      );
    }

    // 5. Properties
    console.log('Seeding properties...');
    const props = [
      { name: 'Mumbai Main', code: 'MUM-01', property_type: 'hotel' }
    ];
    const propertyMap = new Map<string, string>();
    for (const p of props) {
      // Partial unique index on properties(tenant_id, code) WHERE deleted_at IS NULL
      // — cannot use ON CONFLICT (cols); use SELECT-then-INSERT instead.
      const { rows: existingProp } = await client.query(
        'SELECT id FROM properties WHERE tenant_id = $1 AND code = $2 AND deleted_at IS NULL',
        [tenantId, p.code],
      );
      if (existingProp.length > 0) {
        await client.query('UPDATE properties SET name = $1 WHERE id = $2', [p.name, existingProp[0].id]);
        propertyMap.set(p.code, existingProp[0].id);
      } else {
        const { rows } = await client.query(
          'INSERT INTO properties (tenant_id, name, code, property_type) VALUES ($1, $2, $3, $4) RETURNING id',
          [tenantId, p.name, p.code, p.property_type],
        );
        propertyMap.set(p.code, rows[0].id);
      }
    }

    // 6. Departments
    console.log('Seeding departments...');
    const depts = [
      { name: 'Front Office', code: 'FO', linkToProperty: true },
      { name: 'Housekeeping', code: 'HK', linkToProperty: true },
      { name: 'Food & Beverage', code: 'FNB', linkToProperty: true },
      { name: 'Kitchen', code: 'KIT', linkToProperty: true },
      { name: 'Engineering', code: 'ENG' },
      { name: 'Sales & Marketing', code: 'SM' },
      { name: 'Human Resources', code: 'HR' },
      { name: 'Finance & Accounts', code: 'FA' },
      { name: 'Security', code: 'SEC' },
      { name: 'Spa & Wellness', code: 'SPA' },
    ];
    const departmentMap = new Map<string, string>();
    for (const d of depts) {
      const propId = d.linkToProperty ? propertyMap.get('MUM-01') : null;
      const { rows } = await client.query(
        'INSERT INTO departments (tenant_id, name, code, property_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id',
        [tenantId, d.name, d.code, propId],
      );
      let id = rows[0]?.id;
      if (!id) {
        const { rows: existing } = await client.query(
          'UPDATE departments SET property_id = $3 WHERE tenant_id = $1 AND code = $2 RETURNING id',
          [tenantId, d.code, propId]
        );
        id = existing[0].id;
      }
      departmentMap.set(d.code, id);
    }

    // 7. Designations
    console.log('Seeding designations...');
    const desigs = [
      { name: 'General Manager', level: 5 },
      { name: 'Department Head', level: 4 },
      { name: 'Assistant Manager', level: 3 },
      { name: 'Supervisor', level: 2 },
      { name: 'Senior Staff', level: 1 },
      { name: 'Staff', level: 1 },
      { name: 'Trainee', level: 0 },
    ];
    const designationMap = new Map<string, string>();
    for (const d of desigs) {
      const { rows } = await client.query(
        'INSERT INTO designations (tenant_id, name, level) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id',
        [tenantId, d.name, d.level],
      );
      const id = rows.length ? rows[0].id : (await client.query('SELECT id FROM designations WHERE tenant_id = $1 AND name = $2', [tenantId, d.name])).rows[0].id;
      designationMap.set(d.name, id);
    }

    // 8. Employment types
    console.log('Seeding employment types...');
    const empTypes = ['Full-Time', 'Part-Time', 'Contract', 'Trainee', 'Intern'];
    const employmentTypeMap = new Map<string, string>();
    for (const name of empTypes) {
      const { rows } = await client.query(
        'INSERT INTO employment_types (tenant_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
        [tenantId, name],
      );
      const id = rows.length ? rows[0].id : (await client.query('SELECT id FROM employment_types WHERE tenant_id = $1 AND name = $2', [tenantId, name])).rows[0].id;
      employmentTypeMap.set(name, id);
    }

    // 9. Cost Centers
    console.log('Seeding cost centers...');
    const costCenters = [
      { name: 'Rooms Cost Center', code: 'CC-ROOMS', propertyCode: 'MUM-01' },
      { name: 'F&B Cost Center', code: 'CC-FNB', propertyCode: 'MUM-01' },
      { name: 'Admin Cost Center', code: 'CC-ADMIN', propertyCode: 'MUM-01' },
      { name: 'Spa Cost Center', code: 'CC-SPA', propertyCode: 'MUM-01' },
      { name: 'Sales Cost Center', code: 'CC-SALES', propertyCode: 'MUM-01' },
    ];
    const costCenterMap = new Map<string, string>();
    for (const cc of costCenters) {
      const propId = propertyMap.get(cc.propertyCode)!;
      // Partial unique index on cost_centers(tenant_id, code) WHERE deleted_at IS NULL
      const { rows: existingCc } = await client.query(
        'SELECT id FROM cost_centers WHERE tenant_id = $1 AND code = $2 AND deleted_at IS NULL',
        [tenantId, cc.code],
      );
      if (existingCc.length > 0) {
        await client.query('UPDATE cost_centers SET name = $1 WHERE id = $2', [cc.name, existingCc[0].id]);
        costCenterMap.set(cc.code, existingCc[0].id);
      } else {
        const { rows } = await client.query(
          'INSERT INTO cost_centers (tenant_id, name, code, property_id) VALUES ($1, $2, $3, $4) RETURNING id',
          [tenantId, cc.name, cc.code, propId],
        );
        costCenterMap.set(cc.code, rows[0].id);
      }
    }

    // 10. Employees
    console.log('Seeding HR Employees Master...');
    const employeeData = [
      {
        code: 'EMP001',
        first: 'Aarav',
        last: 'Sharma',
        email: 'aarav.sharma@demo.com',
        phone: '9876543210',
        prop: 'MUM-01',
        dept: 'HR',
        desig: 'General Manager',
        empType: 'Full-Time',
        costCenter: 'CC-ADMIN',
        dateOfJoining: '2022-01-15'
      },
      {
        code: 'EMP002',
        first: 'Priya',
        last: 'Patel',
        email: 'priya.patel@demo.com',
        phone: '9876543211',
        prop: 'MUM-01',
        dept: 'FO',
        desig: 'Staff',
        empType: 'Full-Time',
        costCenter: 'CC-ROOMS',
        dateOfJoining: '2023-03-10'
      },
      {
        code: 'EMP003',
        first: 'Vikram',
        last: 'Singh',
        email: 'vikram.singh@demo.com',
        phone: '9876543212',
        prop: 'MUM-01',
        dept: 'KIT',
        desig: 'Department Head',
        empType: 'Full-Time',
        costCenter: 'CC-FNB',
        dateOfJoining: '2021-08-01'
      },
      {
        code: 'EMP004',
        first: 'Neha',
        last: 'Reddy',
        email: 'neha.reddy@demo.com',
        phone: '9876543213',
        prop: 'MUM-01',
        dept: 'HK',
        desig: 'Trainee',
        empType: 'Contract',
        costCenter: 'CC-ROOMS',
        dateOfJoining: '2024-02-15'
      },
      {
        code: 'EMP005',
        first: 'Rahul',
        last: 'Verma',
        email: 'rahul.verma@demo.com',
        phone: '9876543214',
        prop: 'MUM-01',
        dept: 'FA',
        desig: 'Supervisor',
        empType: 'Part-Time',
        costCenter: 'CC-ADMIN',
        dateOfJoining: '2023-11-01'
      }
    ];

    const employeeMap = new Map<string, string>();
    for (const emp of employeeData) {
      const propId = propertyMap.get(emp.prop)!;
      const deptId = departmentMap.get(emp.dept)!;
      const desigId = designationMap.get(emp.desig)!;
      const empTypeId = employmentTypeMap.get(emp.empType)!;
      const ccId = costCenterMap.get(emp.costCenter)!;

      const { rows } = await client.query(
        `INSERT INTO employees (
          tenant_id, employee_code, status, first_name, last_name, personal_email, personal_phone,
          property_id, department_id, designation_id, employment_type_id, cost_center_id, date_of_joining,
          present_address, bank_name, bank_account_number, ifsc_code, pan_number, aadhaar_number
        ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id`,
        [
          tenantId, emp.code, emp.first, emp.last, emp.email, emp.phone,
          propId, deptId, desigId, empTypeId, ccId, emp.dateOfJoining,
          JSON.stringify({ city: 'Mumbai', street: 'MG Road' }), 'HDFC Bank', '501002003004', 'HDFC0000240', 'ABCDE1234F', '123456789012'
        ]
      );
      employeeMap.set(emp.code, rows[0].id);
    }

    // Link first admin user to Aarav Sharma's employee_id
    const emp001Id = employeeMap.get('EMP001')!;
    if (seededAdminIds.length > 0) {
      await client.query('UPDATE users SET employee_id = $1 WHERE id = $2', [emp001Id, seededAdminIds[0]]);
    }

    // 11. Employee Lifecycle Events
    console.log('Seeding employee lifecycle events...');
    const lifecycleEvents = [
      { code: 'EMP001', type: 'confirmation', date: '2022-07-15', old: {}, new: { status: 'confirmed' }, remark: 'Completed probation successfully' },
      { code: 'EMP002', type: 'promotion', date: '2024-03-10', old: { designation: 'Trainee' }, new: { designation: 'Staff' }, remark: 'Promoted to Front Desk Executive' },
      { code: 'EMP003', type: 'increment', date: '2023-08-01', old: { basic: 50000 }, new: { basic: 55000 }, remark: 'Annual performance increment' },
      { code: 'EMP004', type: 'confirmation', date: '2024-05-15', old: {}, new: { status: 'confirmed' }, remark: 'Probation cleared' },
      { code: 'EMP005', type: 'increment', date: '2024-05-01', old: { basic: 25000 }, new: { basic: 28000 }, remark: 'Mid-year salary revision' }
    ];
    for (const le of lifecycleEvents) {
      await client.query(
        'INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, old_values, new_values, remarks, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [tenantId, employeeMap.get(le.code)!, le.type, le.date, JSON.stringify(le.old), JSON.stringify(le.new), le.remark, seededAdminIds[0]]
      );
    }

    // 12. Employee Documents
    console.log('Seeding employee documents...');
    const docTypes = ['PAN', 'Aadhaar', 'Offer Letter', 'Resume', 'Degree Certificate'];
    let docIndex = 1;
    for (const [code, empId] of employeeMap.entries()) {
      const type = docTypes[docIndex % docTypes.length];
      await client.query(
        'INSERT INTO employee_documents (tenant_id, employee_id, document_type, name, file_url, file_size_bytes, mime_type, verified_by, verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())',
        [tenantId, empId, type, `${type}_${code}.pdf`, `https://storage.demo.com/docs/${code}/${type.toLowerCase()}.pdf`, 1048576, 'application/pdf', seededAdminIds[0]]
      );
      docIndex++;
    }

    // 13. Shift Definitions
    console.log('Seeding shift definitions...');
    const shifts = [
      { name: 'Morning Shift', code: 'SH-MORN', start: '07:00:00', end: '15:00:00' },
      { name: 'Afternoon Shift', code: 'SH-AFT', start: '15:00:00', end: '23:00:00' },
      { name: 'Night Shift', code: 'SH-NIGHT', start: '23:00:00', end: '07:00:00' },
      { name: 'General Shift', code: 'SH-GEN', start: '09:00:00', end: '18:00:00' }
    ];
    const shiftMap = new Map<string, string>();
    for (const s of shifts) {
      const { rows } = await client.query(
        'INSERT INTO shift_definitions (tenant_id, name, code, start_time, end_time, break_minutes, grace_period_minutes) VALUES ($1, $2, $3, $4, $5, 60, 15) RETURNING id',
        [tenantId, s.name, s.code, s.start, s.end]
      );
      shiftMap.set(s.code, rows[0].id);
    }

    // 14. Shift Assignments & Schedules
    console.log('Seeding shift assignments and schedules...');
    const shiftAssignments = [
      { code: 'EMP001', shift: 'SH-GEN' },
      { code: 'EMP002', shift: 'SH-MORN' },
      { code: 'EMP003', shift: 'SH-AFT' },
      { code: 'EMP004', shift: 'SH-MORN' },
      { code: 'EMP005', shift: 'SH-GEN' }
    ];

    const today = new Date();
    for (const sa of shiftAssignments) {
      const empId = employeeMap.get(sa.code)!;
      const shiftId = shiftMap.get(sa.shift)!;
      
      // Assignment
      await client.query(
        'INSERT INTO shift_assignments (tenant_id, employee_id, shift_id, start_date, is_active) VALUES ($1, $2, $3, $4, true)',
        [tenantId, empId, shiftId, '2026-05-01']
      );

      // Create schedules for past 5 days
      for (let i = 0; i <= 5; i++) {
        const scheduleDate = new Date(today);
        scheduleDate.setDate(today.getDate() - i);
        await client.query(
          'INSERT INTO shift_schedules (tenant_id, employee_id, shift_id, date, status) VALUES ($1, $2, $3, $4, $5)',
          [tenantId, empId, shiftId, scheduleDate.toISOString().split('T')[0], 'scheduled']
        );
      }
    }

    // 15. Attendance Records
    console.log('Seeding attendance records...');
    // Create attendance for the last 5 days
    for (let i = 0; i <= 5; i++) {
      const attDate = new Date(today);
      attDate.setDate(today.getDate() - i);
      const dateStr = attDate.toISOString().split('T')[0];

      // EMP001 (GM): Normal Gen shift
      const { rows: ssGen } = await client.query('SELECT start_time, end_time FROM shift_definitions WHERE code = $1', ['SH-GEN']);
      const { rows: ssMorn } = await client.query('SELECT start_time, end_time FROM shift_definitions WHERE code = $1', ['SH-MORN']);
      const { rows: ssAft } = await client.query('SELECT start_time, end_time FROM shift_definitions WHERE code = $1', ['SH-AFT']);

      const gmId = employeeMap.get('EMP001')!;
      await client.query(
        `INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in, clock_out, status, shift_id, late_minutes, overtime_minutes)
         VALUES ($1, $2, $3, $4, $5, 'present', $6, 0, 0)`,
        [tenantId, gmId, dateStr, `${dateStr}T09:00:00+05:30`, `${dateStr}T18:00:00+05:30`, shiftMap.get('SH-GEN')!]
      );

      // EMP002 (Priya): Late by 20 mins on Day 2
      const priyaId = employeeMap.get('EMP002')!;
      const isLate = (i === 2);
      await client.query(
        `INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in, clock_out, status, shift_id, late_minutes, overtime_minutes)
         VALUES ($1, $2, $3, $4, $5, 'present', $6, $7, 0)`,
        [
          tenantId, priyaId, dateStr, 
          isLate ? `${dateStr}T07:20:00+05:30` : `${dateStr}T07:00:00+05:30`,
          `${dateStr}T15:00:00+05:30`,
          shiftMap.get('SH-MORN')!,
          isLate ? 20 : 0
        ]
      );

      // EMP003 (Vikram): Overtime of 120 mins on Day 3
      const vikramId = employeeMap.get('EMP003')!;
      const isOt = (i === 3);
      await client.query(
        `INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in, clock_out, status, shift_id, late_minutes, overtime_minutes)
         VALUES ($1, $2, $3, $4, $5, 'present', $6, 0, $7)`,
        [
          tenantId, vikramId, dateStr, `${dateStr}T15:00:00+05:30`,
          isOt ? `${dateStr}T01:00:00+05:30` : `${dateStr}T23:00:00+05:30`,
          shiftMap.get('SH-AFT')!,
          isOt ? 120 : 0
        ]
      );

      // EMP004 (Neha): Absent on Day 1, Present on others
      const nehaId = employeeMap.get('EMP004')!;
      const isAbsent = (i === 1);
      if (isAbsent) {
        await client.query(
          `INSERT INTO attendance_records (tenant_id, employee_id, date, status, shift_id)
           VALUES ($1, $2, $3, 'absent', $4)`,
          [tenantId, nehaId, dateStr, shiftMap.get('SH-MORN')!]
        );
      } else {
        await client.query(
          `INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in, clock_out, status, shift_id)
           VALUES ($1, $2, $3, $4, $5, 'present', $6)`,
          [tenantId, nehaId, dateStr, `${dateStr}T07:00:00+05:30`, `${dateStr}T15:00:00+05:30`, shiftMap.get('SH-MORN')!]
        );
      }

      // EMP005 (Rahul): Present
      const rahulId = employeeMap.get('EMP005')!;
      await client.query(
        `INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in, clock_out, status, shift_id)
         VALUES ($1, $2, $3, $4, $5, 'present', $6)`,
        [tenantId, rahulId, dateStr, `${dateStr}T09:00:00+05:30`, `${dateStr}T18:00:00+05:30`, shiftMap.get('SH-GEN')!]
      );
    }

    // 16. Attendance Requests
    console.log('Seeding attendance requests...');
    const attRequests = [
      { code: 'EMP002', type: 'regularization', reason: 'Machine failed to scan finger', date: '2026-05-10', status: 'approved' },
      { code: 'EMP003', type: 'overtime', reason: 'Banquet event ran late', date: '2026-05-12', status: 'approved' },
      { code: 'EMP004', type: 'regularization', reason: 'Forgot card at home', date: '2026-05-14', status: 'pending' },
      { code: 'EMP005', type: 'on_duty', reason: 'Bank visit for salary audit', date: '2026-05-15', status: 'approved' },
      { code: 'EMP001', type: 'on_duty', reason: 'State hotel conference', date: '2026-05-18', status: 'pending' }
    ];
    for (const ar of attRequests) {
      await client.query(
        'INSERT INTO attendance_requests (tenant_id, employee_id, date, request_type, status, reason, approved_by, approved_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now())',
        [tenantId, employeeMap.get(ar.code)!, ar.date, ar.type, ar.status, ar.reason, adminId]
      );
    }

    // 17. Leave Types & Balances
    console.log('Seeding leave types and balances...');
    const leaveTypes = [
      { name: 'Casual Leave', code: 'CL', max: 12 },
      { name: 'Sick Leave', code: 'SL', max: 12 },
      { name: 'Privilege Leave', code: 'PL', max: 18 },
      { name: 'Maternity Leave', code: 'ML', max: 90 },
      { name: 'Compensatory Off', code: 'CO', max: 5 }
    ];
    const leaveTypeMap = new Map<string, string>();
    for (const lt of leaveTypes) {
      // Partial unique index on leave_types(tenant_id, code) WHERE is_active = true
      const { rows: existingLt } = await client.query(
        'SELECT id FROM leave_types WHERE tenant_id = $1 AND code = $2 AND is_active = true',
        [tenantId, lt.code],
      );
      if (existingLt.length > 0) {
        await client.query('UPDATE leave_types SET name = $1 WHERE id = $2', [lt.name, existingLt[0].id]);
        leaveTypeMap.set(lt.code, existingLt[0].id);
      } else {
        const { rows } = await client.query(
          'INSERT INTO leave_types (tenant_id, name, code, paid, max_days_per_year) VALUES ($1, $2, $3, true, $4) RETURNING id',
          [tenantId, lt.name, lt.code, lt.max]
        );
        leaveTypeMap.set(lt.code, rows[0].id);
      }
    }

    // Balances
    const currentYear = new Date().getFullYear();
    for (const [code, empId] of employeeMap.entries()) {
      for (const [codeLt, ltId] of leaveTypeMap.entries()) {
        const allocated = codeLt === 'PL' ? 15 : 10;
        const used = codeLt === 'SL' ? 2 : 1;
        await client.query(
          'INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, year, allocated, used, available) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [tenantId, empId, ltId, currentYear, allocated, used, allocated - used]
        );
      }
    }

    // 18. Leave Requests
    console.log('Seeding leave requests...');
    const leaveRequests = [
      { code: 'EMP002', type: 'SL', start: '2026-06-01', end: '2026-06-02', days: 2, status: 'approved', reason: 'Fever' },
      { code: 'EMP003', type: 'CL', start: '2026-06-15', end: '2026-06-16', days: 2, status: 'pending', reason: 'Personal family work' },
      { code: 'EMP004', type: 'PL', start: '2026-07-01', end: '2026-07-05', days: 5, status: 'rejected', reason: 'Peak season coverage needed' },
      { code: 'EMP005', type: 'CL', start: '2026-05-25', end: '2026-05-25', days: 1, status: 'approved', reason: 'Daughter\'s school event' },
      { code: 'EMP001', type: 'SL', start: '2026-05-26', end: '2026-05-27', days: 2, status: 'pending', reason: 'Dental appointment' }
    ];
    for (const lr of leaveRequests) {
      await client.query(
        'INSERT INTO leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days, reason, status, approved_by, approved_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())',
        [tenantId, employeeMap.get(lr.code)!, leaveTypeMap.get(lr.type)!, lr.start, lr.end, lr.days, lr.reason, lr.status, adminId]
      );
    }

    // 19. Salary Structures
    console.log('Seeding salary structures...');
    const salaryData = [
      { code: 'EMP001', basic: 80000, allowances: 20000 },
      { code: 'EMP002', basic: 25000, allowances: 5000 },
      { code: 'EMP003', basic: 45000, allowances: 10000 },
      { code: 'EMP004', basic: 15000, allowances: 3000 },
      { code: 'EMP005', basic: 20000, allowances: 4000 }
    ];
    for (const sal of salaryData) {
      const basicNum = sal.basic;
      const hraNum = sal.allowances * 0.5;
      const specNum = sal.allowances * 0.5;
      const pfNum = basicNum * 0.12;
      const esiNum = basicNum < 21000 ? basicNum * 0.0075 : 0;
      await client.query(
        `INSERT INTO salary_structures (
          tenant_id, employee_id, basic, hra, da, conveyance, medical, special_allowance,
          pf_employer, pf_employee, esi_employer, esi_employee, professional_tax, tds, effective_from
        ) VALUES ($1, $2, $3, $4, 0, 0, 0, $5, $6, $6, $7, $7, 200, 0, '2026-01-01')`,
        [tenantId, employeeMap.get(sal.code)!, basicNum, hraNum, specNum, pfNum, esiNum]
      );
    }

    // 20. Payroll Runs & Payslips
    console.log('Seeding payroll runs and payslips...');
    const runMonth = 4;
    const runYear = 2026;
    const { rows: payrollRuns } = await client.query(
      'INSERT INTO payroll_runs (tenant_id, month, year, status, total_gross, total_deductions, total_net, processed_by, processed_at) VALUES ($1, $2, $3, \'processed\', 222000.00, 24600.00, 197400.00, $4, now()) RETURNING id',
      [tenantId, runMonth, runYear, adminId]
    );
    const payrollRunId = payrollRuns[0].id;

    for (const sal of salaryData) {
      const empId = employeeMap.get(sal.code)!;
      const gross = sal.basic + sal.allowances;
      const pf = sal.basic * 0.12;
      const esi = sal.basic < 21000 ? sal.basic * 0.0075 : 0;
      const pt = 200;
      const totalDeductions = pf + esi + pt;
      const net = gross - totalDeductions;

      await client.query(
        `INSERT INTO payslips (
          tenant_id, payroll_run_id, employee_id, month, year, basic, hra, special_allowance,
          gross_salary, pf, esi, professional_tax, total_deductions, net_salary, status, paid_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'paid', now())`,
        [
          tenantId, payrollRunId, empId, runMonth, runYear, sal.basic, sal.allowances * 0.5, sal.allowances * 0.5,
          gross, pf, esi, pt, totalDeductions, net
        ]
      );
    }

    // 21. Job Postings, Candidates, Interviews (Recruitment)
    console.log('Seeding recruitment data...');
    const jobs = [
      { title: 'Front Office Lead', dept: 'FO', desig: 'Assistant Manager', location: 'Grand Palace Hotel', openings: 1 },
      { title: 'Sous Chef', dept: 'KIT', desig: 'Assistant Manager', location: 'Spice Garden Restaurant', openings: 2 },
      { title: 'Sales Executive', dept: 'SM', desig: 'Staff', location: 'Royal Banquet Hall', openings: 3 },
      { title: 'HR Generalist', dept: 'HR', desig: 'Supervisor', location: 'Grand Palace Hotel', openings: 1 }
    ];
    const jobMap = new Map<string, string>();
    for (const j of jobs) {
      const { rows } = await client.query(
        'INSERT INTO job_postings (tenant_id, title, department_id, designation_id, location, employment_type_id, description, openings, status, posted_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, \'open\', $9) RETURNING id',
        [
          tenantId, j.title, departmentMap.get(j.dept)!, designationMap.get(j.desig)!, j.location,
          employmentTypeMap.get('Full-Time')!, `${j.title} role at ${j.location}`, j.openings, adminId
        ]
      );
      jobMap.set(j.title, rows[0].id);
    }

    const candidates = [
      { first: 'Alice', last: 'Johnson', email: 'alice.j@test.com', phone: '9000000001', job: 'Front Office Lead', status: 'applied', experience: 5 },
      { first: 'Bob', last: 'Smith', email: 'bob.s@test.com', phone: '9000000002', job: 'Sous Chef', status: 'interviewing', experience: 6 },
      { first: 'Charlie', last: 'Brown', email: 'charlie.b@test.com', phone: '9000000003', job: 'Sales Executive', status: 'offered', experience: 3 },
      { first: 'David', last: 'Green', email: 'david.g@test.com', phone: '9000000004', job: 'HR Generalist', status: 'rejected', experience: 2 },
      { first: 'Emma', last: 'White', email: 'emma.w@test.com', phone: '9000000005', job: 'Front Office Lead', status: 'applied', experience: 4 }
    ];
    const candidateMap = new Map<string, string>();
    for (const c of candidates) {
      const { rows } = await client.query(
        'INSERT INTO candidates (tenant_id, job_posting_id, first_name, last_name, email, phone, experience_years, expected_salary, status, rating) VALUES ($1, $2, $3, $4, $5, $6, $7, 35000, $8, 4) RETURNING id',
        [tenantId, jobMap.get(c.job)!, c.first, c.last, c.email, c.phone, c.experience, c.status]
      );
      candidateMap.set(c.first, rows[0].id);
    }

    // Interviews
    const interviews = [
      { cand: 'Bob', job: 'Sous Chef', type: 'Technical Round', feedback: 'Great culinary skills, strong leadership potential.' },
      { cand: 'Charlie', job: 'Sales Executive', type: 'HR Round', feedback: 'Very good communication, excellent negotiation.' },
      { cand: 'David', job: 'HR Generalist', type: 'First Round', feedback: 'Inadequate understanding of state labor compliance laws.' },
      { cand: 'Alice', job: 'Front Office Lead', type: 'Screening', feedback: 'Good fit, scheduling second round.' },
      { cand: 'Emma', job: 'Front Office Lead', type: 'Screening', feedback: 'Okay candidate, communication needs polish.' }
    ];
    for (const int of interviews) {
      await client.query(
        'INSERT INTO interviews (tenant_id, candidate_id, job_posting_id, interviewer_id, interview_type, scheduled_at, duration_minutes, status, feedback, rating, recommendation) VALUES ($1, $2, $3, $4, $5, now() + interval \'1 day\', 45, \'scheduled\', $6, 4, \'hire\')',
        [tenantId, candidateMap.get(int.cand)!, jobMap.get(int.job)!, adminId, int.type, int.feedback]
      );
    }

    // 22. Exit Management
    console.log('Seeding exit management data...');
    // Create an employee specifically for exit testing
    const { rows: testExitEmp } = await client.query(
      `INSERT INTO employees (tenant_id, employee_code, status, first_name, last_name, personal_email, date_of_joining)
       VALUES ($1, 'EMP999', 'resigned', 'John', 'Doe', 'john.doe@exit-test.com', '2023-01-01') RETURNING id`,
      [tenantId]
    );
    const exitEmpId = testExitEmp[0].id;

    const { rows: exitRequests } = await client.query(
      `INSERT INTO exit_requests (tenant_id, employee_id, request_type, reason, notice_period_days, requested_date, last_working_date, status, approved_by, approval_date)
       VALUES ($1, $2, 'resignation', 'Better growth opportunities in tech', 30, '2026-04-15', '2026-05-15', 'approved', $3, now()) RETURNING id`,
      [tenantId, exitEmpId, adminId]
    );
    const exitRequestId = exitRequests[0].id;

    // Exit Checklist
    const checklistItems = [
      { item: 'Return Macbook & Charger', dept: 'IT' },
      { item: 'Deactivate email and Slack credentials', dept: 'IT' },
      { item: 'Submit expense bills', dept: 'Finance' },
      { item: 'Return access card and ID keys', dept: 'Security' },
      { item: 'Sign PF and Gratuity release papers', dept: 'HR' }
    ];
    for (const cli of checklistItems) {
      await client.query(
        'INSERT INTO exit_checklist (tenant_id, exit_request_id, item, department, status, assigned_to) VALUES ($1, $2, $3, $4, \'completed\', $5)',
        [tenantId, exitRequestId, cli.item, cli.dept, adminId]
      );
    }

    // Exit Clearances
    const clearanceDepts = ['IT', 'Finance', 'Security', 'HR'];
    for (const d of clearanceDepts) {
      await client.query(
        'INSERT INTO exit_clearances (tenant_id, exit_request_id, department, cleared_by, status, cleared_at) VALUES ($1, $2, $3, $4, \'cleared\', now())',
        [tenantId, exitRequestId, d, adminId]
      );
    }

    // Final Settlement
    await client.query(
      `INSERT INTO final_settlements (
        tenant_id, exit_request_id, employee_id, basic_salary, allowances, gratuity, leave_encashment,
        bonus, deductions, total_payable, total_deductions, net_payable, payment_status, payment_date
      ) VALUES ($1, $2, $3, 30000.00, 10000.00, 15000.00, 5000.00, 0.00, 2000.00, 60000.00, 2000.00, 58000.00, 'paid', '2026-05-20')`,
      [tenantId, exitRequestId, exitEmpId]
    );

    // 23. Finance Chart of Accounts & Journal Entries
    console.log('Seeding finance charts & journals...');
    const coas = [
      { code: '1000', name: 'HDFC Bank Account', type: 'asset' },
      { code: '1100', name: 'Office Furniture', type: 'asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability' },
      { code: '3000', name: 'Deluxe Room Sales', type: 'revenue' },
      { code: '4000', name: 'Staff Salaries Expense', type: 'expense' },
      { code: '4100', name: 'Hotel Office Rent', type: 'expense' }
    ];
    const coaMap = new Map<string, string>();
    for (const c of coas) {
      // Partial unique index on chart_of_accounts(tenant_id, code) WHERE is_active = true
      const { rows: existingCoa } = await client.query(
        'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND code = $2 AND is_active = true',
        [tenantId, c.code],
      );
      if (existingCoa.length > 0) {
        await client.query('UPDATE chart_of_accounts SET name = $1 WHERE id = $2', [c.name, existingCoa[0].id]);
        coaMap.set(c.code, existingCoa[0].id);
      } else {
        const { rows } = await client.query(
          'INSERT INTO chart_of_accounts (tenant_id, code, name, type) VALUES ($1, $2, $3, $4) RETURNING id',
          [tenantId, c.code, c.name, c.type]
        );
        coaMap.set(c.code, rows[0].id);
      }
    }

    // Journal Entry
    const { rows: je } = await client.query(
      `INSERT INTO journal_entries (tenant_id, voucher_number, date, description, reference, status, created_by)
       VALUES ($1, 'JV-2026-05-001', '2026-05-15', 'Monthly salary booking and rent payment', 'REF-MAY-01', 'approved', $2) RETURNING id`,
      [tenantId, adminId]
    );
    const jeId = je[0].id;

    // Journal Lines
    const lines = [
      { code: '4000', deb: 50000, cred: 0, desc: 'Salaries for May' },
      { code: '4100', deb: 30000, cred: 0, desc: 'Rent for May' },
      { code: '1000', deb: 0, cred: 80000, desc: 'Payment made from bank' }
    ];
    for (const l of lines) {
      await client.query(
        'INSERT INTO journal_entry_lines (tenant_id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)',
        [tenantId, jeId, coaMap.get(l.code)!, l.deb, l.cred, l.desc]
      );
    }

    // Expenses
    const expenses = [
      { code: 'EMP001', category: 'travel', amount: 3500, desc: 'Flight booking for hotel association summit' },
      { code: 'EMP002', category: 'meals', amount: 1500, desc: 'Client buffet dinner hosting' },
      { code: 'EMP003', category: 'kitchen', amount: 8000, desc: 'Bulk procurement of imported species' },
      { code: 'EMP004', category: 'housekeeping', amount: 2200, desc: 'Eco-friendly glass cleaning solutions' },
      { code: 'EMP005', category: 'office', amount: 1200, desc: 'Auditors printing paper and files' }
    ];
    for (const exp of expenses) {
      await client.query(
        'INSERT INTO expenses (tenant_id, employee_id, category, amount, currency, date, description, status, approved_by, approved_at) VALUES ($1, $2, $3, $4, \'INR\', \'2026-05-20\', $5, \'approved\', $6, now())',
        [tenantId, employeeMap.get(exp.code)!, exp.category, exp.amount, exp.desc, adminId]
      );
    }

    // 23b. Reimbursements
    console.log('Seeding reimbursement claims...');
    const reimbursements = [
      // Pending claims
      { code: 'EMP002', category: 'food',          amount: 1250,  date: '2026-05-22', desc: 'Client lunch at Taj Mumbai during site visit', status: 'pending' },
      { code: 'EMP003', category: 'travel',        amount: 4500,  date: '2026-05-20', desc: 'Cab fare for vendor kitchen equipment inspection', status: 'pending' },
      { code: 'EMP004', category: 'uniform',       amount: 3200,  date: '2026-05-18', desc: 'Housekeeping uniform set — 2 pairs', status: 'pending' },
      // Approved claims
      { code: 'EMP001', category: 'travel',        amount: 12500, date: '2026-05-10', desc: 'Round-trip flight to Delhi for hotel association summit', status: 'approved' },
      { code: 'EMP001', category: 'accommodation', amount: 8500,  date: '2026-05-11', desc: '2-night stay at Hyatt Delhi during conference', status: 'approved' },
      { code: 'EMP005', category: 'telephone',     amount: 899,   date: '2026-05-15', desc: 'Monthly mobile recharge — client calling plan', status: 'approved' },
      { code: 'EMP002', category: 'food',          amount: 2100,  date: '2026-05-12', desc: 'Team dinner after annual audit completion', status: 'approved' },
      // Paid claims
      { code: 'EMP001', category: 'fuel',          amount: 3400,  date: '2026-04-28', desc: 'Petrol expenses for inter-property visits — April', status: 'paid' },
      { code: 'EMP003', category: 'food',          amount: 1800,  date: '2026-04-25', desc: 'Kitchen team working lunch during banquet prep', status: 'paid' },
      { code: 'EMP005', category: 'medical',       amount: 5500,  date: '2026-04-20', desc: 'Annual health checkup at Apollo hospital', status: 'paid' },
      { code: 'EMP002', category: 'travel',        amount: 6200,  date: '2026-04-15', desc: 'Train + cab to Pune for front-office training workshop', status: 'paid' },
      // Rejected claims
      { code: 'EMP004', category: 'other',         amount: 15000, date: '2026-05-05', desc: 'Personal laptop repair — claimed as work equipment', status: 'rejected', reason: 'Personal equipment not covered under reimbursement policy' },
      { code: 'EMP003', category: 'accommodation', amount: 22000, date: '2026-05-01', desc: 'Premium suite upgrade during vendor visit', status: 'rejected', reason: 'Exceeds per-night accommodation limit of ₹5,000' },
      // More recent pending
      { code: 'EMP005', category: 'fuel',          amount: 2750,  date: '2026-05-25', desc: 'Diesel for generator refueling — emergency backup', status: 'pending' },
      { code: 'EMP001', category: 'food',          amount: 3800,  date: '2026-05-26', desc: 'Business dinner with prospective franchise partners', status: 'pending' },
    ];

    let reimbClaimSeq = 1;
    for (const r of reimbursements) {
      const claimNumber = `RMB-2026-${String(reimbClaimSeq++).padStart(4, '0')}`;
      const empId = employeeMap.get(r.code)!;

      if (r.status === 'pending') {
        await client.query(
          `INSERT INTO reimbursements (tenant_id, employee_id, claim_number, category, amount, expense_date, description, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
          [tenantId, empId, claimNumber, r.category, r.amount, r.date, r.desc]
        );
      } else if (r.status === 'approved') {
        await client.query(
          `INSERT INTO reimbursements (tenant_id, employee_id, claim_number, category, amount, expense_date, description, status, approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, now())`,
          [tenantId, empId, claimNumber, r.category, r.amount, r.date, r.desc, adminId]
        );
      } else if (r.status === 'paid') {
        await client.query(
          `INSERT INTO reimbursements (tenant_id, employee_id, claim_number, category, amount, expense_date, description, status, approved_by, approved_at, paid_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'paid', $8, now() - interval '5 days', now())`,
          [tenantId, empId, claimNumber, r.category, r.amount, r.date, r.desc, adminId]
        );
      } else if (r.status === 'rejected') {
        await client.query(
          `INSERT INTO reimbursements (tenant_id, employee_id, claim_number, category, amount, expense_date, description, status, approved_by, rejection_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'rejected', $8, $9)`,
          [tenantId, empId, claimNumber, r.category, r.amount, r.date, r.desc, adminId, (r as any).reason || null]
        );
      }
    }
    console.log(`Seeded ${reimbursements.length} reimbursement claims.`);

    // 24. GST Settings, Invoices & Returns
    console.log('Seeding GST data...');
    await client.query(
      `INSERT INTO gst_settings (tenant_id, gstin, legal_name, trade_name, registration_date, state_code, is_composition)
       VALUES ($1, '27AAAAA1111A1Z1', 'Demo Hotel Operations Pvt Ltd', 'Demo Hotel Group', '2020-04-01', '27', false)
       ON CONFLICT (tenant_id, gstin) DO NOTHING`,
      [tenantId]
    );

    const gstInvoices = [
      { number: 'INV-2026-001', name: 'John Doe Corp', val: 50000, cgst: 4500, sgst: 4500, igst: 0, tot: 59000 },
      { number: 'INV-2026-002', name: 'Sarah Connor', val: 10000, cgst: 900, sgst: 900, igst: 0, tot: 11800 },
      { number: 'INV-2026-003', name: 'ACME Inc', val: 20000, cgst: 0, sgst: 0, igst: 3600, tot: 23600 },
      { number: 'INV-2026-004', name: 'Bruce Wayne', val: 100000, cgst: 9000, sgst: 9000, igst: 0, tot: 118000 },
      { number: 'INV-2026-005', name: 'Clark Kent', val: 15000, cgst: 1350, sgst: 1350, igst: 0, tot: 17700 }
    ];
    for (const gi of gstInvoices) {
      await client.query(
        `INSERT INTO gst_invoices (tenant_id, invoice_number, invoice_date, customer_name, taxable_value, cgst, sgst, igst, total_amount, gst_rate, status)
         VALUES ($1, $2, '2026-05-10', $3, $4, $5, $6, $7, $8, 18, 'approved')`,
        [tenantId, gi.number, gi.name, gi.val, gi.cgst, gi.sgst, gi.igst, gi.tot]
      );
    }

    const returns = [
      { month: 1, out: 120000, tax: 21600 },
      { month: 2, out: 150000, tax: 27000 },
      { month: 3, out: 140000, tax: 25200 },
      { month: 4, out: 180000, tax: 32400 }
    ];
    for (const ret of returns) {
      await client.query(
        `INSERT INTO gst_returns (tenant_id, return_type, period_month, period_year, total_outward, total_cgst, total_sgst, total_igst, total_tax, status, filed_at, arn)
         VALUES ($1, 'GSTR-1', $2, 2026, $3, $4, $4, 0, $5, 'filed', now(), 'ARNMOCK123456789')`,
        [tenantId, ret.month, ret.out, ret.tax / 2, ret.tax]
      );
    }

    // 25. Notifications
    const notifications = [
      { title: 'New Leave Request', msg: 'Priya Patel requested Sick Leave for 2 days.' },
      { title: 'Biometric Sync Failed', msg: 'Property GPH01 connection timeout.' },
      { title: 'Tax Invoice Pending Approval', msg: 'Voucher JV-2026-05-001 requires admin review.' },
      { title: 'Job Applicant Received', msg: 'Alice Johnson applied for Front Office Lead.' },
      { title: 'Exit Clearance Complete', msg: 'John Doe has completed exit check-lists.' }
    ];
    for (const n of notifications) {
      await client.query(
        'INSERT INTO notifications (tenant_id, user_id, title, message, type, is_read) VALUES ($1, $2, $3, $4, \'info\', false)',
        [tenantId, adminId, n.title, n.msg]
      );
    }

    // 26. Guest Billing
    console.log('Seeding guest billing metrics...');
    const billingItems = [
      { name: 'Deluxe Room Rent', type: 'accommodation', rate: 6000.00 },
      { name: 'Continental Buffet Breakfast', type: 'food', rate: 750.00 },
      { name: 'Special Spa Massage', type: 'service', rate: 2500.00 },
      { name: 'Airport Premium Cab Service', type: 'transport', rate: 1800.00 },
      { name: 'Express Laundry Service', type: 'service', rate: 500.00 }
    ];
    const billingItemMap = new Map<string, string>();
    for (const bi of billingItems) {
      const { rows } = await client.query(
        'INSERT INTO billing_items (tenant_id, name, type, rate, tax_rate, is_active) VALUES ($1, $2, $3, $4, 18, true) RETURNING id',
        [tenantId, bi.name, bi.type, bi.rate]
      );
      billingItemMap.set(bi.name, rows[0].id);
    }

    const folios = [
      { name: 'John Miller', room: '101', in: '2026-05-18', out: '2026-05-20', status: 'checked_out', bill: 14750, pay: 14750, bal: 0 },
      { name: 'Sarah Connor', room: '102', in: '2026-05-21', out: '2026-05-24', status: 'open', bill: 12000, pay: 0, bal: 12000 },
      { name: 'Bruce Wayne', room: '501', in: '2026-05-20', out: '2026-05-25', status: 'open', bill: 33750, pay: 10000, bal: 23750 },
      { name: 'Peter Parker', room: '104', in: '2026-05-15', out: '2026-05-18', status: 'checked_out', bill: 8250, pay: 8250, bal: 0 },
      { name: 'Clark Kent', room: '105', in: '2026-05-23', out: '2026-05-24', status: 'open', bill: 6000, pay: 0, bal: 6000 }
    ];
    for (const f of folios) {
      const { rows } = await client.query(
        `INSERT INTO guest_folios (tenant_id, guest_name, room_number, check_in, check_out, status, total_amount, paid_amount, balance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tenantId, f.name, f.room, f.in, f.out, f.status, f.bill, f.pay, f.bal]
      );
      const folioId = rows[0].id;

      // Add room charge
      const deluxeId = billingItemMap.get('Deluxe Room Rent')!;
      const days = Math.max(1, Math.round((new Date(f.out).getTime() - new Date(f.in).getTime()) / (1000 * 60 * 60 * 24)));
      await client.query(
        `INSERT INTO folio_charges (tenant_id, folio_id, billing_item_id, description, quantity, rate, amount, tax_amount, date)
         VALUES ($1, $2, $3, 'Deluxe Room Stay', $4, 6000.00, $5, $6, $7)`,
        [tenantId, folioId, deluxeId, days, 6000.00 * days, 6000.00 * days * 0.18, f.in]
      );

      // Add payment if any
      if (f.pay > 0) {
        await client.query(
          `INSERT INTO folio_payments (tenant_id, folio_id, amount, payment_method, reference, received_at)
           VALUES ($1, $2, $3, 'Credit Card', 'TXN-FOL-98765', now())`,
          [tenantId, folioId, f.pay]
        );
      }
    }

    // 27. SaaS Billing & Subscriptions
    console.log('Seeding SaaS subscriptions...');
    const plans = [
      { name: 'Starter Plan', price: 99.00, users: 15, properties: 2 },
      { name: 'Professional Plan', price: 299.00, users: 100, properties: 10 },
      { name: 'Enterprise Plan', price: 899.00, users: 9999, properties: 999 }
    ];
    const planMap = new Map<string, string>();
    for (const p of plans) {
      // tenant_subscriptions.plan_id now references saas_base_plans (migration 123)
      // Use ON CONFLICT (slug) — slug is a plain UNIQUE (not partial), so this works.
      const { rows } = await client.query(
        'INSERT INTO saas_base_plans (name, slug, price_monthly, price_yearly, is_active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [p.name, p.name.toLowerCase().replace(/ /g, '-'), p.price, p.price * 10]
      );
      planMap.set(p.name, rows[0].id);
    }

    // Create active subscription for Demo Hotel Group
    const proPlanId = planMap.get('Professional Plan')!;
    const { rows: sub } = await client.query(
      `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end, next_billing_date, amount, auto_renew)
       VALUES ($1, $2, 'active', 'monthly', '2026-05-01', '2026-06-01', '2026-06-01', 299.00, true) RETURNING id`,
      [tenantId, proPlanId]
    );
    const subId = sub[0].id;

    // Subscription Invoices
    const { rows: subInv } = await client.query(
      `INSERT INTO subscription_invoices (tenant_id, subscription_id, invoice_number, amount, tax_amount, total_amount, status, due_date, paid_at, payment_method, payment_reference)
       VALUES ($1, $2, 'INV-SAAS-2026-05', 299.00, 53.82, 352.82, 'paid', '2026-05-05', now(), 'Razorpay', 'pay_txn_saas_12345') RETURNING id`,
      [tenantId, subId]
    );
    const subInvoiceId = subInv[0].id;

    // Payment Transaction
    await client.query(
      `INSERT INTO payment_transactions (tenant_id, invoice_id, amount, gateway, gateway_transaction_id, status, metadata)
       VALUES ($1, $2, 352.82, 'Razorpay', 'pay_txn_saas_12345', 'success', '{}')`,
      [tenantId, subInvoiceId]
    );

    // 28. Integrations & Webhooks
    console.log('Seeding integrations...');
    const integrations = [
      { name: 'WhatsApp Notification Engine', type: 'messaging', active: true },
      { name: 'Twilio SMS Dispatch Service', type: 'messaging', active: false },
      { name: 'Hkvision Biometric Punch Link', type: 'biometric', active: true },
      { name: 'Razorpay Payment Checkout', type: 'payment', active: true }
    ];
    for (const int of integrations) {
      const { rows } = await client.query(
        'INSERT INTO integrations (tenant_id, name, type, config, is_active, last_sync_at) VALUES ($1, $2, $3, \'{}\', $4, now()) RETURNING id',
        [tenantId, int.name, int.type, int.active]
      );
      
      // Seed Sync Log for active ones
      if (int.active) {
        await client.query(
          'INSERT INTO sync_logs (tenant_id, integration_id, direction, entity_type, records_synced, status, started_at, completed_at) VALUES ($1, $2, \'inbound\', \'biometric_records\', 24, \'success\', now() - interval \'1 hour\', now())',
          [tenantId, rows[0].id]
        );
      }
    }

    // Webhooks
    await client.query(
      'INSERT INTO webhooks (tenant_id, name, url, events, secret, is_active) VALUES ($1, \'Primary Webhook Dispatcher\', \'https://webhook.site/demo-endpoint\', \'{"attendance.clock_in", "attendance.clock_out", "leave.approved"}\', \'whsec_demo_key_98765\', true)',
      [tenantId]
    );

    // 29. HRMS Policy Templates & Assignments
    // This is the Pagarbook-style policy engine: templates define granular HR rules
    // and are assigned at employee / designation / department / property level.
    // The highest-priority matching assignment wins (employee > designation > dept > property > default).
    console.log('Seeding HRMS policy templates...');

    // ---------- ATTENDANCE POLICY templates ----------
    const attendanceTemplates = [
      {
        name: 'Standard Attendance Policy',
        description: 'Default policy for all staff. 15-min grace, 3 lates per month allowed before LOP deduction.',
        is_default: true,
        config: {
          grace_period_minutes: 15,
          max_late_per_month: 3,
          late_penalty: 'half_day_after_threshold',
          half_day_late_threshold_minutes: 120,
          absent_lop_threshold_per_month: 4,
          overtime_eligible: true,
          overtime_threshold_hours: 8,
          work_from_home_allowed: false,
          biometric_mandatory: true,
          early_exit_penalty: true,
          early_exit_grace_minutes: 30,
        },
      },
      {
        name: 'Senior Management Exemption Policy',
        description: 'For GM and Dept Heads. Extended grace, no late penalties, WFH allowed on approval.',
        is_default: false,
        config: {
          grace_period_minutes: 30,
          max_late_per_month: 999,
          late_penalty: 'none',
          half_day_late_threshold_minutes: 0,
          absent_lop_threshold_per_month: 999,
          overtime_eligible: false,
          overtime_threshold_hours: 0,
          work_from_home_allowed: true,
          wfh_max_days_per_month: 8,
          biometric_mandatory: false,
          early_exit_penalty: false,
        },
      },
      {
        name: 'F&B Ops Strict Attendance Policy',
        description: 'Kitchen & F&B departments. 5-min grace only, 2 lates = half-day, shift break mandatory.',
        is_default: false,
        config: {
          grace_period_minutes: 5,
          max_late_per_month: 2,
          late_penalty: 'half_day_after_threshold',
          half_day_late_threshold_minutes: 60,
          absent_lop_threshold_per_month: 2,
          overtime_eligible: true,
          overtime_threshold_hours: 9,
          work_from_home_allowed: false,
          biometric_mandatory: true,
          early_exit_penalty: true,
          early_exit_grace_minutes: 0,
          mandatory_break_minutes: 30,
        },
      },
    ];

    // ---------- LEAVE POLICY templates ----------
    const leaveTemplates = [
      {
        name: 'Standard Leave Policy',
        description: 'Default leave entitlements: CL 12, SL 12, PL 18. Carry-forward max 5 days.',
        is_default: true,
        config: {
          casual_leave_days: 12,
          sick_leave_days: 12,
          privilege_leave_days: 18,
          maternity_leave_days: 90,
          paternity_leave_days: 3,
          compensatory_off_enabled: true,
          carry_forward_enabled: true,
          carry_forward_max_days: 5,
          privilege_leave_notice_days: 30,
          sick_leave_requires_certificate_after_days: 3,
          encashment_enabled: false,
        },
      },
      {
        name: 'Senior Executive Leave Policy',
        description: 'For GM & Dept Heads. CL 15, SL 15, PL 24. High carry-forward, encashment allowed.',
        is_default: false,
        config: {
          casual_leave_days: 15,
          sick_leave_days: 15,
          privilege_leave_days: 24,
          maternity_leave_days: 90,
          paternity_leave_days: 5,
          compensatory_off_enabled: true,
          carry_forward_enabled: true,
          carry_forward_max_days: 15,
          privilege_leave_notice_days: 14,
          sick_leave_requires_certificate_after_days: 5,
          encashment_enabled: true,
          encashment_max_days_per_year: 10,
        },
      },
      {
        name: 'Trainee / Probation Leave Policy',
        description: 'For trainees and employees under probation. Restricted leave until confirmation.',
        is_default: false,
        config: {
          casual_leave_days: 7,
          sick_leave_days: 5,
          privilege_leave_days: 0,
          maternity_leave_days: 90,
          paternity_leave_days: 0,
          compensatory_off_enabled: false,
          carry_forward_enabled: false,
          carry_forward_max_days: 0,
          privilege_leave_notice_days: 0,
          sick_leave_requires_certificate_after_days: 2,
          encashment_enabled: false,
          pl_unlocks_after_confirmation: true,
        },
      },
    ];

    // ---------- SALARY STRUCTURE templates ----------
    const salaryTemplates = [
      {
        name: 'General Manager Salary Structure',
        description: 'Salary component structure for General Manager designation. High basic, no ESI liability.',
        is_default: false,
        config: {
          basic_percent_of_ctc: 40,
          hra_percent_of_basic: 50,
          da_percent_of_basic: 6,
          conveyance_fixed: 5000,
          medical_fixed: 1250,
          special_allowance_balance: true,
          pf_applicable: true,
          pf_employer_percent: 12,
          pf_employee_percent: 12,
          esi_applicable: false,
          professional_tax: 200,
          tds_applicable: true,
          bonus_applicable: true,
          bonus_percent_of_basic: 8.33,
          gratuity_applicable: true,
          lop_deduction_method: 'working_days',
        },
      },
      {
        name: 'Department Head / AM Salary Structure',
        description: 'For Dept Heads and Assistant Managers. Mid-range CTC with standard benefits.',
        is_default: false,
        config: {
          basic_percent_of_ctc: 40,
          hra_percent_of_basic: 50,
          da_percent_of_basic: 5,
          conveyance_fixed: 2000,
          medical_fixed: 1250,
          special_allowance_balance: true,
          pf_applicable: true,
          pf_employer_percent: 12,
          pf_employee_percent: 12,
          esi_applicable: false,
          professional_tax: 200,
          tds_applicable: true,
          bonus_applicable: true,
          bonus_percent_of_basic: 8.33,
          gratuity_applicable: true,
          lop_deduction_method: 'working_days',
        },
      },
      {
        name: 'Standard Staff Salary Structure',
        description: 'For regular full-time staff. PF and ESI applicable as per statutory rules.',
        is_default: true,
        config: {
          basic_percent_of_ctc: 50,
          hra_percent_of_basic: 40,
          da_percent_of_basic: 4,
          conveyance_fixed: 1600,
          medical_fixed: 0,
          special_allowance_balance: true,
          pf_applicable: true,
          pf_employer_percent: 12,
          pf_employee_percent: 12,
          esi_applicable: true,
          esi_employer_percent: 3.25,
          esi_employee_percent: 0.75,
          esi_wage_ceiling: 21000,
          professional_tax: 200,
          tds_applicable: false,
          bonus_applicable: true,
          bonus_percent_of_basic: 8.33,
          gratuity_applicable: true,
          lop_deduction_method: 'calendar_days',
        },
      },
      {
        name: 'Trainee / Contract Salary Structure',
        description: 'Stipend-based structure for trainees and contract workers. Minimal statutory obligations.',
        is_default: false,
        config: {
          basic_percent_of_ctc: 100,
          hra_percent_of_basic: 0,
          da_percent_of_basic: 0,
          conveyance_fixed: 0,
          medical_fixed: 0,
          special_allowance_balance: false,
          pf_applicable: false,
          esi_applicable: false,
          professional_tax: 0,
          tds_applicable: false,
          bonus_applicable: false,
          gratuity_applicable: false,
          lop_deduction_method: 'calendar_days',
          stipend_mode: true,
        },
      },
    ];

    // ---------- OVERTIME POLICY templates ----------
    const overtimeTemplates = [
      {
        name: 'Standard OT Policy',
        description: 'Standard overtime: 1.5x hourly rate beyond 8 hrs/day. Daily cap 3 hrs, comp-off after 5 OT days.',
        is_default: true,
        config: {
          ot_threshold_hours_per_day: 8,
          ot_rate_multiplier: 1.5,
          ot_daily_cap_hours: 3,
          ot_weekly_cap_hours: 12,
          comp_off_enabled: true,
          comp_off_after_ot_days: 5,
          ot_requires_approval: true,
          ot_approval_role: 'Department Head',
          ot_applicable: true,
        },
      },
      {
        name: 'F&B Events OT Policy',
        description: 'For F&B and Kitchen during events/banquets. 2x rate, event shift allowance Rs.500.',
        is_default: false,
        config: {
          ot_threshold_hours_per_day: 9,
          ot_rate_multiplier: 2.0,
          ot_daily_cap_hours: 6,
          ot_weekly_cap_hours: 20,
          comp_off_enabled: true,
          comp_off_after_ot_days: 3,
          ot_requires_approval: false,
          event_shift_allowance: 500,
          event_shift_allowance_currency: 'INR',
          ot_applicable: true,
        },
      },
    ];

    // ---------- SHIFT MANAGEMENT templates ----------
    const shiftManagementTemplates = [
      {
        name: 'Standard Shift Policy',
        description: 'Default shift configuration for all staff. General shift (9-6), fixed Sunday off, 10-hr minimum rest.',
        is_default: true,
        config: {
          default_shift: 'general',
          rotation_enabled: false,
          rotation_frequency_days: 0,
          night_shift_allowance: 0,
          split_shift_allowed: false,
          min_rest_hours_between_shifts: 10,
          weekly_off_pattern: 'fixed',
          weekly_offs_per_month: 4,
          flexible_timing: false,
          auto_assign_shifts: false,
          overtime_on_double_shift: true,
          handover_buffer_minutes: 15,
        },
      },
      {
        name: 'Night Rotation Shift Policy',
        description: 'For F&B, Kitchen & Security. 7-day rotation across Morning/Afternoon/Night shifts. ₹200/night allowance.',
        is_default: false,
        config: {
          default_shift: 'morning',
          rotation_enabled: true,
          rotation_frequency_days: 7,
          night_shift_allowance: 200,
          split_shift_allowed: false,
          min_rest_hours_between_shifts: 12,
          weekly_off_pattern: 'rotating',
          weekly_offs_per_month: 4,
          flexible_timing: false,
          auto_assign_shifts: true,
          overtime_on_double_shift: true,
          handover_buffer_minutes: 30,
        },
      },
      {
        name: 'Flexible Senior Shift Policy',
        description: 'For GMs and Dept Heads. Flexible timing, no mandatory rotation, staggered weekly offs.',
        is_default: false,
        config: {
          default_shift: 'general',
          rotation_enabled: false,
          rotation_frequency_days: 0,
          night_shift_allowance: 0,
          split_shift_allowed: true,
          min_rest_hours_between_shifts: 8,
          weekly_off_pattern: 'staggered',
          weekly_offs_per_month: 5,
          flexible_timing: true,
          auto_assign_shifts: false,
          overtime_on_double_shift: false,
          handover_buffer_minutes: 0,
        },
      },
    ];

    // Insert all templates and collect IDs
    const templateMap = new Map<string, string>();

    const allPolicyGroups = [
      { type: 'attendance_policy',  list: attendanceTemplates       },
      { type: 'leave_policy',       list: leaveTemplates            },
      { type: 'salary_structure',   list: salaryTemplates           },
      { type: 'overtime_policy',    list: overtimeTemplates         },
      { type: 'shift_management',   list: shiftManagementTemplates  },
    ];

    for (const group of allPolicyGroups) {
      for (const t of group.list) {
        const { rows } = await client.query(
          `INSERT INTO templates (tenant_id, template_type, name, description, config, is_default, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [tenantId, group.type, t.name, t.description, JSON.stringify(t.config), t.is_default, adminId]
        );
        templateMap.set(t.name, rows[0].id);
      }
    }

    console.log(`  → Inserted ${templateMap.size} policy templates`);

    // ---------- TEMPLATE ASSIGNMENTS ----------
    // Priority: employee (100) > designation (50) > department (30) > property (10) > default (0)
    console.log('Seeding template assignments...');

    const policyAssignments = [
      // ── ATTENDANCE POLICY ──
      // Senior Management Exemption → GM designation
      { name: 'Senior Management Exemption Policy', type: 'attendance_policy', scopeType: 'designation', scopeId: designationMap.get('General Manager')!, priority: 50 },
      // Senior Management Exemption → Dept Head designation
      { name: 'Senior Management Exemption Policy', type: 'attendance_policy', scopeType: 'designation', scopeId: designationMap.get('Department Head')!, priority: 50 },
      // F&B Strict → Kitchen dept
      { name: 'F&B Ops Strict Attendance Policy',  type: 'attendance_policy', scopeType: 'department', scopeId: departmentMap.get('KIT')!, priority: 30 },
      // F&B Strict → F&B dept
      { name: 'F&B Ops Strict Attendance Policy',  type: 'attendance_policy', scopeType: 'department', scopeId: departmentMap.get('FNB')!, priority: 30 },
      // Standard (default) → MUM-01 property fallback
      { name: 'Standard Attendance Policy',        type: 'attendance_policy', scopeType: 'property',   scopeId: propertyMap.get('MUM-01')!, priority: 10 },

      // ── LEAVE POLICY ──
      // Senior Leave → GM designation
      { name: 'Senior Executive Leave Policy',    type: 'leave_policy', scopeType: 'designation', scopeId: designationMap.get('General Manager')!, priority: 50 },
      // Senior Leave → Dept Head designation
      { name: 'Senior Executive Leave Policy',    type: 'leave_policy', scopeType: 'designation', scopeId: designationMap.get('Department Head')!, priority: 50 },
      // Trainee Leave → Trainee designation
      { name: 'Trainee / Probation Leave Policy', type: 'leave_policy', scopeType: 'designation', scopeId: designationMap.get('Trainee')!, priority: 50 },
      // Standard Leave → MUM-01 property fallback
      { name: 'Standard Leave Policy',            type: 'leave_policy', scopeType: 'property',   scopeId: propertyMap.get('MUM-01')!, priority: 10 },

      // ── SALARY STRUCTURE ──
      // GM Salary → GM designation
      { name: 'General Manager Salary Structure',    type: 'salary_structure', scopeType: 'designation', scopeId: designationMap.get('General Manager')!, priority: 50 },
      // DH/AM Salary → Dept Head designation
      { name: 'Department Head / AM Salary Structure', type: 'salary_structure', scopeType: 'designation', scopeId: designationMap.get('Department Head')!, priority: 50 },
      // Trainee Salary → Trainee designation
      { name: 'Trainee / Contract Salary Structure', type: 'salary_structure', scopeType: 'designation', scopeId: designationMap.get('Trainee')!, priority: 50 },
      // Standard Salary → EMP002 Priya Patel per-employee override (highest priority)
      { name: 'Standard Staff Salary Structure',    type: 'salary_structure', scopeType: 'employee',    scopeId: employeeMap.get('EMP002')!, priority: 100 },
      // Standard Salary → MUM-01 property fallback
      { name: 'Standard Staff Salary Structure',    type: 'salary_structure', scopeType: 'property',    scopeId: propertyMap.get('MUM-01')!, priority: 10 },

      // ── OVERTIME POLICY ──
      // F&B Events OT → Kitchen dept
      { name: 'F&B Events OT Policy',  type: 'overtime_policy', scopeType: 'department', scopeId: departmentMap.get('KIT')!, priority: 30 },
      // F&B Events OT → F&B dept
      { name: 'F&B Events OT Policy',  type: 'overtime_policy', scopeType: 'department', scopeId: departmentMap.get('FNB')!, priority: 30 },
      // Standard OT → MUM-01 property fallback
      { name: 'Standard OT Policy',    type: 'overtime_policy', scopeType: 'property',   scopeId: propertyMap.get('MUM-01')!, priority: 10 },

      // ── SHIFT MANAGEMENT ──
      // Flexible Senior Shift → GM designation
      { name: 'Flexible Senior Shift Policy',   type: 'shift_management', scopeType: 'designation', scopeId: designationMap.get('General Manager')!, priority: 50 },
      // Flexible Senior Shift → Dept Head designation
      { name: 'Flexible Senior Shift Policy',   type: 'shift_management', scopeType: 'designation', scopeId: designationMap.get('Department Head')!, priority: 50 },
      // Night Rotation Shift → Kitchen dept
      { name: 'Night Rotation Shift Policy',    type: 'shift_management', scopeType: 'department',  scopeId: departmentMap.get('KIT')!, priority: 30 },
      // Night Rotation Shift → F&B dept
      { name: 'Night Rotation Shift Policy',    type: 'shift_management', scopeType: 'department',  scopeId: departmentMap.get('FNB')!, priority: 30 },
      // Night Rotation Shift → Security dept
      { name: 'Night Rotation Shift Policy',    type: 'shift_management', scopeType: 'department',  scopeId: departmentMap.get('SEC')!, priority: 30 },
      // Standard Shift → MUM-01 property fallback
      { name: 'Standard Shift Policy',          type: 'shift_management', scopeType: 'property',    scopeId: propertyMap.get('MUM-01')!, priority: 10 },
    ];

    for (const a of policyAssignments) {
      const templateId = templateMap.get(a.name);
      if (!templateId) { console.warn(`  ⚠ Template not found for assignment: ${a.name}`); continue; }
      await client.query(
        `INSERT INTO template_assignments (tenant_id, template_id, template_type, scope_type, scope_id, priority, effective_from)
         VALUES ($1, $2, $3, $4, $5, $6, '2026-01-01')`,
        [tenantId, templateId, a.type, a.scopeType, a.scopeId, a.priority]
      );
    }

    console.log(`  → Inserted ${policyAssignments.length} policy assignments`);

    // 30. Finance Invoices, Bills, Payments, Cashbook, Budgets
    console.log('Seeding new Finance module tables (Invoices, Bills, Cashbook, Budgets)...');

    // Budgets
    const budgetsData = [
      { name: 'Quarterly Executive Travel', dept: 'FA', cat: 'travel', allocated: 50000.00, notes: 'Quarterly travel budget for executives.' },
      { name: 'Client Hospitality & Dinners', dept: 'SM', cat: 'meals', allocated: 10000.00, notes: 'Sales client entertainment and dining allowances.' },
      { name: 'F&B Kitchen Inventory', dept: 'KIT', cat: 'kitchen', allocated: 200000.00, notes: 'Raw ingredients and premium grocery procurement.' },
      { name: 'Stationery and Audit Supplies', dept: 'FA', cat: 'office', allocated: 20000.00, notes: 'Office printing, tax filing, and paper supplies.' },
    ];
    for (const b of budgetsData) {
      await client.query(
        `INSERT INTO budgets (tenant_id, name, department, category, period_start, period_end, allocated, notes, created_by)
         VALUES ($1, $2, $3, $4, '2026-05-01', '2026-05-31', $5, $6, $7)`,
        [tenantId, b.name, b.dept, b.cat, b.allocated, b.notes, adminId]
      );
    }
    console.log('  → Budgets seeded');

    // Invoices & Line Items
    const { rows: inv1 } = await client.query(
      `INSERT INTO invoices (tenant_id, invoice_number, customer_name, customer_email, customer_phone, customer_address, customer_gstin,
        issue_date, due_date, currency, subtotal, discount_amount, tax_amount, total_amount, amount_paid, notes, terms, status, source, created_by)
       VALUES ($1, 'INV-2026-0001', 'John Miller', 'john.miller@gmail.com', '9812739810', 'Flat 405, Lotus Apartments, Mumbai', '27AABCU1234N1ZS',
        '2026-05-18', '2026-06-18', 'INR', 12500.00, 0.00, 2250.00, 14750.00, 14750.00, 'Thank you for staying at Grand Palace Hotel.', 'Due within 30 days.', 'paid', 'manual', $2)
       RETURNING id`,
      [tenantId, adminId]
    );
    const invoice1Id = inv1[0].id;

    await client.query(
      `INSERT INTO invoice_line_items (tenant_id, invoice_id, description, quantity, unit, unit_price, discount_pct, tax_rate, amount, sort_order)
       VALUES 
        ($1, $2, 'Deluxe Suite Stay (2 Nights)', 2, 'nos', 6000.00, 0, 18, 14160.00, 0),
        ($1, $2, 'Continental Breakfast', 1, 'nos', 500.00, 0, 18, 590.00, 1)`,
      [tenantId, invoice1Id]
    );

    const { rows: inv2 } = await client.query(
      `INSERT INTO invoices (tenant_id, invoice_number, customer_name, customer_email, customer_phone, customer_address, customer_gstin,
        issue_date, due_date, currency, subtotal, discount_amount, tax_amount, total_amount, amount_paid, notes, terms, status, source, created_by)
       VALUES ($1, 'INV-2026-0002', 'Sarah Connor', 'sarah@resistance.org', '9000000102', 'Sector 4, Cyberdyne Lane, Pune', NULL,
        '2026-05-21', '2026-06-21', 'INR', 10000.00, 0.00, 1800.00, 11800.00, 0.00, 'Hall booking for corporate training.', 'Net 30 terms.', 'sent', 'manual', $2)
       RETURNING id`,
      [tenantId, adminId]
    );
    const invoice2Id = inv2[0].id;

    await client.query(
      `INSERT INTO invoice_line_items (tenant_id, invoice_id, description, quantity, unit, unit_price, discount_pct, tax_rate, amount, sort_order)
       VALUES ($1, $2, 'Royal Suite Conference Hall Booking', 1, 'nos', 10000.00, 0, 18, 11800.00, 0)`,
      [tenantId, invoice2Id]
    );

    const { rows: inv3 } = await client.query(
      `INSERT INTO invoices (tenant_id, invoice_number, customer_name, customer_email, customer_phone, customer_address, customer_gstin,
        issue_date, due_date, currency, subtotal, discount_amount, tax_amount, total_amount, amount_paid, notes, terms, status, source, created_by)
       VALUES ($1, 'INV-2026-0003', 'Bruce Wayne', 'bruce@waynecorp.com', '9999999999', 'Wayne Manor, Gotham City', '27AABCU9999R1ZS',
        '2026-05-20', '2026-05-25', 'INR', 28601.69, 0.00, 5148.31, 33750.00, 10000.00, 'VIP suite guest charges.', 'Pay immediately.', 'sent', 'manual', $2)
       RETURNING id`,
      [tenantId, adminId]
    );
    const invoice3Id = inv3[0].id;

    await client.query(
      `INSERT INTO invoice_line_items (tenant_id, invoice_id, description, quantity, unit, unit_price, discount_pct, tax_rate, amount, sort_order)
       VALUES ($1, $2, 'VIP Accommodation Services', 1, 'nos', 28601.69, 0, 18, 33750.00, 0)`,
      [tenantId, invoice3Id]
    );
    console.log('  → Invoices & Line Items seeded');

    // Vendor Bills & Line Items
    const { rows: b1 } = await client.query(
      `INSERT INTO vendor_bills (tenant_id, bill_number, vendor_name, vendor_email, vendor_gstin, bill_date, due_date,
        subtotal, tax_amount, total_amount, amount_paid, notes, status, source, created_by)
       VALUES ($1, 'BILL-2026-0001', 'Metro Foods Wholesalers', 'orders@metrofoods.com', '27AABFM4432K1ZS',
        '2026-05-10', '2026-05-30', 45000.00, 0.00, 45000.00, 45000.00, 'Bulk vegetable kitchen supplies.', 'paid', 'manual', $2)
       RETURNING id`,
      [tenantId, adminId]
    );
    const bill1Id = b1[0].id;

    await client.query(
      `INSERT INTO vendor_bill_line_items (tenant_id, bill_id, description, quantity, unit, unit_price, tax_rate, amount, sort_order)
       VALUES ($1, $2, 'Fresh Vegetables & Organic Fruit Procurement', 1, 'nos', 45000.00, 0, 45000.00, 0)`,
      [tenantId, bill1Id]
    );

    const { rows: b2 } = await client.query(
      `INSERT INTO vendor_bills (tenant_id, bill_number, vendor_name, vendor_email, vendor_gstin, bill_date, due_date,
        subtotal, tax_amount, total_amount, amount_paid, notes, status, source, approved_by, approved_at, created_by)
       VALUES ($1, 'BILL-2026-0002', 'Sparkle Linen Laundry', 'info@sparklelinen.com', '27AABFS8812C1ZS',
        '2026-05-18', '2026-06-18', 10000.00, 1800.00, 11800.00, 0.00, 'Laundry bills for rooms division.', 'approved', 'manual', $2, now(), $2)
       RETURNING id`,
      [tenantId, adminId]
    );
    const bill2Id = b2[0].id;

    await client.query(
      `INSERT INTO vendor_bill_line_items (tenant_id, bill_id, description, quantity, unit, unit_price, tax_rate, amount, sort_order)
       VALUES ($1, $2, 'Bed Linen Dry Cleaning & Ironing Services', 1, 'nos', 10000.00, 18, 11800.00, 0)`,
      [tenantId, bill2Id]
    );

    const { rows: b3 } = await client.query(
      `INSERT INTO vendor_bills (tenant_id, bill_number, vendor_name, vendor_email, vendor_gstin, bill_date, due_date,
        subtotal, tax_amount, total_amount, amount_paid, notes, status, source, created_by)
       VALUES ($1, 'BILL-2026-0003', 'Apex Facility Management', 'billing@apexfacilities.com', NULL,
        '2026-05-24', '2026-06-24', 8500.00, 0.00, 8500.00, 0.00, 'Security deployment request.', 'pending', 'manual', $2)
       RETURNING id`,
      [tenantId, adminId]
    );
    const bill3Id = b3[0].id;

    await client.query(
      `INSERT INTO vendor_bill_line_items (tenant_id, bill_id, description, quantity, unit, unit_price, tax_rate, amount, sort_order)
       VALUES ($1, $2, 'Special Security Guard Deployment (Weekend Event)', 1, 'nos', 8500.00, 0, 8500.00, 0)`,
      [tenantId, bill3Id]
    );
    console.log('  → Vendor Bills & Line Items seeded');

    // Payments (received & made)
    await client.query(
      `INSERT INTO finance_payments (tenant_id, payment_type, payment_date, amount, currency, payment_method, reference, notes, invoice_id, created_by)
       VALUES 
        ($1, 'received', '2026-05-20', 14750.00, 'INR', 'card', 'TXN-FOL-98765', 'Fully paid guest folio invoice.', $2, $3),
        ($1, 'received', '2026-05-22', 10000.00, 'INR', 'upi', 'UPI-9821849102', 'Partial payment on corporate account.', $4, $3)`,
      [tenantId, invoice1Id, adminId, invoice3Id]
    );

    await client.query(
      `INSERT INTO finance_payments (tenant_id, payment_type, payment_date, amount, currency, payment_method, reference, notes, bill_id, created_by)
       VALUES ($1, 'made', '2026-05-15', 45000.00, 'INR', 'bank', 'NEFT-METRO-99882', 'Bulk vegetable supplier NEFT.', $2, $3)`,
      [tenantId, bill1Id, adminId]
    );
    console.log('  → Finance Payments seeded');

    // Cashbook Entries
    const cashbookEntries = [
      { type: 'receipt', date: '2026-05-01', cat: 'sales', amt: 150000.00, desc: 'Cash advance for corporate event booking', ref: 'UPI-ADV-8891' },
      { type: 'payment', date: '2026-05-03', cat: 'rent', amt: 30000.00, desc: 'Monthly office space rent payment', ref: 'NEFT-RENT-001' },
      { type: 'payment', date: '2026-05-05', cat: 'salary', amt: 50000.00, desc: 'Staff casual wages payout for April', ref: 'BANK-SAL-991' },
      { type: 'receipt', date: '2026-05-10', cat: 'sales', amt: 25000.00, desc: 'Restaurant cash counter collection', ref: 'CASH-REG-01', acct: 'cash' },
      { type: 'payment', date: '2026-05-12', cat: 'misc', amt: 4500.00, desc: 'Kitchen diesel generator fuel refilling', ref: 'CASH-PETTY-22', acct: 'cash' },
      { type: 'receipt', date: '2026-05-15', cat: 'sales', amt: 8500.00, desc: 'Banquet hall sound system rent receipt', ref: 'CHQ-SOUND-772' },
      { type: 'payment', date: '2026-05-20', cat: 'purchase', amt: 12000.00, desc: 'Office stationery and ink toner purchase', ref: 'CARD-OFFICE-881' },
      { type: 'receipt', date: '2026-05-24', cat: 'sales', amt: 34000.00, desc: 'Spa counter cash & UPI billing', ref: 'UPI-SPA-8892' }
    ];
    for (const c of cashbookEntries) {
      await client.query(
        `INSERT INTO cashbook_entries (tenant_id, entry_date, entry_type, category, description, reference, amount, account, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenantId, c.date, c.type, c.cat, c.desc, c.ref, c.amt, c.acct || 'main', adminId]
      );
    }
    console.log('  → Cashbook Entries seeded');

    // Backfill Branches from Properties
    console.log('Backfilling branches from properties...');
    await client.query(`
      INSERT INTO branches (
        tenant_id,
        name,
        code,
        branch_type,
        address,
        gstin,
        timezone,
        geo_lat,
        geo_lng,
        geofence_radius_meters,
        status,
        is_active,
        property_id,
        created_at,
        updated_at
      )
      SELECT
        p.tenant_id,
        p.name,
        p.code,
        COALESCE(p.property_type, 'main'),
        p.address,
        p.gstin,
        COALESCE(p.timezone, 'Asia/Kolkata'),
        p.geo_lat,
        p.geo_lng,
        COALESCE(p.geofence_radius_meters, 200),
        CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END,
        p.is_active,
        p.id,
        p.created_at,
        p.updated_at
      FROM properties p
      WHERE p.deleted_at IS NULL
      ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING
    `);
    console.log('  → Branches backfilled successfully');

    console.log('Linking departments and employees to branches...');
    await client.query(`
      UPDATE departments d
      SET    branch_id = b.id
      FROM   branches b
      WHERE  b.property_id = d.property_id
        AND  d.deleted_at IS NULL
    `);
    await client.query(`
      UPDATE employees e
      SET    branch_id = b.id
      FROM   branches b
      WHERE  b.property_id = e.property_id
        AND  e.deleted_at IS NULL
    `);
    console.log('  → Linked departments and employees successfully');

    await client.query('COMMIT');
    console.log('\n=========================================');
    console.log('ALL MODULE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('=========================================');
    console.log('Test Account Credentials:');
    console.log('  Portal Login Email : admin@demo.com');
    console.log('  Portal Login Password : Admin@1234');
    console.log('  Tenant Slug ID : demo-hotel');
    console.log('=========================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fatal seeding error occurred, database has been rolled back:');
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Seed process crashed:');
  console.error(e);
  process.exit(1);
});
