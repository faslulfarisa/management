import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface DependencyItem {
  module: string;
  label: string;
  count: number;
  critical: boolean;
}

export interface DependencyReport {
  entityType: string;
  entityId: string;
  entityName: string;
  severity: Severity;
  canHardDelete: boolean;
  canSoftDelete: boolean;
  dependencies: DependencyItem[];
  totalLinkedRecords: number;
  blockers: string[];
}

@Injectable()
export class DependencyCheckService {
  constructor(private readonly db: DatabaseService) {}

  private buildReport(
    entityType: string,
    entityId: string,
    entityName: string,
    allDeps: DependencyItem[],
  ): DependencyReport {
    const deps = allDeps.filter(d => d.count > 0);
    const hasCritical = deps.some(d => d.critical);
    const hasEmployees = deps.some(d => d.module === 'employees' && d.count > 0);

    let severity: Severity = 'none';
    if (deps.length > 0) {
      if (hasCritical) severity = 'critical';
      else if (hasEmployees) severity = 'high';
      else if (deps.length > 0) severity = 'medium';
    }

    // Only entries with count=0 that are config-only → low
    const nonZero = allDeps.filter(d => d.count > 0);
    if (nonZero.length > 0 && severity === 'none') severity = 'low';

    const blockers: string[] = [];
    if (hasCritical) {
      deps.filter(d => d.critical).forEach(d =>
        blockers.push(`Contains ${d.count.toLocaleString()} ${d.label}`)
      );
    }

    return {
      entityType,
      entityId,
      entityName,
      severity,
      canHardDelete: !hasCritical,
      canSoftDelete: true,
      dependencies: deps,
      totalLinkedRecords: deps.reduce((s, d) => s + d.count, 0),
      blockers,
    };
  }

  async checkBranch(id: string, tenantId: string): Promise<DependencyReport> {
    const [metaRes, countsRes] = await Promise.all([
      this.db.query(`SELECT name FROM branches WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM departments
            WHERE branch_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS dept_count,
           (SELECT COUNT(*) FROM employees
            WHERE branch_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS emp_count,
           (SELECT COUNT(*) FROM biometric_devices
            WHERE branch_id = $1 AND tenant_id = $2)::int AS device_count,
           (SELECT COUNT(*) FROM areas
            WHERE branch_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS area_count,
           (SELECT COUNT(*) FROM salary_structures
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE branch_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS payroll_count,
           (SELECT COUNT(*) FROM payslips
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE branch_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS payslip_count,
           (SELECT COUNT(*) FROM attendance_records
            WHERE branch_id = $1 AND tenant_id = $2)::int AS attendance_count,
           (SELECT COUNT(*) FROM shift_assignments
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE branch_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS shift_count`,
        [id, tenantId],
      ),
    ]);

    const c = countsRes.rows[0];
    return this.buildReport('branch', id, metaRes.rows[0]?.name ?? id, [
      { module: 'departments',      label: 'Departments',         count: c.dept_count,       critical: false },
      { module: 'employees',        label: 'Employees',           count: c.emp_count,        critical: false },
      { module: 'areas',            label: 'Areas',               count: c.area_count,       critical: false },
      { module: 'biometric_devices',label: 'Biometric Devices',   count: c.device_count,     critical: false },
      { module: 'shifts',           label: 'Shift Assignments',   count: c.shift_count,      critical: false },
      { module: 'payroll',          label: 'Payroll Structures',  count: c.payroll_count,    critical: true  },
      { module: 'attendance',       label: 'Attendance Records',  count: c.attendance_count, critical: true  },
      { module: 'payslips',         label: 'Payslips',            count: c.payslip_count,    critical: true  },
    ]);
  }

  async checkDepartment(id: string, tenantId: string): Promise<DependencyReport> {
    const [metaRes, countsRes] = await Promise.all([
      this.db.query(`SELECT name FROM departments WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM employees
            WHERE department_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS emp_count,
           (SELECT COUNT(*) FROM departments
            WHERE parent_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS child_dept_count,
           (SELECT COUNT(*) FROM areas
            WHERE department_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS area_count,
           (SELECT COUNT(*) FROM payslips
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE department_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS payslip_count,
           (SELECT COUNT(*) FROM attendance_records
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE department_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS attendance_count,
           (SELECT COUNT(*) FROM leave_requests
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE department_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS leave_count,
           (SELECT COUNT(*) FROM shift_assignments
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE department_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS shift_count`,
        [id, tenantId],
      ),
    ]);

    const c = countsRes.rows[0];
    return this.buildReport('department', id, metaRes.rows[0]?.name ?? id, [
      { module: 'employees',        label: 'Employees',           count: c.emp_count,        critical: false },
      { module: 'child_departments',label: 'Sub-Departments',     count: c.child_dept_count, critical: false },
      { module: 'areas',            label: 'Areas',               count: c.area_count,       critical: false },
      { module: 'shifts',           label: 'Shift Assignments',   count: c.shift_count,      critical: false },
      { module: 'leave',            label: 'Leave Records',       count: c.leave_count,      critical: false },
      { module: 'attendance',       label: 'Attendance Records',  count: c.attendance_count, critical: true  },
      { module: 'payslips',         label: 'Payslips',            count: c.payslip_count,    critical: true  },
    ]);
  }

