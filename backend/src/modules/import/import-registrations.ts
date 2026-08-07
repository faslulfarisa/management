import { PERMISSIONS } from '../../shared/permissions.constants';
import { ImportFieldDef, ImportRegistryService } from './import-registry.service';

const text = (key: string, header: string, aliases: string[] = [], required = false): ImportFieldDef => ({
  key,
  header,
  aliases,
  required,
  type: 'string',
});

const activeField: ImportFieldDef = {
  key: 'is_active',
  header: 'Active',
  aliases: ['Status', 'Enabled', 'Is Active'],
  type: 'boolean',
  defaultValue: true,
};

function existingByCode(table: string, codeField = 'code', displayColumns: string[] = ['code', 'name']) {
  return {
    table,
    tenantColumn: 'tenant_id',
    uniqueFieldColumns: { [codeField]: codeField },
    displayColumns: codeField === 'name' && displayColumns.join('|') === 'code|name' ? ['name'] : displayColumns,
  };
}

export function registerAllImportConfigs(registry: ImportRegistryService): void {
  registry.register({
    module: 'employees',
    title: 'Employee Master',
    permission: PERMISSIONS.EMPLOYEES_CREATE,
    requiredFields: ['employee_code', 'first_name'],
    uniqueKeys: ['employee_code'],
    duplicateStrategy: 'skip',
    existingRecordCheck: {
      table: 'employees',
      tenantColumn: 'tenant_id',
      branchColumn: 'branch_id',
      uniqueFieldColumns: {
        employee_code: 'employee_code',
      },
      displayColumns: ['employee_code', 'first_name', 'last_name', 'status'],
    },
    fields: [
      text('employee_code', 'Employee Code', ['Emp Code', 'Code'], true),
      text('first_name', 'First Name', ['Employee Name', 'Name'], true),
      text('last_name', 'Last Name', ['Surname']),
      { ...text('gender', 'Gender'), type: 'enum', enumValues: ['male', 'female', 'other'] },
      text('branch_name', 'Branch', ['Branch Name']),
      text('department_name', 'Department', ['Department Name']),
      text('designation_name', 'Designation', ['Position', 'Position Name']),
      { ...text('date_of_joining', 'Joining Date', ['Date of Joining', 'DOJ']), type: 'date' },
      { ...text('date_of_birth', 'Date of Birth', ['DOB']), type: 'date', sensitive: true },
      { ...text('personal_email', 'Email', ['Personal Email', 'Email Address']), type: 'email', sensitive: true },
      { ...text('personal_phone', 'Phone', ['Mobile', 'Phone Number']), type: 'phone', sensitive: true },
      { ...text('status', 'Status'), type: 'enum', enumValues: ['active', 'inactive', 'terminated', 'on_leave'] },
    ],
  });

  registry.register({
    module: 'attendance',
    title: 'Attendance Records',
    permission: PERMISSIONS.ATTENDANCE_CREATE,
    requiredFields: ['employee_code', 'date', 'status'],
    uniqueKeys: ['employee_code', 'date'],
    duplicateStrategy: 'update',
    fields: [
      text('employee_code', 'Employee Code', ['Emp Code'], true),
      { ...text('date', 'Date', [], true), type: 'date' },
      { ...text('status', 'Status', [], true), type: 'enum', enumValues: ['present', 'absent', 'leave', 'holiday', 'half_day'] },
      text('clock_in', 'Clock In', ['In Time']),
      text('clock_out', 'Clock Out', ['Out Time']),
      { ...text('worked_hours', 'Worked Hours'), type: 'number' },
      { ...text('overtime_minutes', 'OT (min)', ['Overtime Minutes']), type: 'number' },
      text('source', 'Source'),
    ],
  });

  registry.register({
    module: 'leave_requests',
    title: 'Leave Requests',
    permission: PERMISSIONS.LEAVE_CREATE,
    requiredFields: ['employee_code', 'leave_type', 'start_date', 'end_date'],
    uniqueKeys: ['employee_code', 'leave_type', 'start_date', 'end_date'],
    duplicateStrategy: 'skip',
    fields: [
      text('employee_code', 'Employee Code', ['Emp Code'], true),
      text('leave_type', 'Leave Type', ['Leave']),
      { ...text('start_date', 'Start Date', [], true), type: 'date' },
      { ...text('end_date', 'End Date', [], true), type: 'date' },
      { ...text('days', 'Days'), type: 'number' },
      text('reason', 'Reason'),
      { ...text('status', 'Status'), type: 'enum', enumValues: ['pending', 'approved', 'rejected', 'cancelled'] },
    ],
  });

  registry.register({
    module: 'payroll',
    title: 'Payroll',
    permission: PERMISSIONS.PAYROLL_CREATE,
    requiredFields: ['employee_code', 'month', 'year'],
    uniqueKeys: ['employee_code', 'month', 'year'],
    duplicateStrategy: 'update',
    fields: [
      text('employee_code', 'Employee Code', ['Emp Code'], true),
      { ...text('month', 'Month', [], true), type: 'number' },
      { ...text('year', 'Year', [], true), type: 'number' },
      { ...text('basic_salary', 'Basic Salary'), type: 'currency' },
      { ...text('gross_salary', 'Gross Salary'), type: 'currency' },
      { ...text('total_deductions', 'Deductions'), type: 'currency' },
      { ...text('net_salary', 'Net Salary'), type: 'currency' },
      { ...text('paid_days', 'Paid Days'), type: 'number' },
      { ...text('lop_days', 'LOP Days'), type: 'number' },
      { ...text('status', 'Status'), type: 'enum', enumValues: ['draft', 'processed', 'approved', 'paid'] },
    ],
  });

  registry.register({
    module: 'compliance_documents',
    title: 'Compliance Documents',
    permission: PERMISSIONS.COMPLIANCE_CREATE,
    requiredFields: ['document_name', 'document_type'],
    uniqueKeys: ['document_name', 'document_type'],
    duplicateStrategy: 'skip',
    existingRecordCheck: {
      table: 'compliance_documents',
      tenantColumn: 'tenant_id',
      uniqueFieldColumns: {
        document_name: 'document_name',
        document_type: 'document_type',
      },
      displayColumns: ['document_name', 'document_type', 'status'],
    },
    fields: [
      text('employee_code', 'Employee Code', ['Emp Code']),
      text('document_type', 'Document Type', [], true),
      text('document_name', 'Document Name', ['Name'], true),
      text('status', 'Status'),
      { ...text('expiry_date', 'Expiry Date'), type: 'date' },
    ],
  });

  registry.register({
    module: 'performance_reviews',
    title: 'Performance Reviews',
    permission: PERMISSIONS.PERFORMANCE_EDIT,
    requiredFields: ['employee_code', 'review_period'],
    uniqueKeys: ['employee_code', 'review_period'],
    duplicateStrategy: 'update',
    fields: [
      text('employee_code', 'Employee Code', ['Emp Code'], true),
      text('review_period', 'Review Period', [], true),
      { ...text('overall_rating', 'Overall Rating'), type: 'number' },
      text('status', 'Status'),
      text('reviewed_by', 'Reviewed By'),
      { ...text('review_date', 'Review Date'), type: 'date' },
    ],
  });

  registry.register({
    module: 'assets',
    title: 'Assets',
    permission: PERMISSIONS.ASSETS_MANAGE,
    requiredFields: ['asset_code', 'name'],
    uniqueKeys: ['asset_code'],
    duplicateStrategy: 'skip',
    existingRecordCheck: {
      table: 'assets',
      tenantColumn: 'tenant_id',
      branchColumn: 'branch_id',
      uniqueFieldColumns: {
        asset_code: 'asset_code',
      },
      displayColumns: ['asset_code', 'name', 'status'],
    },
    fields: [
      text('asset_code', 'Asset Code', [], true),
      text('name', 'Asset Name', ['Name'], true),
      text('category', 'Category'),
      text('branch_name', 'Branch', ['Branch Name']),
      text('status', 'Status'),
      text('assigned_to_employee_code', 'Assigned To', ['Assigned To Employee Code', 'Employee Code']),
      { ...text('purchase_date', 'Purchase Date'), type: 'date' },
      { ...text('purchase_cost', 'Purchase Cost'), type: 'currency' },
      text('serial_number', 'Serial Number'),
    ],
  });

  registry.register({
    module: 'users',
    title: 'Users',
    permission: PERMISSIONS.PLATFORM_USERS_CREATE,
    requiredFields: ['email'],
    uniqueKeys: ['email'],
    duplicateStrategy: 'skip',
    existingRecordCheck: {
      table: 'users',
      tenantColumn: 'tenant_id',
      uniqueFieldColumns: {
        email: 'email',
      },
      displayColumns: ['email', 'user_type', 'status'],
    },
    fields: [
      { ...text('email', 'Email', ['User Email'], true), type: 'email' },
      text('employee_code', 'Employee Code', ['Emp Code']),
      text('user_type', 'User Type', ['Role']),
      text('status', 'Status'),
    ],
  });

  registry.register({
    module: 'vacancies',
    title: 'Vacancies',
    permission: PERMISSIONS.RECRUITMENT_CREATE,
    requiredFields: ['title'],
    uniqueKeys: ['title'],
    duplicateStrategy: 'skip',
    existingRecordCheck: {
      table: 'vacancies',
      tenantColumn: 'tenant_id',
      branchColumn: 'branch_id',
      uniqueFieldColumns: {
        title: 'title',
      },
      displayColumns: ['title', 'status', 'priority'],
    },
    fields: [
      text('title', 'Title', ['Vacancy Title'], true),
      text('branch_name', 'Branch', ['Branch Name']),
      text('department_name', 'Department', ['Department Name']),
      { ...text('positions', 'Positions'), type: 'number' },
      text('status', 'Status'),
      text('priority', 'Priority'),
      { ...text('closing_date', 'Closing Date'), type: 'date' },
    ],
  });

  registry.register({
    module: 'candidates',
    title: 'Candidates',
    permission: PERMISSIONS.RECRUITMENT_CREATE,
    requiredFields: ['first_name'],
    uniqueKeys: ['email'],
    duplicateStrategy: 'skip',
    existingRecordCheck: {
      table: 'candidates',
      tenantColumn: 'tenant_id',
      uniqueFieldColumns: {
        email: 'email',
      },
      displayColumns: ['email', 'first_name', 'last_name', 'status'],
    },
    fields: [
      text('first_name', 'First Name', ['Name', 'Candidate Name'], true),
      text('last_name', 'Last Name'),
      { ...text('email', 'Email'), type: 'email' },
      { ...text('phone', 'Phone', ['Mobile']), type: 'phone' },
      text('vacancy_title', 'Vacancy', ['Vacancy Title']),
      text('stage', 'Stage'),
      text('status', 'Status'),
      text('source', 'Source'),
    ],
  });

  registry.register({
    module: 'finance_invoices',
    title: 'Invoices',
    permission: PERMISSIONS.FINANCE_INVOICES_CREATE,
    requiredFields: ['invoice_number'],
    uniqueKeys: ['invoice_number'],
    duplicateStrategy: 'update',
    existingRecordCheck: {
      table: 'invoices',
      tenantColumn: 'tenant_id',
      branchColumn: 'branch_id',
      uniqueFieldColumns: {
        invoice_number: 'invoice_number',
      },
      displayColumns: ['invoice_number', 'client_name', 'status'],
    },
    fields: [
      text('invoice_number', 'Invoice #', ['Invoice Number'], true),
      text('branch_name', 'Branch', ['Branch Name']),
      text('client_name', 'Client', ['Client Name']),
      { ...text('invoice_date', 'Invoice Date'), type: 'date' },
      { ...text('due_date', 'Due Date'), type: 'date' },
      { ...text('total_amount', 'Amount'), type: 'currency' },
      text('status', 'Status'),
    ],
  });

  registry.register({
    module: 'exit_cases',
    title: 'Exit Management',
    permission: PERMISSIONS.EXIT_CREATE,
    requiredFields: ['employee_code', 'exit_type'],
    uniqueKeys: ['employee_code', 'exit_type', 'resignation_date'],
    duplicateStrategy: 'skip',
    fields: [
      text('employee_code', 'Employee Code', ['Emp Code'], true),
      text('exit_type', 'Exit Type', [], true),
      text('status', 'Status'),
      { ...text('resignation_date', 'Resignation Date'), type: 'date' },
      { ...text('last_working_date', 'Last Working Date'), type: 'date' },
      text('reason', 'Reason'),
    ],
  });

  registry.register({
    module: 'audit_logs',
    title: 'Audit Logs',
    permission: PERMISSIONS.AUDIT_LOGS_VIEW,
    requiredFields: ['entity_type', 'action'],
    uniqueKeys: ['entity_id', 'action', 'created_at'],
    duplicateStrategy: 'skip',
    existingRecordCheck: {
      table: 'audit_logs',
      tenantColumn: 'tenant_id',
      uniqueFieldColumns: {
        entity_id: 'entity_id',
        action: 'action',
        created_at: 'created_at',
      },
      displayColumns: ['entity_type', 'action', 'entity_id'],
    },
    fields: [
      { ...text('created_at', 'Timestamp', ['Created At']), type: 'date' },
      text('user_email', 'User', ['Email']),
      text('entity_type', 'Entity Type', [], true),
      text('action', 'Action', [], true),
      text('entity_id', 'Entity ID'),
      text('ip_address', 'IP Address'),
    ],
  });

  for (const config of [
    { module: 'branches', table: 'branches', title: 'Branches', permission: PERMISSIONS.PLATFORM_ORGANIZATIONS_CREATE, unique: 'code', fields: [text('name', 'Branch Name', ['Name'], true), text('code', 'Branch Code', ['Code'], true), text('area_name', 'Area'), activeField, text('address', 'Address'), { ...text('contact_email', 'Email'), type: 'email' as const }, { ...text('contact_number', 'Contact'), type: 'phone' as const }] },
    { module: 'departments', table: 'departments', title: 'Departments', permission: PERMISSIONS.PLATFORM_ORGANIZATIONS_CREATE, unique: 'code', fields: [text('name', 'Department Name', ['Name'], true), text('code', 'Code', [], true), activeField] },
    { module: 'areas', table: 'areas', title: 'Areas', permission: PERMISSIONS.PLATFORM_ORGANIZATIONS_CREATE, unique: 'code', fields: [text('name', 'Area Name', ['Name'], true), text('code', 'Code', [], true), activeField] },
    { module: 'positions', table: 'designations', title: 'Designations', permission: PERMISSIONS.PLATFORM_ROLES_CREATE, unique: 'code', fields: [text('name', 'Position Name', ['Designation', 'Name'], true), text('code', 'Code', [], true), activeField] },
    { module: 'approval_chains', table: 'approval_chains', title: 'Approval Chains', permission: PERMISSIONS.PLATFORM_TEMPLATES_CREATE, unique: 'name', fields: [text('name', 'Chain Name', ['Name'], true), text('target_type', 'Target Type'), activeField] },
  ]) {
    registry.register({
      module: config.module,
      title: config.title,
      permission: config.permission,
      requiredFields: config.fields.filter((field) => field.required).map((field) => field.key),
      uniqueKeys: [config.unique],
      duplicateStrategy: 'skip',
      existingRecordCheck: existingByCode(config.table, config.unique),
      fields: config.fields,
    });
  }
}
