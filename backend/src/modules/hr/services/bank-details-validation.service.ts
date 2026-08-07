import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

export interface BankValidationSummary {
  total: number;
  complete: EmployeeBankStatus[];
  missing: EmployeeBankStatus[];    // no primary bank account — blocks bank/Razorpay payments
  incomplete: EmployeeBankStatus[]; // account exists but unverified — warning only
}

export interface EmployeeBankStatus {
  employee_id: string;
  employee_code: string;
  name: string;
  email: string;
  branch_id: string | null;
  bank_account_id: string | null;
  bank_name: string | null;
  account_number_masked: string | null;
  verification_status: string | null;
  upi_id: string | null;
  net_salary: number | null;
  issue: 'missing_bank_account' | 'unverified_account' | null;
}

@Injectable()
export class BankDetailsValidationService {
  constructor(private db: DatabaseService) {}

  // Validate all employees in a payroll run
  async validatePayrollRun(
    payrollRunId: string,
    tenantId: string | null,
  ): Promise<BankValidationSummary> {
    let sql = `
      SELECT
        e.id            AS employee_id,
        e.employee_code,
        e.first_name || ' ' || e.last_name AS name,
        e.personal_email AS email,
        e.branch_id,
        ps.net_salary,
        eba.id          AS bank_account_id,
        eba.bank_name,
        eba.account_number_enc,
        eba.verification_status,
        eba.upi_id
      FROM payslips ps
      JOIN employees e ON e.id = ps.employee_id
      LEFT JOIN employee_bank_accounts eba
        ON eba.employee_id = e.id
        AND eba.is_primary = TRUE
        AND eba.deleted_at IS NULL
      WHERE ps.payroll_run_id = $1
    `;
    const params: any[] = [payrollRunId];

    if (tenantId) {
      sql += ' AND ps.tenant_id = $2';
      params.push(tenantId);
    }

    const { rows } = await this.db.query(sql, params);

    const complete: EmployeeBankStatus[] = [];
    const missing: EmployeeBankStatus[] = [];
    const incomplete: EmployeeBankStatus[] = [];

    for (const row of rows) {
      const masked = row.account_number_enc
        ? this.maskLast4(row.account_number_enc)
        : null;

      const status: EmployeeBankStatus = {
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        name: row.name,
        email: row.email,
        branch_id: row.branch_id,
        bank_account_id: row.bank_account_id,
        bank_name: row.bank_name,
        account_number_masked: masked,
        verification_status: row.verification_status,
        upi_id: row.upi_id,
        net_salary: row.net_salary ? parseFloat(row.net_salary) : null,
        issue: null,
      };

      if (!row.bank_account_id) {
        status.issue = 'missing_bank_account';
        missing.push(status);
      } else if (row.verification_status !== 'verified') {
        status.issue = 'unverified_account';
        incomplete.push(status);
      } else {
        complete.push(status);
      }
    }

    return { total: rows.length, complete, missing, incomplete };
  }

  // Validate a single employee — used when initiating individual payslip payment
  async validateEmployee(
    employeeId: string,
    tenantId: string | null,
  ): Promise<EmployeeBankStatus> {
    let sql = `
      SELECT
        e.id            AS employee_id,
        e.employee_code,
        e.first_name || ' ' || e.last_name AS name,
        e.personal_email AS email,
        e.branch_id,
        eba.id          AS bank_account_id,
        eba.bank_name,
        eba.account_number_enc,
        eba.verification_status,
        eba.upi_id
      FROM employees e
      LEFT JOIN employee_bank_accounts eba
        ON eba.employee_id = e.id
        AND eba.is_primary = TRUE
        AND eba.deleted_at IS NULL
      WHERE e.id = $1
    `;
    const params: any[] = [employeeId];
    if (tenantId) { sql += ' AND e.tenant_id = $2'; params.push(tenantId); }

    const { rows } = await this.db.query(sql, params);
    if (!rows.length) {
      return {
        employee_id: employeeId,
        employee_code: '',
        name: 'Unknown',
        email: '',
        branch_id: null,
        bank_account_id: null,
        bank_name: null,
        account_number_masked: null,
        verification_status: null,
        upi_id: null,
        net_salary: null,
        issue: 'missing_bank_account',
      };
    }

    const row = rows[0];
    const masked = row.account_number_enc ? this.maskLast4(row.account_number_enc) : null;
    let issue: EmployeeBankStatus['issue'] = null;
    if (!row.bank_account_id) issue = 'missing_bank_account';
    else if (row.verification_status !== 'verified') issue = 'unverified_account';

    return {
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      name: row.name,
      email: row.email,
      branch_id: row.branch_id,
      bank_account_id: row.bank_account_id,
      bank_name: row.bank_name,
      account_number_masked: masked,
      verification_status: row.verification_status,
      upi_id: row.upi_id,
      net_salary: null,
      issue,
    };
  }

  // Account numbers are stored as AES-256-GCM ciphertext — we cannot decrypt here
  // (no CredentialEncryptionService injected to avoid leaking plaintext in list queries).
  // We show "****" for the encrypted blob to signal it is stored but hidden.
  private maskLast4(enc: string): string {
    // If key is not set, enc == plaintext — mask it
    if (!enc.startsWith('enc:v1:')) {
      return enc.length > 4
        ? `${'*'.repeat(enc.length - 4)}${enc.slice(-4)}`
        : '****';
    }
    return '****';  // ciphertext — plaintext length unknown; show generic mask
  }
}
