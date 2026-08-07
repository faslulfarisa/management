import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { assertUniqueCode, translateUniqueViolation } from '../../../shared/unique-code.validator';

function parseDate(d: any): string | null {
  return d && typeof d === 'string' && d.trim() !== '' ? d : null;
}

function parseDateOrDefault(d: any): string {
  return d && typeof d === 'string' && d.trim() !== '' ? d : new Date().toISOString().split('T')[0];
}

const UNIQUE_VIOLATION = '23505';
const MAX_RETRY = 5;

@Injectable()
export class FinanceService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    @Inject(forwardRef(() => ApprovalEngineService))
    private approvalEngine: ApprovalEngineService,
  ) {}

  private async audit(
    tenantId: string,
    userId: string,
    entityType: string,
    entityId: string,
    action: string,
    oldValues?: any,
    newValues?: any,
  ) {
    try {
      await this.auditLog.log({ tenantId, userId, entityType, entityId, action, oldValues, newValues });
    } catch (err) {
      // Don't let audit failures break the financial write
      // eslint-disable-next-line no-console
      console.error('[finance] audit log failed', err);
    }
  }

  /* ─── Chart of Accounts ────────────────────────────────────────────── */
  async getAccounts(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND is_active = true ORDER BY code',
      [tenantId],
    );
    return rows;
  }

  async createAccount(tenantId: string, userId: string, data: any) {
    if (data.code) {
      await assertUniqueCode(this.db, 'chart_of_accounts', tenantId, 'code', data.code, {
        label: 'Account code',
        deletionField: 'is_active',
      });
    }
    try {
      const { rows } = await this.db.query(
        'INSERT INTO chart_of_accounts (tenant_id, code, name, type, parent_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [tenantId, data.code, data.name, data.type, data.parent_id || null],
      );
      await this.audit(tenantId, userId, 'finance.account', rows[0].id, 'create', null, rows[0]);
      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Account code');
      throw e;
    }
  }

  /* ─── Journal Entries ───────────────────────────────────────────────── */
  async getJournalEntries(tenantId: string, filters: any) {
    const { page = 1, limit = 20, date_from, date_to, status } = filters;
    let query = 'SELECT * FROM journal_entries WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (date_from && typeof date_from === 'string' && date_from.trim() !== '') { query += ` AND date >= $${idx++}`; params.push(date_from); }
    if (date_to && typeof date_to === 'string' && date_to.trim() !== '')   { query += ` AND date <= $${idx++}`; params.push(date_to); }
    if (status)    { query += ` AND status = $${idx++}`; params.push(status); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createJournalEntry(tenantId: string, createdBy: string, data: any) {
    const lines: any[] = data.lines || [];
    if (lines.length < 2) {
      throw new BadRequestException('Journal entry requires at least two lines (debit and credit)');
    }
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseFloat(line.debit || 0);
      totalCredit += parseFloat(line.credit || 0);
    }
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new BadRequestException(
        `Journal entry must balance: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`,
      );
    }

    const { rows } = await this.db.query(
      'INSERT INTO journal_entries (tenant_id, voucher_number, date, description, reference, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [tenantId, data.voucher_number, data.date, data.description, data.reference, createdBy],
    );
    const jeId = rows[0].id;
    for (const line of lines) {
      await this.db.query(
        'INSERT INTO journal_entry_lines (tenant_id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)',
        [tenantId, jeId, line.account_id, line.debit || 0, line.credit || 0, line.description],
      );
    }
    await this.audit(tenantId, createdBy, 'finance.journal_entry', jeId, 'create', null, { ...rows[0], lines });
    return rows[0];
  }

  async approveJournalEntry(id: string, tenantId: string, approvedBy: string) {
    const { rows } = await this.db.query(
      `UPDATE journal_entries SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $3 AND status = 'draft' RETURNING *`,
      [id, approvedBy, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Journal entry not found or not in draft status');
    await this.audit(tenantId, approvedBy, 'finance.journal_entry', id, 'approve',
      { status: 'draft' }, { status: 'approved' });
    return rows[0];
  }

  /* ─── Expenses ──────────────────────────────────────────────────────── */
  async getExpenses(tenantId: string, filters: any) {
    const { page = 1, limit = 50, status, employee_id, category, date_from, date_to, branch_id } = filters;
    let query = `SELECT e.*, emp.first_name, emp.last_name FROM expenses e
      LEFT JOIN employees emp ON e.employee_id = emp.id WHERE e.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (status)      { query += ` AND e.status = $${idx++}`;       params.push(status); }
    if (employee_id) { query += ` AND e.employee_id = $${idx++}`;  params.push(employee_id); }
    if (category)    { query += ` AND e.category = $${idx++}`;     params.push(category); }
    if (date_from && typeof date_from === 'string' && date_from.trim() !== '')   { query += ` AND e.date >= $${idx++}`;        params.push(date_from); }
    if (date_to && typeof date_to === 'string' && date_to.trim() !== '')     { query += ` AND e.date <= $${idx++}`;        params.push(date_to); }
    if (branch_id)   { query += ` AND e.branch_id = $${idx++}`;    params.push(branch_id); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY e.date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createExpense(tenantId: string, userId: string, data: any) {
    let branchId = data.branch_id ?? null;
    if (!branchId && data.employee_id) {
      const { rows: empRows } = await this.db.query(
        'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
        [data.employee_id, tenantId],
      );
      branchId = empRows[0]?.branch_id ?? null;
    }
    const { rows } = await this.db.query(
      `INSERT INTO expenses (tenant_id, employee_id, category, amount, date, description, receipt_url, branch_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, data.employee_id || null, data.category, data.amount, parseDateOrDefault(data.date), data.description, data.receipt_url, branchId],
    );
    await this.audit(tenantId, userId, 'finance.expense', rows[0].id, 'create', null, rows[0]);

    // Register in centralized approval registry
    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'expense',
      entityId: rows[0].id,
      entityTable: 'expenses',
      submittedBy: data.employee_id || userId,
      branchId: branchId ?? null,
      title: `Expense: ${data.category} – ${data.amount} (${data.description ?? ''})`.slice(0, 120),
      metadata: { category: data.category, amount: data.amount, employee_id: data.employee_id },
    });

    return rows[0];
  }

  async approveExpense(id: string, tenantId: string, approvedBy: string, reason: string) {
    const result = await this.approvalEngine.approveByEntity(id, 'expenses', tenantId, approvedBy, reason);
    await this.audit(tenantId, approvedBy, 'finance.expense', id, 'approve',
      { status: 'pending' }, { status: result.fullyApproved ? 'approved' : 'under_review' });
    return result;
  }

  async rejectExpense(id: string, tenantId: string, userId: string, reason: string) {
    const result = await this.approvalEngine.rejectByEntity(id, 'expenses', tenantId, userId, reason);
    await this.audit(tenantId, userId, 'finance.expense', id, 'reject',
      { status: 'pending' }, { status: 'rejected' });
    return result;
  }

  /* ─── Invoices ──────────────────────────────────────────────────────── */
  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const { rows } = await this.db.query(
      `SELECT COUNT(*) as cnt FROM invoices WHERE tenant_id = $1 AND EXTRACT(YEAR FROM issue_date) = $2`,
      [tenantId, year],
    );
    const seq = parseInt(rows[0].cnt) + 1;
    return `INV-${year}-${String(seq).padStart(4, '0')}`;
  }

  async getInvoices(tenantId: string, filters: any) {
    const { status, search, page = 1, limit = 50, branch_id } = filters;
    let query = `SELECT i.*,
      (SELECT COALESCE(SUM(amount),0) FROM finance_payments WHERE invoice_id = i.id) as paid_amount
      FROM invoices i WHERE i.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (status)    { query += ` AND i.status = $${idx++}`; params.push(status); }
    if (search)    { query += ` AND (i.customer_name ILIKE $${idx} OR i.invoice_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (branch_id) { query += ` AND i.branch_id = $${idx++}`; params.push(branch_id); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);
    const { rows } = await this.db.query(query, params);

    // Count
    let countQ = `SELECT COUNT(*) as total FROM invoices i WHERE i.tenant_id = $1`;
    const countParams: any[] = [tenantId];
    let ci = 2;
    if (status)    { countQ += ` AND i.status = $${ci++}`; countParams.push(status); }
    if (search)    { countQ += ` AND (i.customer_name ILIKE $${ci} OR i.invoice_number ILIKE $${ci})`; countParams.push(`%${search}%`); ci++; }
    if (branch_id) { countQ += ` AND i.branch_id = $${ci++}`; countParams.push(branch_id); }
    const { rows: countRows } = await this.db.query(countQ, countParams);
    return { data: rows, total: parseInt(countRows[0].total) };
  }

  async getInvoiceById(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Invoice not found');
    const { rows: lines } = await this.db.query(
      `SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order`,
      [id],
    );
    const { rows: payments } = await this.db.query(
      `SELECT * FROM finance_payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [id],
    );
    return { ...rows[0], line_items: lines, payments };
  }

  async createInvoice(tenantId: string, createdBy: string, data: any) {
    // Compute totals from line items
    let subtotal = 0; let taxAmount = 0;
    const lines = data.line_items || [];
    for (const l of lines) {
      const lineBase = parseFloat(l.unit_price) * parseFloat(l.quantity) * (1 - (parseFloat(l.discount_pct || 0) / 100));
      const lineTax = lineBase * (parseFloat(l.tax_rate || 0) / 100);
      l.amount = lineBase + lineTax;
      subtotal += lineBase;
      taxAmount += lineTax;
    }
    const discountAmount = parseFloat(data.discount_amount || 0);
    const totalAmount = subtotal + taxAmount - discountAmount;

    // Retry on invoice-number unique-violation to handle concurrent creates
    let invoice: any;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const invoiceNumber = data.invoice_number || await this.generateInvoiceNumber(tenantId);
      try {
        const { rows } = await this.db.query(
          `INSERT INTO invoices (tenant_id, invoice_number, customer_name, customer_email, customer_phone, customer_address, customer_gstin,
            issue_date, due_date, currency, subtotal, discount_amount, tax_amount, total_amount, notes, terms, status, source, ocr_raw_text, created_by, branch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
          [tenantId, invoiceNumber, data.customer_name, data.customer_email, data.customer_phone, data.customer_address,
           data.customer_gstin, parseDateOrDefault(data.issue_date), parseDate(data.due_date),
           data.currency || 'INR', subtotal, discountAmount, taxAmount, totalAmount, data.notes, data.terms,
           data.status || 'draft', data.source || 'manual', data.ocr_raw_text || null, createdBy,
           data.branch_id || null],
        );
        invoice = rows[0];
        break;
      } catch (err: any) {
        if (err?.code === UNIQUE_VIOLATION && !data.invoice_number && attempt < MAX_RETRY - 1) {
          continue; // collision on auto-generated number; retry with fresh count
        }
        throw err;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await this.db.query(
        `INSERT INTO invoice_line_items (tenant_id, invoice_id, description, hsn_sac, quantity, unit, unit_price, discount_pct, tax_rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, invoice.id, l.description, l.hsn_sac, l.quantity, l.unit || 'nos', l.unit_price, l.discount_pct || 0, l.tax_rate || 0, l.amount, i],
      );
    }
    await this.audit(tenantId, createdBy, 'finance.invoice', invoice.id, 'create', null, { ...invoice, line_items: lines });
    return invoice;
  }

  async updateInvoice(id: string, tenantId: string, userId: string, data: any) {
    // Recalculate totals
    const lines = data.line_items || [];
    let subtotal = 0; let taxAmount = 0;
    for (const l of lines) {
      const lineBase = parseFloat(l.unit_price) * parseFloat(l.quantity) * (1 - (parseFloat(l.discount_pct || 0) / 100));
      const lineTax = lineBase * (parseFloat(l.tax_rate || 0) / 100);
      l.amount = lineBase + lineTax;
      subtotal += lineBase;
      taxAmount += lineTax;
    }
    const discountAmount = parseFloat(data.discount_amount || 0);
    const totalAmount = subtotal + taxAmount - discountAmount;

    // Only draft invoices can be edited
    const { rows: existing } = await this.db.query(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!existing.length) throw new NotFoundException('Invoice not found');
    if (existing[0].status !== 'draft') {
      throw new BadRequestException(`Cannot edit invoice in '${existing[0].status}' status; only draft invoices are editable`);
    }

    const { rows } = await this.db.query(
      `UPDATE invoices SET customer_name=$2, customer_email=$3, customer_phone=$4, customer_address=$5, customer_gstin=$6,
        issue_date=$7, due_date=$8, subtotal=$9, discount_amount=$10, tax_amount=$11, total_amount=$12, notes=$13, terms=$14,
        status=$15, updated_at=now()
       WHERE id=$1 AND tenant_id=$16 AND status='draft' RETURNING *`,
      [id, data.customer_name, data.customer_email, data.customer_phone, data.customer_address, data.customer_gstin,
       parseDateOrDefault(data.issue_date), parseDate(data.due_date), subtotal, discountAmount, taxAmount, totalAmount,
       data.notes, data.terms, data.status || 'draft', tenantId],
    );
    if (!rows.length) throw new BadRequestException('Invoice could not be updated; status changed concurrently');

    // Rebuild line items
    await this.db.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [id]);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await this.db.query(
        `INSERT INTO invoice_line_items (tenant_id, invoice_id, description, hsn_sac, quantity, unit, unit_price, discount_pct, tax_rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, id, l.description, l.hsn_sac, l.quantity, l.unit || 'nos', l.unit_price, l.discount_pct || 0, l.tax_rate || 0, l.amount, i],
      );
    }
    await this.audit(tenantId, userId, 'finance.invoice', id, 'update', existing[0], { ...rows[0], line_items: lines });
    return rows[0];
  }

  async sendInvoice(id: string, tenantId: string, userId: string) {
    const { rows } = await this.db.query(
      `UPDATE invoices SET status='sent', updated_at=now()
       WHERE id=$1 AND tenant_id=$2 AND status='draft' RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new BadRequestException('Invoice not found or not in draft status');
    await this.audit(tenantId, userId, 'finance.invoice', id, 'send',
      { status: 'draft' }, { status: 'sent' });
    return rows[0];
  }

  async markInvoicePaid(id: string, tenantId: string, userId: string, paymentData: any) {
    // Lock-free read of current state
    const { rows: existing } = await this.db.query(
      `SELECT id, total_amount, currency, status,
        (SELECT COALESCE(SUM(amount),0) FROM finance_payments WHERE invoice_id = invoices.id) AS amount_paid
       FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!existing.length) throw new NotFoundException('Invoice not found');
    const inv = existing[0];
    if (!['sent', 'overdue', 'partial'].includes(inv.status)) {
      throw new BadRequestException(
        `Cannot mark invoice paid from '${inv.status}' status; invoice must be sent, overdue, or partial`,
      );
    }

    const total = parseFloat(inv.total_amount);
    const alreadyPaid = parseFloat(inv.amount_paid);
    const remaining = total - alreadyPaid;
    const amount = paymentData.amount != null ? parseFloat(paymentData.amount) : remaining;

    if (!(amount > 0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (amount - remaining > 0.005) {
      throw new BadRequestException(
        `Cannot overpay invoice: remaining ${remaining.toFixed(2)}, attempted ${amount.toFixed(2)}`,
      );
    }

    await this.db.query(
      `INSERT INTO finance_payments (tenant_id, payment_type, payment_date, amount, currency, payment_method, reference, notes, invoice_id, created_by)
       VALUES ($1,'received',$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, parseDateOrDefault(paymentData.payment_date),
       amount, inv.currency,
       paymentData.payment_method || 'bank', paymentData.reference, paymentData.notes, id, userId],
    );

    // Recompute amount_paid from payments table and determine new status
    const { rows: sumRows } = await this.db.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM finance_payments WHERE invoice_id = $1`,
      [id],
    );
    const newPaid = parseFloat(sumRows[0].total);
    const newStatus = newPaid + 0.005 >= total ? 'paid' : 'partial';

    const { rows } = await this.db.query(
      `UPDATE invoices SET status=$2, amount_paid=$3, updated_at=now() WHERE id=$1 AND tenant_id=$4 RETURNING *`,
      [id, newStatus, newPaid, tenantId],
    );
    await this.audit(tenantId, userId, 'finance.invoice', id, 'mark_paid',
      { status: inv.status, amount_paid: alreadyPaid },
      { status: newStatus, amount_paid: newPaid, payment_amount: amount });
    return rows[0];
  }

  /* ─── Vendor Bills ──────────────────────────────────────────────────── */
  private async generateBillNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const { rows } = await this.db.query(
      `SELECT COUNT(*) as cnt FROM vendor_bills WHERE tenant_id = $1 AND EXTRACT(YEAR FROM bill_date) = $2`,
      [tenantId, year],
    );
    const seq = parseInt(rows[0].cnt) + 1;
    return `BILL-${year}-${String(seq).padStart(4, '0')}`;
  }

  async getBills(tenantId: string, filters: any) {
    const { status, search, page = 1, limit = 50, branch_id } = filters;
    let query = `SELECT * FROM vendor_bills WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (status)    { query += ` AND status = $${idx++}`; params.push(status); }
    if (search)    { query += ` AND (vendor_name ILIKE $${idx} OR bill_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (branch_id) { query += ` AND branch_id = $${idx++}`; params.push(branch_id); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async getBillById(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM vendor_bills WHERE id = $1 AND tenant_id = $2`, [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Bill not found');
    const { rows: lines } = await this.db.query(
      `SELECT * FROM vendor_bill_line_items WHERE bill_id = $1 ORDER BY sort_order`, [id],
    );
    return { ...rows[0], line_items: lines };
  }

  async createBill(tenantId: string, createdBy: string, data: any) {
    const lines = data.line_items || [];
    let subtotal = 0; let taxAmount = 0;
    for (const l of lines) {
      const lineBase = parseFloat(l.unit_price) * parseFloat(l.quantity);
      const lineTax = lineBase * (parseFloat(l.tax_rate || 0) / 100);
      l.amount = lineBase + lineTax;
      subtotal += lineBase; taxAmount += lineTax;
    }
    const totalAmount = subtotal + taxAmount;

    // Retry on bill-number unique-violation to handle concurrent creates
    let bill: any;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const billNumber = data.bill_number || await this.generateBillNumber(tenantId);
      try {
        const { rows } = await this.db.query(
          `INSERT INTO vendor_bills (tenant_id, bill_number, vendor_name, vendor_email, vendor_gstin, bill_date, due_date,
            subtotal, tax_amount, total_amount, notes, status, source, ocr_raw_text, created_by, branch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [tenantId, billNumber, data.vendor_name, data.vendor_email, data.vendor_gstin,
           parseDateOrDefault(data.bill_date), parseDate(data.due_date),
           subtotal, taxAmount, totalAmount, data.notes, data.status || 'pending',
           data.source || 'manual', data.ocr_raw_text || null, createdBy, data.branch_id || null],
        );
        bill = rows[0];
        break;
      } catch (err: any) {
        if (err?.code === UNIQUE_VIOLATION && !data.bill_number && attempt < MAX_RETRY - 1) {
          continue;
        }
        throw err;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await this.db.query(
        `INSERT INTO vendor_bill_line_items (tenant_id, bill_id, description, hsn_sac, quantity, unit, unit_price, tax_rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId, bill.id, l.description, l.hsn_sac, l.quantity, l.unit || 'nos', l.unit_price, l.tax_rate || 0, l.amount, i],
      );
    }
    await this.audit(tenantId, createdBy, 'finance.bill', bill.id, 'create', null, { ...bill, line_items: lines });
    return bill;
  }

  async approveBill(id: string, tenantId: string, approvedBy: string) {
    const { rows } = await this.db.query(
      `UPDATE vendor_bills SET status='approved', approved_by=$2, approved_at=now(), updated_at=now()
       WHERE id=$1 AND tenant_id=$3 AND status='pending' RETURNING *`,
      [id, approvedBy, tenantId],
    );
    if (!rows.length) throw new BadRequestException('Bill not found or not in pending status');
    await this.audit(tenantId, approvedBy, 'finance.bill', id, 'approve',
      { status: 'pending' }, { status: 'approved' });
    return rows[0];
  }

  async payBill(id: string, tenantId: string, userId: string, paymentData: any) {
    const { rows: existing } = await this.db.query(
      `SELECT id, total_amount, currency, status,
        (SELECT COALESCE(SUM(amount),0) FROM finance_payments WHERE bill_id = vendor_bills.id) AS amount_paid
       FROM vendor_bills WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!existing.length) throw new NotFoundException('Bill not found');
    const bill = existing[0];
    if (!['approved', 'partial'].includes(bill.status)) {
      throw new BadRequestException(
        `Cannot pay bill from '${bill.status}' status; bill must be approved or partial`,
      );
    }

    const total = parseFloat(bill.total_amount);
    const alreadyPaid = parseFloat(bill.amount_paid);
    const remaining = total - alreadyPaid;
    const amount = paymentData.amount != null ? parseFloat(paymentData.amount) : remaining;

    if (!(amount > 0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (amount - remaining > 0.005) {
      throw new BadRequestException(
        `Cannot overpay bill: remaining ${remaining.toFixed(2)}, attempted ${amount.toFixed(2)}`,
      );
    }

    await this.db.query(
      `INSERT INTO finance_payments (tenant_id, payment_type, payment_date, amount, currency, payment_method, reference, notes, bill_id, created_by)
       VALUES ($1,'made',$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, parseDateOrDefault(paymentData.payment_date),
       amount, bill.currency,
       paymentData.payment_method || 'bank', paymentData.reference, paymentData.notes, id, userId],
    );

    const { rows: sumRows } = await this.db.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM finance_payments WHERE bill_id = $1`,
      [id],
    );
    const newPaid = parseFloat(sumRows[0].total);
    const newStatus = newPaid + 0.005 >= total ? 'paid' : 'partial';

    const { rows } = await this.db.query(
      `UPDATE vendor_bills SET status=$2, amount_paid=$3, updated_at=now() WHERE id=$1 AND tenant_id=$4 RETURNING *`,
      [id, newStatus, newPaid, tenantId],
    );
    await this.audit(tenantId, userId, 'finance.bill', id, 'pay',
      { status: bill.status, amount_paid: alreadyPaid },
      { status: newStatus, amount_paid: newPaid, payment_amount: amount });
    return rows[0];
  }

  /* ─── Payments ──────────────────────────────────────────────────────── */
  async getPayments(tenantId: string, filters: any) {
    const { type, page = 1, limit = 50, branch_id } = filters;
    let query = `SELECT * FROM finance_payments WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (type)      { query += ` AND payment_type = $${idx++}`; params.push(type); }
    if (branch_id) { query += ` AND branch_id = $${idx++}`; params.push(branch_id); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY payment_date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  /* ─── Cashbook ──────────────────────────────────────────────────────── */
  async getCashbook(tenantId: string, filters: any) {
    const { date_from, date_to, page = 1, limit = 100, branch_id } = filters;
    let query = `SELECT * FROM cashbook_entries WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (date_from && typeof date_from === 'string' && date_from.trim() !== '') { query += ` AND entry_date >= $${idx++}`; params.push(date_from); }
    if (date_to && typeof date_to === 'string' && date_to.trim() !== '')   { query += ` AND entry_date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { query += ` AND branch_id = $${idx++}`; params.push(branch_id); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY entry_date DESC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);
    const { rows } = await this.db.query(query, params);

    // Running balance (scoped to branch if filter is active)
    const balanceParams: any[] = [tenantId];
    let balanceCond = '';
    if (branch_id) { balanceParams.push(branch_id); balanceCond = ` AND branch_id = $${balanceParams.length}`; }
    const { rows: totals } = await this.db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN entry_type='receipt' THEN amount ELSE 0 END),0) as total_receipts,
        COALESCE(SUM(CASE WHEN entry_type='payment' THEN amount ELSE 0 END),0) as total_payments
       FROM cashbook_entries WHERE tenant_id = $1${balanceCond}`,
      balanceParams,
    );
    return { entries: rows, summary: totals[0] };
  }

  async createCashbookEntry(tenantId: string, userId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO cashbook_entries (tenant_id, entry_date, entry_type, category, description, reference, amount, account, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tenantId, parseDateOrDefault(data.entry_date), data.entry_type, data.category, data.description, data.reference, data.amount, data.account || 'main', userId, data.branch_id || null],
    );
    await this.audit(tenantId, userId, 'finance.cashbook_entry', rows[0].id, 'create', null, rows[0]);
    return rows[0];
  }

  /* ─── Budgets ───────────────────────────────────────────────────────── */
  async getBudgets(tenantId: string, filters: { branch_id?: string } = {}) {
    const { branch_id } = filters;
    const params: any[] = [tenantId];
    let branchCond = '';
    if (branch_id) { params.push(branch_id); branchCond = ` AND b.branch_id = $${params.length}`; }
    const { rows } = await this.db.query(
      `SELECT b.*,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE tenant_id=$1 AND category=b.category AND status='approved'), 0) as utilized
       FROM budgets b WHERE b.tenant_id=$1${branchCond} ORDER BY b.period_start DESC`,
      params,
    );
    return rows;
  }

  async createBudget(tenantId: string, userId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO budgets (tenant_id, name, department, category, period_start, period_end, allocated, notes, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tenantId, data.name, data.department, data.category, parseDateOrDefault(data.period_start), parseDateOrDefault(data.period_end), data.allocated, data.notes, userId, data.branch_id || null],
    );
    await this.audit(tenantId, userId, 'finance.budget', rows[0].id, 'create', null, rows[0]);
    return rows[0];
  }

  /* ─── Reimbursements ─────────────────────────────────────────────────── */
  private async generateClaimNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const { rows } = await this.db.query(
      `SELECT COUNT(*) as cnt FROM reimbursements WHERE tenant_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
      [tenantId, year],
    );
    const seq = parseInt(rows[0].cnt) + 1;
    return `RMB-${year}-${String(seq).padStart(4, '0')}`;
  }

  async getReimbursements(tenantId: string, filters: any) {
    const { page = 1, limit = 50, status, employee_id, category, date_from, date_to, branch_id } = filters;
    let query = `SELECT r.*, emp.first_name, emp.last_name FROM reimbursements r
      LEFT JOIN employees emp ON r.employee_id = emp.id WHERE r.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (status)      { query += ` AND r.status = $${idx++}`;       params.push(status); }
    if (employee_id) { query += ` AND r.employee_id = $${idx++}`;  params.push(employee_id); }
    if (category)    { query += ` AND r.category = $${idx++}`;     params.push(category); }
    if (date_from && typeof date_from === 'string' && date_from.trim() !== '') { query += ` AND r.expense_date >= $${idx++}`; params.push(date_from); }
    if (date_to && typeof date_to === 'string' && date_to.trim() !== '')     { query += ` AND r.expense_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)   { query += ` AND r.branch_id = $${idx++}`;    params.push(branch_id); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY r.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async getReimbursementSummary(tenantId: string) {
    const [claimedRes, approvedRes, pendingRes, paidRes, rejectedRes] = await Promise.all([
      this.db.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM reimbursements WHERE tenant_id=$1`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM reimbursements WHERE tenant_id=$1 AND status='approved'`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM reimbursements WHERE tenant_id=$1 AND status='pending'`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM reimbursements WHERE tenant_id=$1 AND status='paid'`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM reimbursements WHERE tenant_id=$1 AND status='rejected'`, [tenantId]),
    ]);
    return {
      total_claimed: claimedRes.rows[0].total,
      total_claims: claimedRes.rows[0].count,
      total_approved: approvedRes.rows[0].total,
      approved_count: approvedRes.rows[0].count,
      total_pending: pendingRes.rows[0].total,
      pending_count: pendingRes.rows[0].count,
      total_paid: paidRes.rows[0].total,
      paid_count: paidRes.rows[0].count,
      total_rejected: rejectedRes.rows[0].total,
      rejected_count: rejectedRes.rows[0].count,
    };
  }

  async createReimbursement(tenantId: string, userId: string, data: any) {
    // Retry on claim-number unique-violation
    let reimbursement: any;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const claimNumber = await this.generateClaimNumber(tenantId);
      try {
        let rmbBranchId = data.branch_id ?? null;
        if (!rmbBranchId && data.employee_id) {
          const { rows: eRows } = await this.db.query(
            'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
            [data.employee_id, tenantId],
          );
          rmbBranchId = eRows[0]?.branch_id ?? null;
        }
        const { rows } = await this.db.query(
          `INSERT INTO reimbursements (tenant_id, employee_id, claim_number, category, amount, expense_date, description, receipt_url, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [tenantId, data.employee_id || null, claimNumber, data.category, data.amount,
           parseDateOrDefault(data.expense_date), data.description, data.receipt_url || null, rmbBranchId],
        );
        reimbursement = rows[0];
        break;
      } catch (err: any) {
        if (err?.code === UNIQUE_VIOLATION && attempt < MAX_RETRY - 1) continue;
        throw err;
      }
    }
    await this.audit(tenantId, userId, 'finance.reimbursement', reimbursement.id, 'create', null, reimbursement);

    // Register in centralized approval registry
    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'reimbursement',
      entityId: reimbursement.id,
      entityTable: 'reimbursements',
      submittedBy: data.employee_id || userId,
      branchId: reimbursement.branch_id ?? null,
      title: `Reimbursement: ${data.category} – ${data.amount}`.slice(0, 120),
      metadata: { category: data.category, amount: data.amount, claim_number: reimbursement.claim_number },
    });

    return reimbursement;
  }

  async approveReimbursement(id: string, tenantId: string, approvedBy: string, reason: string) {
    const result = await this.approvalEngine.approveByEntity(id, 'reimbursements', tenantId, approvedBy, reason);
    await this.audit(tenantId, approvedBy, 'finance.reimbursement', id, 'approve',
      { status: 'pending' }, { status: result.fullyApproved ? 'approved' : 'under_review' });
    return result;
  }

  async rejectReimbursement(id: string, tenantId: string, userId: string, reason: string) {
    const result = await this.approvalEngine.rejectByEntity(id, 'reimbursements', tenantId, userId, reason);
    await this.audit(tenantId, userId, 'finance.reimbursement', id, 'reject',
      { status: 'pending' }, { status: 'rejected' });
    return result;
  }

  async markReimbursementPaid(id: string, tenantId: string, userId: string) {
    const { rows } = await this.db.query(
      `UPDATE reimbursements SET status = 'paid', paid_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status = 'approved' RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new BadRequestException('Reimbursement not found or not in approved status');
    await this.audit(tenantId, userId, 'finance.reimbursement', id, 'mark_paid',
      { status: 'approved' }, { status: 'paid' });
    return rows[0];
  }

  /* ─── Reports ───────────────────────────────────────────────────────── */
  async getSummary(tenantId: string) {
    const [expRes, pendRes, invRes, billRes, cashRes] = await Promise.all([
      this.db.query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE tenant_id=$1 AND status='approved'`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE tenant_id=$1 AND status='pending'`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as count FROM invoices WHERE tenant_id=$1 AND status='paid'`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(total_amount),0) as payable, COUNT(*) as count FROM vendor_bills WHERE tenant_id=$1 AND status IN ('pending','approved','partial')`, [tenantId]),
      this.db.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='receipt' THEN amount ELSE -amount END),0) as balance FROM cashbook_entries WHERE tenant_id=$1`, [tenantId]),
    ]);
    return {
      total_expenses: expRes.rows[0].total,
      pending_expenses: pendRes.rows[0].total,
      pending_expense_count: pendRes.rows[0].count,
      total_revenue: invRes.rows[0].revenue,
      invoice_count: invRes.rows[0].count,
      total_payables: billRes.rows[0].payable,
      bill_count: billRes.rows[0].count,
      cash_balance: cashRes.rows[0].balance,
    };
  }

  async getArAgingReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT
        invoice_number, customer_name, total_amount, due_date, status,
        CURRENT_DATE - due_date as days_overdue
       FROM invoices
       WHERE tenant_id=$1 AND status IN ('sent','overdue','partial')
       ORDER BY due_date`,
      [tenantId],
    );
    const buckets = { current: 0, days_30: 0, days_60: 0, days_90: 0, over_90: 0 };
    const items = { current: [] as any[], days_30: [] as any[], days_60: [] as any[], days_90: [] as any[], over_90: [] as any[] };
    for (const r of rows) {
      const d = parseInt(r.days_overdue) || 0;
      if (d <= 0) { buckets.current += parseFloat(r.total_amount); items.current.push(r); }
      else if (d <= 30) { buckets.days_30 += parseFloat(r.total_amount); items.days_30.push(r); }
      else if (d <= 60) { buckets.days_60 += parseFloat(r.total_amount); items.days_60.push(r); }
      else if (d <= 90) { buckets.days_90 += parseFloat(r.total_amount); items.days_90.push(r); }
      else { buckets.over_90 += parseFloat(r.total_amount); items.over_90.push(r); }
    }
    return { buckets, items };
  }

  async getPlReport(tenantId: string, year?: number) {
    const y = year || new Date().getFullYear();
    const { rows: incomeRows } = await this.db.query(
      `SELECT EXTRACT(MONTH FROM issue_date) as month, COALESCE(SUM(total_amount),0) as income
       FROM invoices WHERE tenant_id=$1 AND status='paid' AND EXTRACT(YEAR FROM issue_date)=$2
       GROUP BY month ORDER BY month`,
      [tenantId, y],
    );
    const { rows: expRows } = await this.db.query(
      `SELECT EXTRACT(MONTH FROM date) as month, COALESCE(SUM(amount),0) as expense
       FROM expenses WHERE tenant_id=$1 AND status='approved' AND EXTRACT(YEAR FROM date)=$2
       GROUP BY month ORDER BY month`,
      [tenantId, y],
    );
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const inc = parseFloat(incomeRows.find((r: any) => parseInt(r.month) === m)?.income || 0);
      const exp = parseFloat(expRows.find((r: any) => parseInt(r.month) === m)?.expense || 0);
      return { month: m, income: inc, expense: exp, profit: inc - exp };
    });
    return { year: y, months };
  }
}
