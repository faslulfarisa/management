import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';
import { CredentialEncryptionService } from '../../../shared/crypto/credential-encryption.service';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

const SAFE_SELECT = `
  SELECT id, tenant_id, branch_id, account_label, account_holder_name, bank_name,
         ifsc_code, account_type, upi_id, is_primary, use_for_invoices,
         use_for_payroll, created_at, updated_at
`;

@Injectable()
export class CompanyBankAccountService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
    private readonly crypto: CredentialEncryptionService,
  ) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      `${SAFE_SELECT}, account_number_enc
       FROM company_bank_accounts
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY is_primary DESC, created_at ASC`,
      [tenantId],
    );

    return rows.map(row => {
      const { account_number_enc, ...rest } = row;
      let accountLast4: string | null = null;
      if (account_number_enc) {
        try {
          const plain = this.crypto.decrypt(account_number_enc);
          accountLast4 = plain.length >= 4 ? plain.slice(-4) : plain;
        } catch {
          accountLast4 = '****';
        }
      }
      return { ...rest, account_last4: accountLast4 };
    });
  }

  async create(
    tenantId: string,
    userId: string,
    data: {
      accountLabel?: string;
      accountHolderName?: string;
      bankName?: string;
      accountNumber?: string;
      ifscCode?: string;
      accountType?: string;
      upiId?: string;
      branchId?: string;
      isPrimary?: boolean;
      useForInvoices?: boolean;
      useForPayroll?: boolean;
    },
    meta: RequestMeta,
  ) {
    if (!data.bankName && !data.upiId) {
      throw new BadRequestException('Provide at least a bank name or UPI ID');
    }

    const encAccountNumber = data.accountNumber
      ? this.crypto.encrypt(data.accountNumber)
      : null;

    return this.db.transaction(async (client) => {
      if (data.isPrimary) {
        await client.query(
          `UPDATE company_bank_accounts SET is_primary = FALSE, updated_at = now()
           WHERE tenant_id = $1 AND deleted_at IS NULL`,
          [tenantId],
        );
      }

      const { rows } = await client.query(
        `INSERT INTO company_bank_accounts
           (tenant_id, branch_id, account_label, account_holder_name, bank_name,
            account_number_enc, ifsc_code, account_type, upi_id,
            is_primary, use_for_invoices, use_for_payroll)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${SAFE_SELECT.trim().replace('SELECT ', '')}`,
        [
          tenantId,
          data.branchId ?? null,
          data.accountLabel ?? null,
          data.accountHolderName ?? null,
          data.bankName ?? null,
          encAccountNumber,
          data.ifscCode ?? null,
          data.accountType ?? null,
          data.upiId ?? null,
          data.isPrimary ?? false,
          data.useForInvoices ?? false,
          data.useForPayroll ?? false,
        ],
      );

      await this.auditLog.log({
        tenantId,
        userId,
        entityType: 'company_bank_account',
        entityId: rows[0].id,
        action: 'create',
        newValues: { ...rows[0], account_number: data.accountNumber ? '****' : null },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return rows[0];
    });
  }

  async update(
    tenantId: string,
    userId: string,
    accountId: string,
    data: {
      accountLabel?: string;
      accountHolderName?: string;
      bankName?: string;
      accountNumber?: string;
      ifscCode?: string;
      accountType?: string;
      upiId?: string;
      isPrimary?: boolean;
      useForInvoices?: boolean;
      useForPayroll?: boolean;
    },
    meta: RequestMeta,
  ) {
    const existing = await this._findOneRaw(tenantId, accountId);

    const colMap: Record<string, string> = {
      accountLabel: 'account_label',
      accountHolderName: 'account_holder_name',
      bankName: 'bank_name',
      ifscCode: 'ifsc_code',
      accountType: 'account_type',
      upiId: 'upi_id',
      isPrimary: 'is_primary',
      useForInvoices: 'use_for_invoices',
      useForPayroll: 'use_for_payroll',
    };

    return this.db.transaction(async (client) => {
      if (data.isPrimary) {
        await client.query(
          `UPDATE company_bank_accounts SET is_primary = FALSE, updated_at = now()
           WHERE tenant_id = $1 AND id != $2 AND deleted_at IS NULL`,
          [tenantId, accountId],
        );
      }

      const sets: string[] = [];
      const vals: any[] = [accountId];
      let idx = 2;

      for (const [jsKey, dbCol] of Object.entries(colMap)) {
        if (data[jsKey] !== undefined) {
          sets.push(`${dbCol} = $${idx++}`);
          vals.push(data[jsKey]);
        }
      }
      if (data.accountNumber !== undefined) {
        sets.push(`account_number_enc = $${idx++}`);
        vals.push(data.accountNumber ? this.crypto.encrypt(data.accountNumber) : null);
      }

      if (!sets.length) throw new BadRequestException('No fields provided to update');

      sets.push(`updated_at = now()`);

      vals.push(tenantId);
      const tenantParamIdx = idx;

      const { rows } = await client.query(
        `UPDATE company_bank_accounts
         SET ${sets.join(', ')}
         WHERE id = $1 AND tenant_id = $${tenantParamIdx} AND deleted_at IS NULL
         RETURNING ${SAFE_SELECT.trim().replace('SELECT ', '')}`,
        vals,
      );

      await this.auditLog.log({
        tenantId,
        userId,
        entityType: 'company_bank_account',
        entityId: accountId,
        action: 'update',
        oldValues: existing,
        newValues: rows[0],
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return rows[0];
    });
  }

  async remove(
    tenantId: string,
    userId: string,
    accountId: string,
    meta: RequestMeta,
  ) {
    const existing = await this._findOneRaw(tenantId, accountId);

    await this.db.query(
      `UPDATE company_bank_accounts SET deleted_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId],
    );

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'company_bank_account',
      entityId: accountId,
      action: 'delete',
      oldValues: existing,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { success: true };
  }

  private async _findOneRaw(tenantId: string, accountId: string) {
    const { rows } = await this.db.query(
      `${SAFE_SELECT} FROM company_bank_accounts
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [accountId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Bank account not found');
    return rows[0];
  }
}
