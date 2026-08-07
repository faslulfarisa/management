import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { BrandingEngineService } from '../../../shared/branding-engine.service';
import { DEFAULT_CURRENCY } from '../../../shared/currency.constants';

// ─── Snapshot shape (version-tagged, append-only) ────────────────────────────

export interface PayslipSnapshotData {
  version: 1;
  captured_at: string;

  employee: {
    id: string;
    employee_code: string;
    first_name: string;
    last_name: string;
    designation_name: string | null;
    department_name: string | null;
    branch_name: string | null;
    date_of_joining: string | null;
    pan_number: string | null;
    uan_number: string | null;
  };

  company: {
    name: string;
    legal_name: string | null;
    gstin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logo_url: string | null;
    header_color: string | null;
    accent_color: string | null;
    footer_text: string | null;
    watermark_enabled: boolean;
    watermark_text: string | null;
    watermark_opacity: number;
    show_gstin: boolean;
    show_address: boolean;
  };

  period: {
    month: number;
    year: number;
    period_label: string;
    payslip_number: string;
  };

  currency: {
    code: string;
    symbol: string;
    exchange_rate: string | null;
  };

  earnings: Array<{ label: string; amount: number }>;
  deductions: Array<{ label: string; amount: number }>;
  fines: Array<{
    id: string;
    title: string;
    category: string | null;
    amount: number;
    description: string | null;
  }>;

  totals: {
    gross_salary: number;
    total_deductions: number;
    net_salary: number;
  };

  attendance: {
    total_working_days: number;
    present_days: number;
    absent_days: number;
    late_count: number;
    half_day_count: number;
    overtime_hours: number;
  } | null;
  pay_basis?: string | null;
  rate?: number | null;
  worked_units?: number | null;
  calculation_method?: string | null;
}

// ─── Enriched detail shape returned to callers ───────────────────────────────

export interface EnrichedPayslipDetail {
  id: string;
  payslip_number: string | null;
  month: number;
  year: number;
  status: 'draft' | 'processed' | 'paid';
  paid_at: string | null;
  remarks: string | null;
  snapshot_data: PayslipSnapshotData | null;

  employee: PayslipSnapshotData['employee'];
  company: PayslipSnapshotData['company'];
  period: PayslipSnapshotData['period'];
  currency: PayslipSnapshotData['currency'];
  earnings: PayslipSnapshotData['earnings'];
  deductions: PayslipSnapshotData['deductions'];
  fines: PayslipSnapshotData['fines'];
  totals: PayslipSnapshotData['totals'];
  attendance: PayslipSnapshotData['attendance'];

  // Payment info is always live — legitimately changes after snapshotting
  payment: {
    id: string;
    status: string;
    method: string;
    gateway: string | null;
    transaction_reference: string | null;
    payment_date: string | null;
    paid_at: string | null;
  } | null;
  pay_basis: string | null;
  rate: number | null;
  worked_units: number | null;
  calculation_method: string | null;
}

// ─── Month names ──────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Injectable()
export class PayslipService {
  private readonly logger = new Logger(PayslipService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly brandingEngine: BrandingEngineService,
  ) {}

