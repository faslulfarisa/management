import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CredentialEncryptionService } from '../../../shared/crypto/credential-encryption.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { CreateBankAccountDto, UpdateBankAccountDto, VerifyBankAccountDto } from '../dto/bank-account.dto';

@Injectable()
export class BankAccountService {
  constructor(
    private db: DatabaseService,
    private encryption: CredentialEncryptionService,
    private auditLog: AuditLogService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private maskAccountNumber(decrypted: string): string {
    if (!decrypted || decrypted.length <= 4) return '****';
    return `${'*'.repeat(decrypted.length - 4)}${decrypted.slice(-4)}`;
  }

  private toPublic(row: any, decryptedNumber?: string): any {
    const masked = decryptedNumber
      ? this.maskAccountNumber(decryptedNumber)
      : '****';
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      employee_id: row.employee_id,
      account_holder_name: row.account_holder_name,
      bank_name: row.bank_name,
      account_number_masked: masked,
      ifsc_code: row.ifsc_code_plain ?? '****',   // set by callers that decrypt
      account_type: row.account_type,
      upi_id: row.upi_id,
      is_primary: row.is_primary,
      verification_status: row.verification_status,
      verified_at: row.verified_at,
      verification_notes: row.verification_notes,
      razorpay_fund_account_id: row.razorpay_fund_account_id,
      razorpay_contact_id: row.razorpay_contact_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  async findByEmployee(tenantId: string | null, employeeId: string): Promise<any[]> {
    let sql = `
      SELECT * FROM employee_bank_accounts
      WHERE employee_id = $1 AND deleted_at IS NULL
    `;
    const params: any[] = [employeeId];

    if (tenantId) {
      sql += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    sql += ' ORDER BY is_primary DESC, created_at ASC';
    const { rows } = await this.db.query(sql, params);

    return rows.map(row => {
      let decrypted: string | undefined;
      try { decrypted = this.encryption.decrypt(row.account_number_enc); } catch {}
      return this.toPublic(row, decrypted);
    });
  }

  async findById(id: string, tenantId: string | null): Promise<any> {
    let sql = 'SELECT * FROM employee_bank_accounts WHERE id = $1 AND deleted_at IS NULL';
    const params: any[] = [id];
    if (tenantId) { sql += ' AND tenant_id = $2'; params.push(tenantId); }

    const { rows } = await this.db.query(sql, params);
    if (!rows.length) throw new NotFoundException('Bank account not found');

    let decrypted: string | undefined;
    try { decrypted = this.encryption.decrypt(rows[0].account_number_enc); } catch {}
    return this.toPublic(rows[0], decrypted);
  }

  // Returns the raw decrypted row — for internal use by payment service only.
  async findByIdDecrypted(id: string, tenantId: string | null): Promise<{
    id: string; employee_id: string; tenant_id: string; bank_name: string;
    account_number: string; ifsc_code: string; account_type: string;
    upi_id: string | null; is_primary: boolean; verification_status: string;
    razorpay_fund_account_id: string | null; razorpay_contact_id: string | null;
  }> {
    let sql = 'SELECT * FROM employee_bank_accounts WHERE id = $1 AND deleted_at IS NULL';
    const params: any[] = [id];
    if (tenantId) { sql += ' AND tenant_id = $2'; params.push(tenantId); }

    const { rows } = await this.db.query(sql, params);
    if (!rows.length) throw new NotFoundException('Bank account not found');

    const row = rows[0];
    return {
      ...row,
      account_number: this.encryption.decrypt(row.account_number_enc),
      ifsc_code: this.encryption.decrypt(row.ifsc_code_enc),
    };
  }

  async findPrimaryByEmployee(employeeId: string, tenantId: string | null): Promise<any | null> {
    let sql = `
      SELECT * FROM employee_bank_accounts
      WHERE employee_id = $1 AND is_primary = TRUE AND deleted_at IS NULL
    `;
    const params: any[] = [employeeId];
    if (tenantId) { sql += ' AND tenant_id = $2'; params.push(tenantId); }

    const { rows } = await this.db.query(sql, params);
    if (!rows.length) return null;

    return {
      ...rows[0],
      account_number: this.encryption.decrypt(rows[0].account_number_enc),
      ifsc_code: this.encryption.decrypt(rows[0].ifsc_code_enc),
    };
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    tenantId: string | null,
    dto: CreateBankAccountDto,
    createdBy: string,
    ipAddress?: string,
  ): Promise<any> {
    // Resolve tenant from employee if super admin
    let tid = tenantId;
    if (!tid) {
      const { rows } = await this.db.query(
        'SELECT tenant_id FROM employees WHERE id = $1 LIMIT 1',
        [dto.employee_id],
      );
      if (!rows.length) throw new NotFoundException('Employee not found');
      tid = rows[0].tenant_id;
    }

    const accountNumberEnc = this.encryption.encrypt(dto.account_number);
    const ifscCodeEnc = this.encryption.encrypt(dto.ifsc_code.toUpperCase());
    const wantPrimary = dto.is_primary ?? false;

    const row = await this.db.transaction(async (client) => {
      // Clear existing primary if this should become primary
      if (wantPrimary) {
        await client.query(
          `UPDATE employee_bank_accounts
           SET is_primary = FALSE, updated_at = now()
           WHERE employee_id = $1 AND tenant_id = $2 AND is_primary = TRUE AND deleted_at IS NULL`,
          [dto.employee_id, tid],
        );
      }

      const { rows: inserted } = await client.query(
        `INSERT INTO employee_bank_accounts
           (tenant_id, branch_id, employee_id, account_holder_name, bank_name,
            account_number_enc, ifsc_code_enc, account_type, upi_id, is_primary, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          tid,
          dto.branch_id ?? null,
          dto.employee_id,
          dto.account_holder_name,
          dto.bank_name,
          accountNumberEnc,
          ifscCodeEnc,
          dto.account_type ?? 'savings',
          dto.upi_id ?? null,
          wantPrimary,
          createdBy,
        ],
      );
      return inserted[0];
    });

    try {
      await this.auditLog.log({
        tenantId: tid!,
        userId: createdBy,
        entityType: 'employee_bank_account',
        entityId: row.id,
        action: 'created',
        newValues: { employee_id: dto.employee_id, bank_name: dto.bank_name, is_primary: wantPrimary },
        ipAddress,
      });
    } catch {}

    let decrypted: string | undefined;
    try { decrypted = this.encryption.decrypt(row.account_number_enc); } catch {}
    return this.toPublic(row, decrypted);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    tenantId: string | null,
    dto: UpdateBankAccountDto,
    updatedBy: string,
    ipAddress?: string,
  ): Promise<any> {
    let sql = 'SELECT * FROM employee_bank_accounts WHERE id = $1 AND deleted_at IS NULL';
    const checkParams: any[] = [id];
    if (tenantId) { sql += ' AND tenant_id = $2'; checkParams.push(tenantId); }
    const { rows: existing } = await this.db.query(sql, checkParams);
    if (!existing.length) throw new NotFoundException('Bank account not found');

    const old = existing[0];
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (dto.account_holder_name !== undefined) { sets.push(`account_holder_name = $${idx++}`); params.push(dto.account_holder_name); }
    if (dto.bank_name !== undefined)            { sets.push(`bank_name = $${idx++}`); params.push(dto.bank_name); }
    if (dto.account_number !== undefined)       { sets.push(`account_number_enc = $${idx++}`); params.push(this.encryption.encrypt(dto.account_number)); }
    if (dto.ifsc_code !== undefined)            { sets.push(`ifsc_code_enc = $${idx++}`); params.push(this.encryption.encrypt(dto.ifsc_code.toUpperCase())); }
    if (dto.account_type !== undefined)         { sets.push(`account_type = $${idx++}`); params.push(dto.account_type); }
    if (dto.upi_id !== undefined)               { sets.push(`upi_id = $${idx++}`); params.push(dto.upi_id); }

    if (!sets.length) return this.findById(id, tenantId);

    sets.push(`updated_at = now()`);
    params.push(id, old.tenant_id);
    const { rows } = await this.db.query(
      `UPDATE employee_bank_accounts SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      params,
    );

    try {
      await this.auditLog.log({
        tenantId: old.tenant_id,
        userId: updatedBy,
        entityType: 'employee_bank_account',
        entityId: id,
        action: 'updated',
        oldValues: { bank_name: old.bank_name, account_type: old.account_type },
        newValues: { ...dto },
        ipAddress,
      });
    } catch {}

    let decrypted: string | undefined;
    try { decrypted = this.encryption.decrypt(rows[0].account_number_enc); } catch {}
    return this.toPublic(rows[0], decrypted);
  }

  // ─── Set Primary ─────────────────────────────────────────────────────────

  async setPrimary(
    id: string,
    tenantId: string | null,
    updatedBy: string,
    ipAddress?: string,
  ): Promise<any> {
    let sql = 'SELECT * FROM employee_bank_accounts WHERE id = $1 AND deleted_at IS NULL';
    const checkParams: any[] = [id];
    if (tenantId) { sql += ' AND tenant_id = $2'; checkParams.push(tenantId); }
    const { rows: existing } = await this.db.query(sql, checkParams);
    if (!existing.length) throw new NotFoundException('Bank account not found');

    const account = existing[0];

    await this.db.transaction(async (client) => {
      // Clear existing primary for this employee
      await client.query(
        `UPDATE employee_bank_accounts
         SET is_primary = FALSE, updated_at = now()
         WHERE employee_id = $1 AND tenant_id = $2 AND is_primary = TRUE AND deleted_at IS NULL`,
        [account.employee_id, account.tenant_id],
      );
      // Set new primary
      await client.query(
        `UPDATE employee_bank_accounts SET is_primary = TRUE, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [id, account.tenant_id],
      );
    });

    try {
      await this.auditLog.log({
        tenantId: account.tenant_id,
        userId: updatedBy,
        entityType: 'employee_bank_account',
        entityId: id,
        action: 'set_primary',
        newValues: { employee_id: account.employee_id },
        ipAddress,
      });
    } catch {}

    return this.findById(id, tenantId);
  }

  // ─── Verify ──────────────────────────────────────────────────────────────

  async verify(
    id: string,
    tenantId: string | null,
    dto: VerifyBankAccountDto,
    verifiedBy: string,
    ipAddress?: string,
  ): Promise<any> {
    let sql = 'SELECT * FROM employee_bank_accounts WHERE id = $1 AND deleted_at IS NULL';
    const checkParams: any[] = [id];
    if (tenantId) { sql += ' AND tenant_id = $2'; checkParams.push(tenantId); }
    const { rows: existing } = await this.db.query(sql, checkParams);
    if (!existing.length) throw new NotFoundException('Bank account not found');

    const { rows } = await this.db.query(
      `UPDATE employee_bank_accounts
       SET verification_status = $1, verified_by = $2, verified_at = now(),
           verification_notes = $3, updated_at = now()
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [dto.status, verifiedBy, dto.verification_notes ?? dto.notes ?? null, id, existing[0].tenant_id],
    );

    try {
      await this.auditLog.log({
        tenantId: existing[0].tenant_id,
        userId: verifiedBy,
        entityType: 'employee_bank_account',
        entityId: id,
        action: `verification_${dto.status}`,
        newValues: { status: dto.status, notes: dto.verification_notes ?? dto.notes },
        ipAddress,
      });
    } catch {}

    let decrypted: string | undefined;
    try { decrypted = this.encryption.decrypt(rows[0].account_number_enc); } catch {}
    return this.toPublic(rows[0], decrypted);
  }

  // ─── Soft Delete ─────────────────────────────────────────────────────────

  async remove(
    id: string,
    tenantId: string | null,
    deletedBy: string,
    ipAddress?: string,
  ): Promise<void> {
    let sql = 'SELECT * FROM employee_bank_accounts WHERE id = $1 AND deleted_at IS NULL';
    const checkParams: any[] = [id];
    if (tenantId) { sql += ' AND tenant_id = $2'; checkParams.push(tenantId); }
    const { rows } = await this.db.query(sql, checkParams);
    if (!rows.length) throw new NotFoundException('Bank account not found');

    if (rows[0].is_primary) {
      throw new BadRequestException(
        'Cannot delete the primary bank account. Set another account as primary first.',
      );
    }

    await this.db.query(
      `UPDATE employee_bank_accounts SET deleted_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, rows[0].tenant_id],
    );

    try {
      await this.auditLog.log({
        tenantId: rows[0].tenant_id,
        userId: deletedBy,
        entityType: 'employee_bank_account',
        entityId: id,
        action: 'deleted',
        ipAddress,
      });
    } catch {}
  }

  // ─── Razorpay linkage (called by payment service) ─────────────────────────

  async updateRazorpayIds(
    id: string,
    contactId: string,
    fundAccountId: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE employee_bank_accounts
       SET razorpay_contact_id = $1, razorpay_fund_account_id = $2, updated_at = now()
       WHERE id = $3`,
      [contactId, fundAccountId, id],
    );
  }
}