  async checkArea(id: string, tenantId: string): Promise<DependencyReport> {
    const [metaRes, countsRes] = await Promise.all([
      this.db.query(`SELECT name FROM areas WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM employees
            WHERE area_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS emp_count,
           (SELECT COUNT(*) FROM biometric_devices
            WHERE area_id = $1 AND tenant_id = $2)::int AS device_count,
           (SELECT COUNT(*) FROM attendance_records
            WHERE tenant_id = $2
              AND employee_id IN (
                SELECT id FROM employees WHERE area_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
              ))::int AS attendance_count`,
        [id, tenantId],
      ),
    ]);

    const c = countsRes.rows[0];
    return this.buildReport('area', id, metaRes.rows[0]?.name ?? id, [
      { module: 'employees',         label: 'Employees',          count: c.emp_count,        critical: false },
      { module: 'biometric_devices', label: 'Biometric Devices',  count: c.device_count,     critical: false },
      { module: 'attendance',        label: 'Attendance Records', count: c.attendance_count, critical: true  },
    ]);
  }

  async checkPosition(id: string, tenantId: string): Promise<DependencyReport> {
    const [metaRes, countsRes] = await Promise.all([
      this.db.query(`SELECT name FROM positions WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM employees
            WHERE position_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS emp_count,
           (SELECT COUNT(*) FROM user_positions
            WHERE position_id = $1)::int AS user_count`,
        [id, tenantId],
      ),
    ]);

    const c = countsRes.rows[0];
    return this.buildReport('position', id, metaRes.rows[0]?.name ?? id, [
      { module: 'employees', label: 'Assigned Employees', count: c.emp_count,  critical: false },
      { module: 'users',     label: 'User Assignments',   count: c.user_count, critical: false },
    ]);
  }

  async checkEmployee(id: string, tenantId: string): Promise<DependencyReport> {
    const [metaRes, countsRes] = await Promise.all([
      this.db.query(
        `SELECT first_name || ' ' || last_name AS full_name, employee_code, user_id
         FROM employees WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM attendance_records
            WHERE employee_id = $1 AND tenant_id = $2)::int AS attendance_count,
           (SELECT COUNT(*) FROM payslips
            WHERE employee_id = $1 AND tenant_id = $2)::int AS payslip_count,
           (SELECT COUNT(*) FROM salary_structures
            WHERE employee_id = $1 AND tenant_id = $2)::int AS salary_count,
           (SELECT COUNT(*) FROM leave_requests
            WHERE employee_id = $1 AND tenant_id = $2)::int AS leave_count,
           (SELECT COUNT(*) FROM overtime_requests
            WHERE employee_id = $1 AND tenant_id = $2)::int AS overtime_count,
           (SELECT COUNT(*) FROM employee_fines
            WHERE employee_id = $1 AND tenant_id = $2)::int AS fines_count,
           (SELECT COUNT(*) FROM shift_assignments
            WHERE employee_id = $1 AND tenant_id = $2)::int AS shift_count,
           (SELECT COUNT(*) FROM employee_documents
            WHERE employee_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS document_count,
           (SELECT COUNT(*) FROM employees
            WHERE reporting_manager_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)::int AS reportee_count,
           (SELECT COUNT(*) FROM approval_requests
            WHERE tenant_id = $2 AND submitted_by IN (
              SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2
            ))::int AS approval_count,
           (SELECT COUNT(*) FROM audit_logs
            WHERE tenant_id = $2 AND entity_type = 'employee' AND entity_id = $1)::int AS audit_count,
           (SELECT COUNT(*) FROM notifications
            WHERE tenant_id = $2 AND user_id IN (
              SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2
            ))::int AS notification_count,
           (SELECT COUNT(*) FROM punch_fingerprints
            WHERE tenant_id = $2 AND employee_code = (
              SELECT employee_code FROM employees WHERE id = $1 AND tenant_id = $2
            ))::int AS biometric_log_count`,
        [id, tenantId],
      ),
    ]);

    const c = countsRes.rows[0];
    return this.buildReport('employee', id, metaRes.rows[0]?.full_name ?? id, [
      { module: 'attendance',     label: 'Attendance Records',  count: c.attendance_count,    critical: true  },
      { module: 'payroll',        label: 'Payroll Records',     count: c.salary_count,        critical: true  },
      { module: 'payslips',       label: 'Payslips',            count: c.payslip_count,       critical: true  },
      { module: 'approvals',      label: 'Approvals',           count: c.approval_count,      critical: true  },
      { module: 'audit_logs',     label: 'Audit Logs',          count: c.audit_count,         critical: true  },
      { module: 'leave',          label: 'Leave Requests',      count: c.leave_count,         critical: false },
      { module: 'overtime',       label: 'Overtime Requests',   count: c.overtime_count,      critical: false },
      { module: 'fines',          label: 'Fine & Deductions',   count: c.fines_count,         critical: false },
      { module: 'biometric_logs', label: 'Biometric Logs',      count: c.biometric_log_count, critical: false },
      { module: 'shifts',         label: 'Shift Assignments',   count: c.shift_count,         critical: false },
      { module: 'documents',      label: 'Documents',           count: c.document_count,      critical: false },
      { module: 'notifications',  label: 'Notifications',       count: c.notification_count,  critical: false },
      { module: 'reportees',      label: 'Direct Reportees',    count: c.reportee_count,       critical: false },
    ]);
  }

  async checkTemplate(id: string, tenantId: string): Promise<DependencyReport> {
    const [metaRes, countsRes] = await Promise.all([
      this.db.query(`SELECT name FROM templates WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM template_assignments
            WHERE template_id = $1 AND deleted_at IS NULL)::int AS assignment_count`,
        [id, tenantId],
      ),
    ]);

    const c = countsRes.rows[0];
    return this.buildReport('template', id, metaRes.rows[0]?.name ?? id, [
      { module: 'assignments', label: 'Active Assignments', count: c.assignment_count, critical: false },
    ]);
  }
}