  // ─── takeSnapshot ───────────────────────────────────────────────────────────
  /**
   * Captures an immutable JSON snapshot of the payslip into snapshot_data and
   * assigns a human-readable payslip_number if not already set.
   *
   * Called by PayrollService.processPayrollRun() after status is set to 'processed'.
   * Idempotent: SQL guard (WHERE snapshot_data IS NULL) prevents overwrites.
   */
  async takeSnapshot(payslipId: string, tenantId: string, processedBy: string): Promise<void> {
    // Fetch raw payslip row
    const { rows: psRows } = await this.db.query(
      `SELECT p.*, b.name AS branch_name
       FROM payslips p
       LEFT JOIN branches b ON b.id = p.branch_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [payslipId, tenantId],
    );
    if (!psRows.length) return;
    const ps = psRows[0];

    // Idempotency guard — if snapshot already exists, do not overwrite
    if (ps.snapshot_data) return;

    // Fetch employee profile
    const { rows: empRows } = await this.db.query(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name,
              e.date_of_joining, e.pan_number, e.uan_number,
              d.name AS designation_name,
              dept.name AS department_name
       FROM employees e
       LEFT JOIN designations d ON d.id = e.designation_id
       LEFT JOIN departments dept ON dept.id = e.department_id
       WHERE e.id = $1`,
      [ps.employee_id],
    );
    const emp = empRows[0] || {};

    // Fetch branding package (branch-specific overrides applied automatically)
    const branding = await this.brandingEngine.getBrandingPackage(
      tenantId, 'payslip', ps.branch_id,
    );

    // Fetch attendance summary for this period
    const periodStart = `${ps.year}-${String(ps.month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(ps.year, ps.month, 0)).toISOString().split('T')[0];
    const { rows: attRows } = await this.db.query(
      `SELECT total_working_days, present_days, absent_days, late_count,
              half_day_count, overtime_hours
       FROM payroll_attendance_summary
       WHERE tenant_id = $1 AND employee_id = $2
         AND period_start = $3 AND period_end = $4
       LIMIT 1`,
      [tenantId, ps.employee_id, periodStart, periodEnd],
    );

    // Fetch fine details if any were deducted on this payslip
    let fines: PayslipSnapshotData['fines'] = [];
    if (ps.fine_deduction_refs && ps.fine_deduction_refs.length > 0) {
      const { rows: fineRows } = await this.db.query(
        `SELECT ef.id, ef.title, ef.description, ef.fine_amount,
                dc.name AS category_name
         FROM employee_fines ef
         LEFT JOIN deduction_categories dc ON dc.id = ef.category_id
         WHERE ef.id = ANY($1)`,
        [ps.fine_deduction_refs],
      );
      fines = fineRows.map(f => ({
        id: f.id,
        title: f.title,
        category: f.category_name || null,
        amount: parseFloat(f.fine_amount),
        description: f.description || null,
      }));
    }

    // Generate payslip number
    const payslipNumber = await this._generatePayslipNumber(tenantId, ps.month, ps.year);

    // Map salary columns into labeled earnings/deductions arrays (skip zero values)
    const earnings = this._buildEarnings(ps);
    const deductions = this._buildDeductions(ps, fines);

    const snapshot: PayslipSnapshotData = {
      version: 1,
      captured_at: new Date().toISOString(),

      employee: {
        id: emp.id || ps.employee_id,
        employee_code: emp.employee_code || '',
        first_name: emp.first_name || '',
        last_name: emp.last_name || '',
        designation_name: emp.designation_name || null,
        department_name: emp.department_name || null,
        branch_name: ps.branch_name || null,
        date_of_joining: emp.date_of_joining
          ? new Date(emp.date_of_joining).toISOString().split('T')[0]
          : null,
        pan_number: emp.pan_number || null,
        uan_number: emp.uan_number || null,
      },

      company: {
        name: branding.companyName,
        legal_name: branding.legalName,
        gstin: branding.gstin,
        address: branding.address,
        phone: branding.phone,
        email: branding.email,
        logo_url: branding.payslipLogoUrl || branding.logoUrl,
        header_color: branding.headerColor,
        accent_color: branding.accentColor,
        footer_text: branding.footerText,
        watermark_enabled: branding.watermarkEnabled,
        watermark_text: branding.watermarkText,
        watermark_opacity: branding.watermarkOpacity,
        show_gstin: branding.showGstin,
        show_address: branding.showAddress,
      },

      period: {
        month: ps.month,
        year: ps.year,
        period_label: `${MONTH_NAMES[ps.month - 1]} ${ps.year}`,
        payslip_number: payslipNumber,
      },

      currency: {
        code: ps.currency || DEFAULT_CURRENCY.code,
        symbol: ps.currency_symbol || DEFAULT_CURRENCY.symbol,
        exchange_rate: ps.exchange_rate ?? null,
      },

      earnings,
      deductions,
      fines,

      totals: {
        gross_salary: parseFloat(ps.gross_salary),
        total_deductions: parseFloat(ps.total_deductions),
        net_salary: parseFloat(ps.net_salary),
      },

      attendance: attRows.length
        ? {
            total_working_days: parseInt(attRows[0].total_working_days, 10),
            present_days: parseInt(attRows[0].present_days, 10),
            absent_days: parseInt(attRows[0].absent_days, 10),
            late_count: parseInt(attRows[0].late_count, 10),
            half_day_count: parseInt(attRows[0].half_day_count, 10),
            overtime_hours: parseFloat(attRows[0].overtime_hours || '0'),
          }
        : null,
      pay_basis: ps.pay_basis || 'monthly_salary',
      rate: ps.rate ? parseFloat(ps.rate) : null,
      worked_units: ps.worked_units ? parseFloat(ps.worked_units) : null,
      calculation_method: ps.calculation_method || 'Monthly Salary',
    };

    // Write snapshot — IS NULL guard prevents overwrite (idempotent at SQL level)
    await this.db.query(
      `UPDATE payslips
       SET snapshot_data = $1, payslip_number = $2, updated_at = now()
       WHERE id = $3 AND tenant_id = $4 AND snapshot_data IS NULL`,
      [JSON.stringify(snapshot), payslipNumber, payslipId, tenantId],
    );
  }

  // ─── getPayslipDetail ───────────────────────────────────────────────────────
  /**
   * Returns fully enriched payslip detail, merging the frozen snapshot (if
   * available) with always-live payment status.
   *
   * For draft payslips without a snapshot, builds the enriched view on-the-fly
   * from live DB joins — same queries as takeSnapshot minus the write.
   *
   * Access control: when opts.employeeId is set, enforces ownership and throws
   * ForbiddenException if the payslip belongs to a different employee.
   */
  async getPayslipDetail(
    tenantId: string | null,
    payslipId: string,
    opts?: {
      employeeId?: string;
      actorId?: string;
      actorType?: 'admin' | 'employee';
      ipAddress?: string;
    },
  ): Promise<EnrichedPayslipDetail> {
    const { rows } = await this.db.query(
      `SELECT p.*, b.name AS branch_name
       FROM payslips p
       LEFT JOIN branches b ON b.id = p.branch_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [payslipId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Payslip not found');
    const ps = rows[0];

    // Enforce employee ownership when this is a self-service call
    if (opts?.employeeId && ps.employee_id !== opts.employeeId) {
      throw new ForbiddenException('Access denied');
    }

    let employee: PayslipSnapshotData['employee'];
    let company: PayslipSnapshotData['company'];
    let period: PayslipSnapshotData['period'];
    let currency: PayslipSnapshotData['currency'];
    let earnings: PayslipSnapshotData['earnings'];
    let deductions: PayslipSnapshotData['deductions'];
    let fines: PayslipSnapshotData['fines'];
    let totals: PayslipSnapshotData['totals'];
    let attendance: PayslipSnapshotData['attendance'];
    let pay_basis: string | null = null;
    let rate: number | null = null;
    let worked_units: number | null = null;
    let calculation_method: string | null = null;

    if (ps.snapshot_data) {
      // Fast path: use frozen snapshot
      const snap: PayslipSnapshotData = ps.snapshot_data;
      employee   = snap.employee;
      company    = snap.company;
      period     = snap.period;
      currency   = snap.currency || { code: DEFAULT_CURRENCY.code, symbol: DEFAULT_CURRENCY.symbol, exchange_rate: null };
      earnings   = snap.earnings;
      deductions = snap.deductions;
      fines      = snap.fines;
      totals     = snap.totals;
      attendance = snap.attendance;
      pay_basis  = snap.pay_basis || null;
      rate       = snap.rate != null ? parseFloat(snap.rate as any) : null;
      worked_units = snap.worked_units != null ? parseFloat(snap.worked_units as any) : null;
      calculation_method = snap.calculation_method || null;
    } else {
      // Fallback path: build enriched view from live joins (draft payslips)
      const [empResult, attResult] = await Promise.all([
        this.db.query(
          `SELECT e.id, e.employee_code, e.first_name, e.last_name,
                  e.date_of_joining, e.pan_number, e.uan_number,
                  d.name AS designation_name, dept.name AS department_name
           FROM employees e
           LEFT JOIN designations d ON d.id = e.designation_id
           LEFT JOIN departments dept ON dept.id = e.department_id
           WHERE e.id = $1`,
          [ps.employee_id],
        ),
        this.db.query(
          `SELECT total_working_days, present_days, absent_days, late_count,
                  half_day_count, overtime_hours
           FROM payroll_attendance_summary
           WHERE tenant_id = $1 AND employee_id = $2
             AND period_start = $3 AND period_end = $4
           LIMIT 1`,
          [
            ps.tenant_id,
            ps.employee_id,
            `${ps.year}-${String(ps.month).padStart(2, '0')}-01`,
            new Date(Date.UTC(ps.year, ps.month, 0)).toISOString().split('T')[0],
          ],
        ),
      ]);

      const emp = empResult.rows[0] || {};
      const branding = await this.brandingEngine.getBrandingPackage(
        ps.tenant_id, 'payslip', ps.branch_id,
      );

      // Fine details for fallback path
      let liveFines: PayslipSnapshotData['fines'] = [];
      if (ps.fine_deduction_refs?.length > 0) {
        const { rows: fineRows } = await this.db.query(
          `SELECT ef.id, ef.title, ef.description, ef.fine_amount,
                  dc.name AS category_name
           FROM employee_fines ef
           LEFT JOIN deduction_categories dc ON dc.id = ef.category_id
           WHERE ef.id = ANY($1)`,
          [ps.fine_deduction_refs],
        );
        liveFines = fineRows.map(f => ({
          id: f.id,
          title: f.title,
          category: f.category_name || null,
          amount: parseFloat(f.fine_amount),
          description: f.description || null,
        }));
      }

      employee = {
        id: emp.id || ps.employee_id,
        employee_code: emp.employee_code || '',
        first_name: emp.first_name || '',
        last_name: emp.last_name || '',
        designation_name: emp.designation_name || null,
        department_name: emp.department_name || null,
        branch_name: ps.branch_name || null,
        date_of_joining: emp.date_of_joining
          ? new Date(emp.date_of_joining).toISOString().split('T')[0]
          : null,
        pan_number: emp.pan_number || null,
        uan_number: emp.uan_number || null,
      };

      company = {
        name: branding.companyName,
        legal_name: branding.legalName,
        gstin: branding.gstin,
        address: branding.address,
        phone: branding.phone,
        email: branding.email,
        logo_url: branding.payslipLogoUrl || branding.logoUrl,
        header_color: branding.headerColor,
        accent_color: branding.accentColor,
        footer_text: branding.footerText,
        watermark_enabled: branding.watermarkEnabled,
        watermark_text: branding.watermarkText,
        watermark_opacity: branding.watermarkOpacity,
        show_gstin: branding.showGstin,
        show_address: branding.showAddress,
      };

      fines = liveFines;
      earnings   = this._buildEarnings(ps);
      deductions = this._buildDeductions(ps, liveFines);
      totals = {
        gross_salary: parseFloat(ps.gross_salary),
        total_deductions: parseFloat(ps.total_deductions),
        net_salary: parseFloat(ps.net_salary),
      };
      period = {
        month: ps.month,
        year: ps.year,
        period_label: `${MONTH_NAMES[ps.month - 1]} ${ps.year}`,
        payslip_number: ps.payslip_number || '',
      };
      currency = {
        code: ps.currency || DEFAULT_CURRENCY.code,
        symbol: ps.currency_symbol || DEFAULT_CURRENCY.symbol,
        exchange_rate: ps.exchange_rate ?? null,
      };
      attendance = attResult.rows.length
        ? {
            total_working_days: parseInt(attResult.rows[0].total_working_days, 10),
            present_days: parseInt(attResult.rows[0].present_days, 10),
            absent_days: parseInt(attResult.rows[0].absent_days, 10),
            late_count: parseInt(attResult.rows[0].late_count, 10),
            half_day_count: parseInt(attResult.rows[0].half_day_count, 10),
            overtime_hours: parseFloat(attResult.rows[0].overtime_hours || '0'),
          }
        : null;
      pay_basis  = ps.pay_basis || null;
      rate       = ps.rate != null ? parseFloat(ps.rate as any) : null;
      worked_units = ps.worked_units != null ? parseFloat(ps.worked_units as any) : null;
      calculation_method = ps.calculation_method || null;
    }

    // Payment is always fetched live — it changes after snapshot is taken
    const { rows: pmtRows } = await this.db.query(
      `SELECT id, status, payment_method, payment_gateway, transaction_reference,
              payment_date, processed_at
       FROM payroll_payments
       WHERE payslip_id = $1
       ORDER BY initiated_at DESC
       LIMIT 1`,
      [payslipId],
    );
    const pmt = pmtRows[0] || null;

    // Fire-and-forget access log
    if (opts?.actorId && opts.actorType) {
      this.logAccess(
        payslipId,
        ps.tenant_id,
        opts.actorId,
        opts.actorType,
        'view',
        { ipAddress: opts.ipAddress },
      ).catch(() => {});
    }

    return {
      id: ps.id,
      payslip_number: ps.payslip_number || null,
      month: ps.month,
      year: ps.year,
      status: ps.status,
      paid_at: ps.paid_at ? new Date(ps.paid_at).toISOString() : null,
      remarks: ps.remarks || null,
      snapshot_data: ps.snapshot_data || null,
      pay_basis,
      rate,
      worked_units,
      calculation_method,

      employee,
      company,
      period,
      currency,
      earnings,
      deductions,
      fines,
      totals,
      attendance,

      payment: pmt
        ? {
            id: pmt.id,
            status: pmt.status,
            method: pmt.payment_method,
            gateway: pmt.payment_gateway || null,
            transaction_reference: pmt.transaction_reference || null,
            payment_date: pmt.payment_date
              ? new Date(pmt.payment_date).toISOString().split('T')[0]
              : null,
            paid_at: pmt.processed_at ? new Date(pmt.processed_at).toISOString() : null,
          }
        : null,
    };
  }

  // ─── listEmployeePayslips ───────────────────────────────────────────────────
  /**
   * Self-service: returns paginated payslip list for an employee.
   * Only returns status IN ('processed', 'paid') — drafts not visible until finalized.
   */
  async listEmployeePayslips(
    tenantId: string,
    employeeId: string,
    filters: { year?: number; page?: number; limit?: number } = {},
  ) {
    const page  = Math.max(1, filters.page  ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 24));
    const offset = (page - 1) * limit;

    const params: any[] = [tenantId, employeeId];
    let where = `WHERE p.tenant_id = $1 AND p.employee_id = $2
                   AND p.status IN ('processed', 'paid')`;

    if (filters.year) {
      params.push(filters.year);
      where += ` AND p.year = $${params.length}`;
    }

    const countRes = await this.db.query(
      `SELECT COUNT(*) FROM payslips p ${where}`,
      params,
    );

    params.push(limit, offset);
    const { rows } = await this.db.query(
      `SELECT p.id, p.payslip_number, p.month, p.year,
              p.gross_salary, p.total_deductions, p.net_salary,
              p.overtime, p.status, p.paid_at
       FROM payslips p
       ${where}
       ORDER BY p.year DESC, p.month DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      data: rows.map(r => ({
        ...r,
        gross_salary:     parseFloat(r.gross_salary),
        total_deductions: parseFloat(r.total_deductions),
        net_salary:       parseFloat(r.net_salary),
        overtime_amount:  parseFloat(r.overtime || '0'),
        paid_at:          r.paid_at ? new Date(r.paid_at).toISOString() : null,
      })),
      total: parseInt(countRes.rows[0].count, 10),
      page,
      limit,
    };
  }

  // ─── logAccess ──────────────────────────────────────────────────────────────
  /**
   * Appends an entry to payslip_view_log. Fire-and-forget — callers should
   * use .catch(() => {}) so audit failure never blocks the response.
   */
  async logAccess(
    payslipId: string,
    tenantId: string,
    actorId: string,
    actorType: 'admin' | 'employee',
    action: 'view' | 'download' | 'print',
    meta?: { ipAddress?: string },
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO payslip_view_log
         (tenant_id, payslip_id, actor_id, actor_type, action, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, payslipId, actorId, actorType, action, meta?.ipAddress || null],
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _buildEarnings(ps: Record<string, any>): PayslipSnapshotData['earnings'] {
    const map: Array<[string, string]> = [
      ['basic',             'Basic Salary'],
      ['hra',               'HRA'],
      ['da',                'DA'],
      ['conveyance',        'Conveyance'],
      ['medical',           'Medical Allowance'],
      ['special_allowance', 'Special Allowance'],
      ['overtime',          'Overtime'],
      ['bonus',             'Bonus'],
    ];
    return map
      .map(([col, label]) => ({ label, amount: parseFloat(ps[col] || '0') }))
      .filter(e => e.amount > 0);
  }

  private _buildDeductions(
    ps: Record<string, any>,
    fines: PayslipSnapshotData['fines'],
  ): PayslipSnapshotData['deductions'] {
    const map: Array<[string, string]> = [
      ['pf',               'PF (Employee)'],
      ['esi',              'ESI (Employee)'],
      ['professional_tax', 'Professional Tax'],
      ['tds',              'TDS'],
      ['other_deductions', 'Other Deductions'],
    ];
    const base = map
      .map(([col, label]) => ({ label, amount: parseFloat(ps[col] || '0') }))
      .filter(d => d.amount > 0);

    const fineDeductions = fines.map(f => ({
      label: f.title,
      amount: f.amount,
    }));

    return [...base, ...fineDeductions];
  }

  private async _generatePayslipNumber(
    tenantId: string,
    month: number,
    year: number,
  ): Promise<string> {
    const mm = String(month).padStart(2, '0');
    const { rows } = await this.db.query(
      `SELECT COUNT(*) AS cnt
       FROM payslips
       WHERE tenant_id = $1 AND year = $2 AND month = $3
         AND payslip_number IS NOT NULL`,
      [tenantId, year, month],
    );
    const seq = parseInt(rows[0].cnt, 10) + 1;
    return `PS-${year}-${mm}-${String(seq).padStart(5, '0')}`;
  }
}
