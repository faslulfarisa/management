import { ExportRegistryService } from './export-registry.service';
import { PERMISSIONS } from '../../shared/permissions.constants';

/**
 * Registers every module's export configuration with the central registry.
 *
 * Each registration is a static config object — no business logic, no duplicated
 * queries. Future modules only need to add a block here + drop `<ExportButton>`
 * into their frontend page.
 */
export function registerAllExportConfigs(registry: ExportRegistryService): void {
  // ── Employees ───────────────────────────────────────────────────────────────
  registry.register({
    module: 'employees',
    title: 'Employee Master',
    permission: PERMISSIONS.EMPLOYEES_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id AND b.tenant_id = e.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = e.tenant_id
      LEFT JOIN designations dg ON dg.id = e.designation_id AND dg.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1
    `,
    tenantColumn: 'e.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'employee_code', header: 'Employee Code', dbExpression: 'e.employee_code' },
      { key: 'full_name', header: 'Name', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'first_name', header: 'First Name', dbExpression: 'e.first_name' },
      { key: 'last_name', header: 'Last Name', dbExpression: 'e.last_name' },
      { key: 'gender', header: 'Gender', dbExpression: 'e.gender' },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'department_name', header: 'Department', dbExpression: 'd.name' },
      { key: 'designation_name', header: 'Designation', dbExpression: 'dg.name' },
      { key: 'status', header: 'Status', dbExpression: 'e.status' },
      { key: 'date_of_joining', header: 'Joining Date', dbExpression: 'e.date_of_joining', type: 'date' },
      { key: 'date_of_birth', header: 'Date of Birth', dbExpression: 'e.date_of_birth', type: 'date', sensitive: true },
      { key: 'personal_email', header: 'Email', dbExpression: 'e.personal_email', sensitive: true },
      { key: 'personal_phone', header: 'Phone', dbExpression: 'e.personal_phone', sensitive: true },
      { key: 'pan_number', header: 'PAN', dbExpression: 'e.pan_number', sensitive: true },
      { key: 'aadhaar_number', header: 'Aadhaar', dbExpression: 'e.aadhaar_number', sensitive: true },
      { key: 'created_at', header: 'Created At', dbExpression: 'e.created_at', type: 'date' },
    ],
    defaultColumns: ['employee_code', 'full_name', 'branch_name', 'department_name', 'designation_name', 'status', 'date_of_joining'],
    filterMap: {
      search: "(e.first_name ILIKE $N OR e.last_name ILIKE $N OR e.employee_code ILIKE $N)",
      status: 'e.status = $N',
      branch_id: 'e.branch_id = $N',
      department_id: 'e.department_id = $N',
    },
    defaultOrderBy: 'e.employee_code ASC',
  });

  // ── Attendance ──────────────────────────────────────────────────────────────
  registry.register({
    module: 'attendance',
    title: 'Attendance Records',
    permission: PERMISSIONS.ATTENDANCE_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM attendance_records ar
      LEFT JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
      LEFT JOIN branches b ON b.id = e.branch_id AND b.tenant_id = ar.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = ar.tenant_id
      WHERE ar.tenant_id = $1
    `,
    tenantColumn: 'ar.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'employee_code', header: 'Employee Code', dbExpression: 'e.employee_code' },
      { key: 'employee_name', header: 'Employee Name', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'department_name', header: 'Department', dbExpression: 'd.name' },
      { key: 'date', header: 'Date', dbExpression: 'ar.date', type: 'date' },
      { key: 'status', header: 'Status', dbExpression: 'ar.status' },
      { key: 'clock_in', header: 'Clock In', dbExpression: 'ar.clock_in' },
      { key: 'clock_out', header: 'Clock Out', dbExpression: 'ar.clock_out' },
      { key: 'worked_hours', header: 'Worked Hours', dbExpression: 'ar.worked_hours', type: 'number' },
      { key: 'overtime_minutes', header: 'OT (min)', dbExpression: 'ar.overtime_minutes', type: 'number' },
      { key: 'late_minutes', header: 'Late (min)', dbExpression: 'ar.late_minutes', type: 'number' },
      { key: 'early_leave_minutes', header: 'Early Leave (min)', dbExpression: 'ar.early_leave_minutes', type: 'number' },
      { key: 'source', header: 'Source', dbExpression: 'ar.source' },
    ],
    defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'date', 'status', 'clock_in', 'clock_out', 'worked_hours'],
    filterMap: {
      search: "(e.first_name ILIKE $N OR e.last_name ILIKE $N OR e.employee_code ILIKE $N)",
      status: 'ar.status = $N',
      branch_id: 'e.branch_id = $N',
      department_id: 'e.department_id = $N',
      employee_id: 'ar.employee_id = $N',
      date_from: 'ar.date >= $N',
      date_to: 'ar.date <= $N',
    },
    defaultOrderBy: 'ar.date DESC, e.employee_code ASC',
  });

  // ── Leave Requests ──────────────────────────────────────────────────────────
  registry.register({
    module: 'leave_requests',
    title: 'Leave Requests',
    permission: PERMISSIONS.LEAVE_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM leave_requests lr
      LEFT JOIN employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
      LEFT JOIN branches b ON b.id = e.branch_id AND b.tenant_id = lr.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = lr.tenant_id
      LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id AND lt.tenant_id = lr.tenant_id
      WHERE lr.tenant_id = $1
    `,
    tenantColumn: 'lr.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'employee_code', header: 'Employee Code', dbExpression: 'e.employee_code' },
      { key: 'employee_name', header: 'Employee Name', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'department_name', header: 'Department', dbExpression: 'd.name' },
      { key: 'leave_type', header: 'Leave Type', dbExpression: 'lt.name' },
      { key: 'start_date', header: 'Start Date', dbExpression: 'lr.start_date', type: 'date' },
      { key: 'end_date', header: 'End Date', dbExpression: 'lr.end_date', type: 'date' },
      { key: 'days', header: 'Days', dbExpression: 'lr.days', type: 'number' },
      { key: 'status', header: 'Status', dbExpression: 'lr.status' },
      { key: 'reason', header: 'Reason', dbExpression: 'lr.reason' },
      { key: 'created_at', header: 'Applied On', dbExpression: 'lr.created_at', type: 'date' },
    ],
    defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'leave_type', 'start_date', 'end_date', 'days', 'status'],
    filterMap: {
      search: "(e.first_name ILIKE $N OR e.last_name ILIKE $N OR e.employee_code ILIKE $N)",
      status: 'lr.status = $N',
      branch_id: 'e.branch_id = $N',
      department_id: 'e.department_id = $N',
      employee_id: 'lr.employee_id = $N',
      leave_type_id: 'lr.leave_type_id = $N',
      date_from: 'lr.start_date >= $N',
      date_to: 'lr.end_date <= $N',
    },
    defaultOrderBy: 'lr.created_at DESC',
  });

  // ── Payroll Runs ────────────────────────────────────────────────────────────
  registry.register({
    module: 'payroll',
    title: 'Payroll',
    permission: PERMISSIONS.PAYROLL_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM payslips p
      LEFT JOIN employees e ON e.id = p.employee_id AND e.tenant_id = p.tenant_id
      LEFT JOIN branches b ON b.id = COALESCE(p.branch_id, e.branch_id) AND b.tenant_id = p.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = p.tenant_id
      LEFT JOIN payroll_attendance_summary pas
        ON pas.tenant_id = p.tenant_id
       AND pas.employee_id = p.employee_id
       AND pas.period_start = make_date(p.year, p.month, 1)
       AND pas.period_end = (make_date(p.year, p.month, 1) + INTERVAL '1 month - 1 day')::date
      WHERE p.tenant_id = $1
    `,
    tenantColumn: 'p.tenant_id',
    branchColumn: 'COALESCE(p.branch_id, e.branch_id)',
    columns: [
      { key: 'employee_code', header: 'Employee Code', dbExpression: 'e.employee_code' },
      { key: 'employee_name', header: 'Employee Name', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'department_name', header: 'Department', dbExpression: 'd.name' },
      { key: 'month', header: 'Month', dbExpression: 'p.month', type: 'number' },
      { key: 'year', header: 'Year', dbExpression: 'p.year', type: 'number' },
      { key: 'basic_salary', header: 'Basic Salary', dbExpression: 'p.basic', type: 'currency' },
      { key: 'gross_salary', header: 'Gross Salary', dbExpression: 'p.gross_salary', type: 'currency' },
      { key: 'total_deductions', header: 'Deductions', dbExpression: 'p.total_deductions', type: 'currency' },
      { key: 'net_salary', header: 'Net Salary', dbExpression: 'p.net_salary', type: 'currency' },
      { key: 'status', header: 'Status', dbExpression: 'p.status' },
      { key: 'paid_days', header: 'Paid Days', dbExpression: 'pas.payable_days', type: 'number' },
      { key: 'lop_days', header: 'LOP Days', dbExpression: 'pas.unpaid_leave_days', type: 'number' },
    ],
    defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'month', 'year', 'gross_salary', 'total_deductions', 'net_salary', 'status'],
    filterMap: {
      search: "(e.first_name ILIKE $N OR e.last_name ILIKE $N OR e.employee_code ILIKE $N)",
      status: 'p.status = $N',
      branch_id: 'COALESCE(p.branch_id, e.branch_id) = $N',
      department_id: 'e.department_id = $N',
      employee_id: 'p.employee_id = $N',
      month: 'p.month = $N',
      year: 'p.year = $N',
    },
    defaultOrderBy: 'p.year DESC, p.month DESC, e.employee_code ASC',
  });

  // ── Compliance Documents ────────────────────────────────────────────────────
  registry.register({
    module: 'compliance_documents',
    title: 'Compliance Documents',
    permission: PERMISSIONS.COMPLIANCE_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM compliance_documents cd
      LEFT JOIN employees e ON e.id = cd.employee_id AND e.tenant_id = cd.tenant_id
      LEFT JOIN branches b ON b.id = e.branch_id AND b.tenant_id = cd.tenant_id
      WHERE cd.tenant_id = $1
    `,
    tenantColumn: 'cd.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'employee_code', header: 'Employee Code', dbExpression: 'e.employee_code' },
      { key: 'employee_name', header: 'Employee Name', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'document_type', header: 'Document Type', dbExpression: 'cd.document_type' },
      { key: 'document_name', header: 'Document Name', dbExpression: 'cd.document_name' },
      { key: 'status', header: 'Status', dbExpression: 'cd.status' },
      { key: 'expiry_date', header: 'Expiry Date', dbExpression: 'cd.expiry_date', type: 'date' },
      { key: 'uploaded_at', header: 'Uploaded At', dbExpression: 'cd.created_at', type: 'date' },
    ],
    defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'document_type', 'document_name', 'status', 'expiry_date'],
    filterMap: {
      search: "(e.first_name ILIKE $N OR e.last_name ILIKE $N OR cd.document_name ILIKE $N)",
      status: 'cd.status = $N',
      branch_id: 'e.branch_id = $N',
      document_type: 'cd.document_type = $N',
    },
    defaultOrderBy: 'cd.created_at DESC',
  });

  // ── Performance Reviews ─────────────────────────────────────────────────────
  registry.register({
    module: 'performance_reviews',
    title: 'Performance Reviews',
    permission: PERMISSIONS.PERFORMANCE_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM performance_reviews prv
      LEFT JOIN employees e ON e.id = prv.employee_id AND e.tenant_id = prv.tenant_id
      LEFT JOIN branches b ON b.id = e.branch_id AND b.tenant_id = prv.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = prv.tenant_id
      WHERE prv.tenant_id = $1
    `,
    tenantColumn: 'prv.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'employee_code', header: 'Employee Code', dbExpression: 'e.employee_code' },
      { key: 'employee_name', header: 'Employee Name', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'department_name', header: 'Department', dbExpression: 'd.name' },
      { key: 'review_period', header: 'Review Period', dbExpression: 'prv.review_period' },
      { key: 'overall_rating', header: 'Overall Rating', dbExpression: 'prv.overall_rating', type: 'number' },
      { key: 'status', header: 'Status', dbExpression: 'prv.status' },
      { key: 'reviewed_by', header: 'Reviewed By', dbExpression: 'prv.reviewed_by' },
      { key: 'review_date', header: 'Review Date', dbExpression: 'prv.review_date', type: 'date' },
    ],
    defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'department_name', 'review_period', 'overall_rating', 'status'],
    filterMap: {
      search: "(e.first_name ILIKE $N OR e.last_name ILIKE $N OR e.employee_code ILIKE $N)",
      status: 'prv.status = $N',
      branch_id: 'e.branch_id = $N',
      department_id: 'e.department_id = $N',
    },
    defaultOrderBy: 'prv.review_date DESC',
  });

  // ── Assets ──────────────────────────────────────────────────────────────────
  registry.register({
    module: 'assets',
    title: 'Assets',
    permission: PERMISSIONS.ASSETS_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM assets a
      LEFT JOIN employees e ON e.id = a.assigned_to AND e.tenant_id = a.tenant_id
      LEFT JOIN branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
    `,
    tenantColumn: 'a.tenant_id',
    branchColumn: 'a.branch_id',
    columns: [
      { key: 'asset_code', header: 'Asset Code', dbExpression: 'a.asset_code' },
      { key: 'name', header: 'Asset Name', dbExpression: 'a.name' },
      { key: 'category', header: 'Category', dbExpression: 'a.category' },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'status', header: 'Status', dbExpression: 'a.status' },
      { key: 'assigned_to_name', header: 'Assigned To', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'purchase_date', header: 'Purchase Date', dbExpression: 'a.purchase_date', type: 'date' },
      { key: 'purchase_cost', header: 'Purchase Cost', dbExpression: 'a.purchase_cost', type: 'currency' },
      { key: 'serial_number', header: 'Serial Number', dbExpression: 'a.serial_number' },
    ],
    defaultColumns: ['asset_code', 'name', 'category', 'branch_name', 'status', 'assigned_to_name', 'purchase_date'],
    filterMap: {
      search: "(a.name ILIKE $N OR a.asset_code ILIKE $N)",
      status: 'a.status = $N',
      branch_id: 'a.branch_id = $N',
      category: 'a.category = $N',
    },
    defaultOrderBy: 'a.created_at DESC',
  });

  // ── Users ───────────────────────────────────────────────────────────────────
  registry.register({
    module: 'users',
    title: 'Users',
    permission: PERMISSIONS.PLATFORM_USERS_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id AND e.tenant_id = u.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = u.tenant_id
      LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = u.tenant_id
      LEFT JOIN branches b ON b.id = e.branch_id AND b.tenant_id = u.tenant_id
      WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_internal_staff = false
    `,
    tenantColumn: 'u.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'email', header: 'Email', dbExpression: 'u.email' },
      { key: 'full_name', header: 'Name', dbExpression: "COALESCE(CONCAT(e.first_name, ' ', e.last_name), u.email)" },
      { key: 'user_type', header: 'User Type', dbExpression: "CASE WHEN u.is_super_admin THEN 'super_admin' ELSE COALESCE(ut.user_type, 'employee') END" },
      { key: 'department', header: 'Department', dbExpression: 'd.name' },
      { key: 'role', header: 'Role', dbExpression: "(SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND ur.tenant_id = u.tenant_id LIMIT 1)" },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'status', header: 'Status', dbExpression: 'u.status' },
      { key: 'is_active', header: 'Active', dbExpression: 'u.is_active', type: 'boolean' },
      { key: 'mfa_enabled', header: 'MFA', dbExpression: 'u.mfa_enabled', type: 'boolean' },
      { key: 'last_login', header: 'Last Login', dbExpression: 'u.last_login_at', type: 'date' },
      { key: 'created_at', header: 'Created At', dbExpression: 'u.created_at', type: 'date' },
    ],
    defaultColumns: ['email', 'full_name', 'user_type', 'branch_name', 'status', 'mfa_enabled', 'last_login'],
    filterMap: {
      search: "(u.email ILIKE $N OR u.phone ILIKE $N OR e.first_name ILIKE $N OR e.last_name ILIKE $N OR d.name ILIKE $N)",
      status: 'u.status = $N',
      is_active: 'u.is_active = $N',
      mfa_enabled: 'u.mfa_enabled = $N',
      role: "EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND ur.tenant_id = u.tenant_id AND r.name = $N)",
      user_type: "CASE WHEN u.is_super_admin THEN 'super_admin' ELSE COALESCE(ut.user_type, 'employee') END = $N",
      branch_id: 'e.branch_id = $N',
    },
    defaultOrderBy: 'u.created_at DESC',
  });

  // ── Audit Logs ──────────────────────────────────────────────────────────────
  registry.register({
    module: 'audit_logs',
    title: 'Audit Logs',
    permission: PERMISSIONS.AUDIT_LOGS_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE al.tenant_id = $1
    `,
    tenantColumn: 'al.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'created_at', header: 'Timestamp', dbExpression: 'al.created_at', type: 'date' },
      { key: 'user_email', header: 'User', dbExpression: 'u.email' },
      { key: 'entity_type', header: 'Entity Type', dbExpression: 'al.entity_type' },
      { key: 'action', header: 'Action', dbExpression: 'al.action' },
      { key: 'entity_id', header: 'Entity ID', dbExpression: 'al.entity_id' },
      { key: 'ip_address', header: 'IP Address', dbExpression: 'al.ip_address' },
    ],
    defaultColumns: ['created_at', 'user_email', 'entity_type', 'action', 'entity_id'],
    filterMap: {
      entity_type: 'al.entity_type = $N',
      action: 'al.action = $N',
      user_id: 'al.user_id = $N',
      date_from: 'al.created_at >= $N',
      date_to: 'al.created_at <= $N',
    },
    defaultOrderBy: 'al.created_at DESC',
  });

  // ── Recruitment — Vacancies ─────────────────────────────────────────────────
  registry.register({
    module: 'vacancies',
    title: 'Vacancies',
    permission: PERMISSIONS.RECRUITMENT_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM vacancies v
      LEFT JOIN branches b ON b.id = v.branch_id AND b.tenant_id = v.tenant_id
      LEFT JOIN departments d ON d.id = v.department_id AND d.tenant_id = v.tenant_id
      WHERE v.tenant_id = $1
    `,
    tenantColumn: 'v.tenant_id',
    branchColumn: 'v.branch_id',
    columns: [
      { key: 'title', header: 'Title', dbExpression: 'v.title' },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'department_name', header: 'Department', dbExpression: 'd.name' },
      { key: 'positions', header: 'Positions', dbExpression: 'v.positions', type: 'number' },
      { key: 'status', header: 'Status', dbExpression: 'v.status' },
      { key: 'priority', header: 'Priority', dbExpression: 'v.priority' },
      { key: 'created_at', header: 'Created At', dbExpression: 'v.created_at', type: 'date' },
      { key: 'closing_date', header: 'Closing Date', dbExpression: 'v.closing_date', type: 'date' },
    ],
    defaultColumns: ['title', 'branch_name', 'department_name', 'positions', 'status', 'priority', 'closing_date'],
    filterMap: {
      search: "(v.title ILIKE $N)",
      status: 'v.status = $N',
      branch_id: 'v.branch_id = $N',
      department_id: 'v.department_id = $N',
    },
    defaultOrderBy: 'v.created_at DESC',
  });

  // ── Recruitment — Candidates ────────────────────────────────────────────────
  registry.register({
    module: 'candidates',
    title: 'Candidates',
    permission: PERMISSIONS.RECRUITMENT_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM candidates c
      LEFT JOIN vacancies v ON v.id = c.vacancy_id AND v.tenant_id = c.tenant_id
      WHERE c.tenant_id = $1
    `,
    tenantColumn: 'c.tenant_id',
    columns: [
      { key: 'full_name', header: 'Name', dbExpression: "CONCAT(c.first_name, ' ', c.last_name)" },
      { key: 'email', header: 'Email', dbExpression: 'c.email' },
      { key: 'phone', header: 'Phone', dbExpression: 'c.phone' },
      { key: 'vacancy_title', header: 'Vacancy', dbExpression: 'v.title' },
      { key: 'stage', header: 'Stage', dbExpression: 'c.stage' },
      { key: 'status', header: 'Status', dbExpression: 'c.status' },
      { key: 'source', header: 'Source', dbExpression: 'c.source' },
      { key: 'applied_at', header: 'Applied At', dbExpression: 'c.created_at', type: 'date' },
    ],
    defaultColumns: ['full_name', 'email', 'vacancy_title', 'stage', 'status', 'source', 'applied_at'],
    filterMap: {
      search: "(c.first_name ILIKE $N OR c.last_name ILIKE $N OR c.email ILIKE $N)",
      status: 'c.status = $N',
      stage: 'c.stage = $N',
      vacancy_id: 'c.vacancy_id = $N',
    },
    defaultOrderBy: 'c.created_at DESC',
  });

  // ── Finance — Invoices ──────────────────────────────────────────────────────
  registry.register({
    module: 'finance_invoices',
    title: 'Invoices',
    permission: PERMISSIONS.FINANCE_INVOICES_EXPORT,
    baseQuery: `
      SELECT {columns}
      FROM invoices inv
      LEFT JOIN branches b ON b.id = inv.branch_id AND b.tenant_id = inv.tenant_id
      WHERE inv.tenant_id = $1
    `,
    tenantColumn: 'inv.tenant_id',
    branchColumn: 'inv.branch_id',
    columns: [
      { key: 'invoice_number', header: 'Invoice #', dbExpression: 'inv.invoice_number' },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'client_name', header: 'Client', dbExpression: 'inv.client_name' },
      { key: 'invoice_date', header: 'Invoice Date', dbExpression: 'inv.invoice_date', type: 'date' },
      { key: 'due_date', header: 'Due Date', dbExpression: 'inv.due_date', type: 'date' },
      { key: 'total_amount', header: 'Amount', dbExpression: 'inv.total_amount', type: 'currency' },
      { key: 'status', header: 'Status', dbExpression: 'inv.status' },
    ],
    defaultColumns: ['invoice_number', 'branch_name', 'client_name', 'invoice_date', 'due_date', 'total_amount', 'status'],
    filterMap: {
      search: "(inv.invoice_number ILIKE $N OR inv.client_name ILIKE $N)",
      status: 'inv.status = $N',
      branch_id: 'inv.branch_id = $N',
      date_from: 'inv.invoice_date >= $N',
      date_to: 'inv.invoice_date <= $N',
    },
    defaultOrderBy: 'inv.invoice_date DESC',
  });

  // ── Exit Management ─────────────────────────────────────────────────────────
  registry.register({
    module: 'exit_cases',
    title: 'Exit Management',
    permission: PERMISSIONS.EXIT_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM exit_cases ec
      LEFT JOIN employees e ON e.id = ec.employee_id AND e.tenant_id = ec.tenant_id
      LEFT JOIN branches b ON b.id = e.branch_id AND b.tenant_id = ec.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = ec.tenant_id
      WHERE ec.tenant_id = $1
    `,
    tenantColumn: 'ec.tenant_id',
    branchColumn: 'e.branch_id',
    columns: [
      { key: 'employee_code', header: 'Employee Code', dbExpression: 'e.employee_code' },
      { key: 'employee_name', header: 'Employee Name', dbExpression: "CONCAT(e.first_name, ' ', e.last_name)" },
      { key: 'branch_name', header: 'Branch', dbExpression: 'b.name' },
      { key: 'department_name', header: 'Department', dbExpression: 'd.name' },
      { key: 'exit_type', header: 'Exit Type', dbExpression: 'ec.exit_type' },
      { key: 'status', header: 'Status', dbExpression: 'ec.status' },
      { key: 'resignation_date', header: 'Resignation Date', dbExpression: 'ec.resignation_date', type: 'date' },
      { key: 'last_working_date', header: 'Last Working Date', dbExpression: 'ec.last_working_date', type: 'date' },
      { key: 'reason', header: 'Reason', dbExpression: 'ec.reason' },
    ],
    defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'exit_type', 'status', 'resignation_date', 'last_working_date'],
    filterMap: {
      search: "(e.first_name ILIKE $N OR e.last_name ILIKE $N OR e.employee_code ILIKE $N)",
      status: 'ec.status = $N',
      branch_id: 'e.branch_id = $N',
      exit_type: 'ec.exit_type = $N',
    },
    defaultOrderBy: 'ec.created_at DESC',
  });

  // ── Platform — Branches ──────────────────────────────────────────────────────
  registry.register({
    module: 'branches',
    title: 'Branches',
    permission: PERMISSIONS.PLATFORM_ORGANIZATIONS_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM branches b
      LEFT JOIN areas a ON a.id = b.area_id AND a.tenant_id = b.tenant_id
      WHERE b.tenant_id = $1
    `,
    tenantColumn: 'b.tenant_id',
    branchColumn: 'b.id', // self
    columns: [
      { key: 'name', header: 'Branch Name', dbExpression: 'b.name' },
      { key: 'code', header: 'Branch Code', dbExpression: 'b.code' },
      { key: 'area_name', header: 'Area', dbExpression: 'a.name' },
      { key: 'is_active', header: 'Active', dbExpression: 'b.is_active', type: 'boolean' },
      { key: 'address', header: 'Address', dbExpression: 'b.address' },
      { key: 'contact_number', header: 'Contact', dbExpression: 'b.contact_number' },
      { key: 'contact_email', header: 'Email', dbExpression: 'b.contact_email' },
      { key: 'created_at', header: 'Created At', dbExpression: 'b.created_at', type: 'date' },
    ],
    defaultColumns: ['name', 'code', 'area_name', 'is_active', 'address'],
    filterMap: {
      search: "(b.name ILIKE $N OR b.code ILIKE $N)",
      is_active: 'b.is_active = $N',
      area_id: 'b.area_id = $N',
    },
    defaultOrderBy: 'b.name ASC',
  });

  // ── Platform — Departments ────────────────────────────────────────────────────
  registry.register({
    module: 'departments',
    title: 'Departments',
    permission: PERMISSIONS.PLATFORM_ORGANIZATIONS_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM departments d
      WHERE d.tenant_id = $1
    `,
    tenantColumn: 'd.tenant_id',
    columns: [
      { key: 'name', header: 'Department Name', dbExpression: 'd.name' },
      { key: 'code', header: 'Code', dbExpression: 'd.code' },
      { key: 'is_active', header: 'Active', dbExpression: 'd.is_active', type: 'boolean' },
      { key: 'created_at', header: 'Created At', dbExpression: 'd.created_at', type: 'date' },
    ],
    defaultColumns: ['name', 'code', 'is_active', 'created_at'],
    filterMap: {
      search: "(d.name ILIKE $N OR d.code ILIKE $N)",
      is_active: 'd.is_active = $N',
    },
    defaultOrderBy: 'd.name ASC',
  });

  // ── Platform — Areas ──────────────────────────────────────────────────────────
  registry.register({
    module: 'areas',
    title: 'Areas',
    permission: PERMISSIONS.PLATFORM_ORGANIZATIONS_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM areas a
      WHERE a.tenant_id = $1
    `,
    tenantColumn: 'a.tenant_id',
    columns: [
      { key: 'name', header: 'Area Name', dbExpression: 'a.name' },
      { key: 'code', header: 'Code', dbExpression: 'a.code' },
      { key: 'is_active', header: 'Active', dbExpression: 'a.is_active', type: 'boolean' },
      { key: 'created_at', header: 'Created At', dbExpression: 'a.created_at', type: 'date' },
    ],
    defaultColumns: ['name', 'code', 'is_active', 'created_at'],
    filterMap: {
      search: "(a.name ILIKE $N OR a.code ILIKE $N)",
      is_active: 'a.is_active = $N',
    },
    defaultOrderBy: 'a.name ASC',
  });

  // ── Platform — Positions ──────────────────────────────────────────────────────
  registry.register({
    module: 'positions',
    title: 'Positions',
    permission: PERMISSIONS.PLATFORM_ROLES_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM designations p
      WHERE p.tenant_id = $1
    `,
    tenantColumn: 'p.tenant_id',
    columns: [
      { key: 'name', header: 'Position Name', dbExpression: 'p.name' },
      { key: 'code', header: 'Code', dbExpression: 'p.code' },
      { key: 'is_active', header: 'Active', dbExpression: 'p.is_active', type: 'boolean' },
      { key: 'created_at', header: 'Created At', dbExpression: 'p.created_at', type: 'date' },
    ],
    defaultColumns: ['name', 'code', 'is_active', 'created_at'],
    filterMap: {
      search: "(p.name ILIKE $N OR p.code ILIKE $N)",
      is_active: 'p.is_active = $N',
    },
    defaultOrderBy: 'p.name ASC',
  });

  // ── Platform — Approval Chains ────────────────────────────────────────────────
  registry.register({
    module: 'approval_chains',
    title: 'Approval Chains',
    permission: PERMISSIONS.PLATFORM_TEMPLATES_VIEW,
    baseQuery: `
      SELECT {columns}
      FROM approval_chains ac
      WHERE ac.tenant_id = $1
    `,
    tenantColumn: 'ac.tenant_id',
    columns: [
      { key: 'name', header: 'Chain Name', dbExpression: 'ac.name' },
      { key: 'target_type', header: 'Target Type', dbExpression: 'ac.target_type' },
      { key: 'is_active', header: 'Active', dbExpression: 'ac.is_active', type: 'boolean' },
      { key: 'created_at', header: 'Created At', dbExpression: 'ac.created_at', type: 'date' },
    ],
    defaultColumns: ['name', 'target_type', 'is_active', 'created_at'],
    filterMap: {
      search: "(ac.name ILIKE $N OR ac.target_type ILIKE $N)",
      target_type: 'ac.target_type = $N',
    },
    defaultOrderBy: 'ac.name ASC',
  });


}
