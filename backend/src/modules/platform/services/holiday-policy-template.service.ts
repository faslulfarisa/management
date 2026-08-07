import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';

export interface HolidayEntry {
  name: string;
  date: string;
  type: string;
  description?: string;
  recurring_yearly?: boolean;
  half_day?: boolean;
  optional_holiday?: boolean;
  restricted_holiday?: boolean;
  paid_holiday?: boolean;
  applicable_branch_ids?: string[];
  applicable_department_ids?: string[];
  color_label?: string;
}

const DEFAULT_HOLIDAY_TYPES = [
  'National Holiday',
  'State Holiday',
  'Festival',
  'Company Holiday',
  'Optional Holiday',
  'Restricted Holiday',
  'Special Holiday',
  'Emergency Closure',
  'Custom',
];

@Injectable()
export class HolidayPolicyTemplateService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
  ) {}

  validateConfig(config: any) {
    const normalized = this.normalizeConfig(config);
    const seen = new Set<string>();

    for (const holiday of normalized.holidays) {
      if (seen.has(holiday.date)) {
        throw new BadRequestException(`Duplicate holiday date in template: ${holiday.date}`);
      }
      seen.add(holiday.date);
    }

    return normalized;
  }

  normalizeConfig(config: any) {
    const year = Number(config?.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw new BadRequestException('Holiday template year must be a valid four-digit year');
    }

    const holidays = Array.isArray(config?.holidays) ? config.holidays : [];
    return {
      ...config,
      year,
      allowed_holiday_types: Array.isArray(config?.allowed_holiday_types) && config.allowed_holiday_types.length
        ? config.allowed_holiday_types
        : DEFAULT_HOLIDAY_TYPES,
      holidays: holidays.map((holiday: any) => this.normalizeHoliday(holiday, year)),
    };
  }

  async duplicateTemplate(tenantId: string, userId: string, templateId: string, data: any = {}) {
    const { rows } = await this.db.query(
      `SELECT * FROM templates WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [templateId, tenantId],
    );
    if (!rows.length) throw new BadRequestException('Template not found');

    const source = rows[0];
    const sourceConfig = source.config || {};
    const targetYear = Number(data.year || sourceConfig.year || new Date().getFullYear());
    const clonedConfig = this.validateConfig({
      ...sourceConfig,
      year: targetYear,
      holidays: (sourceConfig.holidays || []).map((holiday: HolidayEntry) => ({
        ...holiday,
        date: this.withYear(holiday.date, targetYear),
      })),
      import_metadata: undefined,
    });

    const { rows: created } = await this.db.query(
      `INSERT INTO templates
         (tenant_id, template_type, name, description, config, is_default, status,
          effective_from, effective_until, notes, created_by)
       VALUES ($1, 'holiday_policy', $2, $3, $4, false, 'draft', $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        data.name || `${source.name} ${targetYear}`,
        data.description ?? source.description,
        clonedConfig,
        data.effective_from || `${targetYear}-01-01`,
        data.effective_until || `${targetYear}-12-31`,
        data.notes ?? source.notes,
        userId,
      ],
    );

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'template',
      entityId: created[0].id,
      action: 'template_duplicated',
      oldValues: { source_template_id: templateId },
      newValues: created[0],
    });

    return created[0];
  }

  async importCsv(tenantId: string, userId: string, templateId: string, csv: string) {
    const template = await this.getHolidayTemplate(tenantId, templateId);
    const imported = this.parseCsv(csv, Number(template.config?.year));
    const merged = this.validateConfig({
      ...template.config,
      holidays: [...(template.config?.holidays || []), ...imported],
      import_metadata: {
        imported_at: new Date().toISOString(),
        imported_by: userId,
        imported_count: imported.length,
      },
    });

    const { rows } = await this.db.query(
      `UPDATE templates SET config = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [templateId, tenantId, merged],
    );

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'template',
      entityId: templateId,
      action: 'holidays_imported',
      oldValues: { count: template.config?.holidays?.length || 0 },
      newValues: { count: merged.holidays.length, imported_count: imported.length },
    });

    return rows[0];
  }

  async exportCsv(tenantId: string, templateId: string) {
    const template = await this.getHolidayTemplate(tenantId, templateId);
    const headers = [
      'Holiday Name',
      'Holiday Date',
      'Holiday Type',
      'Description',
      'Recurring Yearly',
      'Half Day',
      'Optional Holiday',
      'Restricted Holiday',
      'Paid Holiday',
      'Applicable Branches',
      'Applicable Departments',
      'Color Label',
    ];
    const lines = (template.config?.holidays || []).map((holiday: HolidayEntry) => [
      holiday.name,
      holiday.date,
      holiday.type,
      holiday.description || '',
      holiday.recurring_yearly ? 'Yes' : 'No',
      holiday.half_day ? 'Yes' : 'No',
      holiday.optional_holiday ? 'Yes' : 'No',
      holiday.restricted_holiday ? 'Yes' : 'No',
      holiday.paid_holiday === false ? 'No' : 'Yes',
      (holiday.applicable_branch_ids || []).join('|'),
      (holiday.applicable_department_ids || []).join('|'),
      holiday.color_label || '',
    ].map(this.csvEscape).join(','));

    return [headers.join(','), ...lines].join('\n');
  }

  async listEmployeeHolidays(
    tenantId: string,
    employeeId: string,
    filters: { date_from?: string; date_to?: string; upcoming?: boolean; limit?: number } = {},
  ) {
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = filters.date_from || (filters.upcoming ? today : `${new Date().getFullYear()}-01-01`);
    const dateTo = filters.date_to || `${new Date(dateFrom).getUTCFullYear()}-12-31`;
    const { holidays } = await this.getEmployeeHolidaysForPeriod(tenantId, employeeId, dateFrom, dateTo);
    const sorted = holidays.sort((a, b) => a.date.localeCompare(b.date));
    const filtered = filters.upcoming ? sorted.filter((holiday) => holiday.date >= today) : sorted;
    return typeof filters.limit === 'number' ? filtered.slice(0, filters.limit) : filtered;
  }

  async getHolidaySetForEmployee(tenantId: string, employeeId: string, periodStart: string, periodEnd: string) {
    const result = await this.getEmployeeHolidaysForPeriod(tenantId, employeeId, periodStart, periodEnd);
    return {
      hasTemplate: result.hasTemplate,
      dates: new Set(result.holidays.map((holiday) => holiday.date)),
    };
  }

  async blocksLeaveRequest(tenantId: string, employeeId: string, startDate: string, endDate: string) {
    const { holidays } = await this.getEmployeeHolidaysForPeriod(tenantId, employeeId, startDate, endDate);
    return holidays.filter((holiday) =>
      holiday.paid_holiday !== false &&
      !holiday.optional_holiday &&
      !holiday.restricted_holiday
    );
  }

  private async getEmployeeHolidaysForPeriod(tenantId: string, employeeId: string, periodStart: string, periodEnd: string) {
    const employee = await this.getEmployee(tenantId, employeeId);
    const templates = await this.getApplicableTemplates(tenantId, employeeId, periodStart, periodEnd);
    const holidaysByDate = new Map<string, HolidayEntry & { template_id: string; template_name: string }>();

    for (const template of templates) {
      for (const holiday of template.config?.holidays || []) {
        if (!this.appliesToEmployee(holiday, employee)) continue;
        const dates = this.expandHolidayDates(holiday, periodStart, periodEnd);
        for (const date of dates) {
          if (!holidaysByDate.has(date)) {
            holidaysByDate.set(date, {
              ...holiday,
              date,
              template_id: template.id,
              template_name: template.name,
            });
          }
        }
      }
    }

    return { hasTemplate: templates.length > 0, holidays: Array.from(holidaysByDate.values()) };
  }

  private async getApplicableTemplates(tenantId: string, employeeId: string, periodStart: string, periodEnd: string) {
    const { rows } = await this.db.query(
      `WITH emp AS (
         SELECT id, designation_id, department_id, property_id, branch_id
         FROM employees
         WHERE id = $3 AND tenant_id = $1 AND deleted_at IS NULL
       ),
       assigned AS (
         SELECT t.*, ta.priority, ta.scope_type AS resolved_via
         FROM template_assignments ta
         JOIN templates t ON ta.template_id = t.id
         CROSS JOIN emp e
         WHERE ta.tenant_id = $1
           AND ta.template_type = $2
           AND ta.deleted_at IS NULL
           AND t.deleted_at IS NULL
           AND COALESCE(t.status, 'active') = 'active'
           AND (ta.effective_from IS NULL OR ta.effective_from <= $5::date)
           AND (ta.effective_to IS NULL OR ta.effective_to >= $4::date)
           AND (t.effective_from IS NULL OR t.effective_from <= $5::date)
           AND (t.effective_until IS NULL OR t.effective_until >= $4::date)
           AND ta.id NOT IN (
             SELECT template_assignment_id
             FROM template_assignment_exclusions
             WHERE employee_id = $3 AND tenant_id = $1
           )
           AND (
             (ta.scope_type = 'employee' AND ta.scope_id = e.id)
             OR (ta.scope_type = 'designation' AND ta.scope_id = e.designation_id)
             OR (ta.scope_type = 'department' AND ta.scope_id = e.department_id)
             OR (ta.scope_type = 'branch' AND ta.scope_id = e.branch_id)
             OR (ta.scope_type = 'property' AND ta.scope_id = e.property_id)
             OR (ta.scope_type = 'organization' AND ta.scope_id = $1)
           )
       ),
       defaults AS (
         SELECT t.*, 0 AS priority, 'default' AS resolved_via
         FROM templates t
         WHERE t.tenant_id = $1
           AND t.template_type = $2
           AND t.deleted_at IS NULL
           AND t.is_default = true
           AND COALESCE(t.status, 'active') = 'active'
           AND (t.effective_from IS NULL OR t.effective_from <= $5::date)
           AND (t.effective_until IS NULL OR t.effective_until >= $4::date)
           AND NOT EXISTS (SELECT 1 FROM assigned)
       )
       SELECT *
       FROM (
         SELECT * FROM assigned
         UNION ALL
         SELECT * FROM defaults
       ) applicable_templates
       ORDER BY priority DESC, 
                CASE resolved_via
                  WHEN 'employee' THEN 5
                  WHEN 'designation' THEN 4
                  WHEN 'department' THEN 3
                  WHEN 'property' THEN 2
                  WHEN 'branch' THEN 1
                  WHEN 'organization' THEN 0
                  ELSE -1
                END DESC,
                effective_from DESC NULLS LAST, 
                created_at DESC
       LIMIT 1`,
      [tenantId, 'holiday_policy', employeeId, periodStart, periodEnd],
    );
    return rows;
  }

  private async getHolidayTemplate(tenantId: string, templateId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM templates
       WHERE id = $1 AND tenant_id = $2 AND template_type = 'holiday_policy' AND deleted_at IS NULL`,
      [templateId, tenantId],
    );
    if (!rows.length) throw new BadRequestException('Holiday policy template not found');
    return rows[0];
  }

  private async getEmployee(tenantId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT id, branch_id, department_id FROM employees
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [employeeId, tenantId],
    );
    if (!rows.length) throw new BadRequestException('Employee not found');
    return rows[0];
  }

  private normalizeHoliday(holiday: any, templateYear: number): HolidayEntry {
    const name = String(holiday?.name || holiday?.holiday_name || '').trim();
    const date = this.toIsoDate(holiday?.date || holiday?.holiday_date);
    if (!name) throw new BadRequestException('Holiday name is required');
    if (!date) throw new BadRequestException(`Invalid holiday date for ${name}`);
    if (Number(date.slice(0, 4)) !== templateYear && !holiday?.recurring_yearly) {
      throw new BadRequestException(`Holiday date ${date} must be in template year ${templateYear}`);
    }

    const type = String(holiday?.type || holiday?.holiday_type || 'Custom').trim();
    return {
      name,
      date,
      type,
      description: holiday?.description || '',
      recurring_yearly: Boolean(holiday?.recurring_yearly),
      half_day: Boolean(holiday?.half_day),
      optional_holiday: Boolean(holiday?.optional_holiday),
      restricted_holiday: Boolean(holiday?.restricted_holiday),
      paid_holiday: holiday?.paid_holiday !== false,
      applicable_branch_ids: Array.isArray(holiday?.applicable_branch_ids) ? holiday.applicable_branch_ids.filter(Boolean) : [],
      applicable_department_ids: Array.isArray(holiday?.applicable_department_ids) ? holiday.applicable_department_ids.filter(Boolean) : [],
      color_label: holiday?.color_label || '#64748b',
    };
  }

  private appliesToEmployee(holiday: HolidayEntry, employee: any) {
    const branchIds = holiday.applicable_branch_ids || [];
    const departmentIds = holiday.applicable_department_ids || [];
    if (branchIds.length && !branchIds.includes(employee.branch_id)) return false;
    if (departmentIds.length && !departmentIds.includes(employee.department_id)) return false;
    return true;
  }

  private expandHolidayDates(holiday: HolidayEntry, periodStart: string, periodEnd: string) {
    const dates: string[] = [];
    if (!holiday.recurring_yearly) {
      if (holiday.date >= periodStart && holiday.date <= periodEnd) dates.push(holiday.date);
      return dates;
    }

    const startYear = Number(periodStart.slice(0, 4));
    const endYear = Number(periodEnd.slice(0, 4));
    const monthDay = holiday.date.slice(4);
    for (let year = startYear; year <= endYear; year++) {
      const date = `${year}${monthDay}`;
      if (date >= periodStart && date <= periodEnd) dates.push(date);
    }
    return dates;
  }

  private parseCsv(csv: string, year: number) {
    if (!csv?.trim()) throw new BadRequestException('CSV content is required');
    const lines = csv.split(/\r?\n/).filter((line) => line.trim());
    const dataLines = lines[0]?.toLowerCase().includes('holiday') ? lines.slice(1) : lines;
    return dataLines.map((line) => {
      const cols = this.splitCsvLine(line);
      return this.normalizeHoliday({
        name: cols[0],
        date: cols[1],
        type: cols[2],
        description: cols[3],
        recurring_yearly: this.isYes(cols[4]),
        half_day: this.isYes(cols[5]),
        optional_holiday: this.isYes(cols[6]),
        restricted_holiday: this.isYes(cols[7]),
        paid_holiday: cols[8] ? this.isYes(cols[8]) : true,
        applicable_branch_ids: cols[9] ? cols[9].split('|').filter(Boolean) : [],
        applicable_department_ids: cols[10] ? cols[10].split('|').filter(Boolean) : [],
        color_label: cols[11],
      }, year);
    });
  }

  private splitCsvLine(line: string) {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  private csvEscape(value: any) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private isYes(value: any) {
    return ['yes', 'true', '1', 'y'].includes(String(value ?? '').trim().toLowerCase());
  }

  private toIsoDate(value: any) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().split('T')[0];
    const text = String(value).split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : null;
  }

  private withYear(date: string, year: number) {
    return `${year}${String(date).slice(4)}`;
  }
}
