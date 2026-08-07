import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { CurrencyService } from '../../../shared/currency.service';
import {
  CreateSubscriptionInvoiceDto,
  ListSubscriptionInvoicesQueryDto,
  MarkSubscriptionInvoicePaidDto,
  UpdateSubscriptionInvoiceDto,
  VoidSubscriptionInvoiceDto,
} from '../dto/subscription-invoice.dto';

interface OpsActor {
  sub: string;
}

type Client = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

const PENDING_STATUS = 'pending';
const PAID_STATUS = 'paid';
const VOID_STATUS = 'void';
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class SubscriptionInvoiceService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private currencyService: CurrencyService,
  ) {}

  async list(filters: ListSubscriptionInvoicesQueryDto) {
    const { safePage, safeLimit, offset } = this.pagination(filters);
    const where: string[] = ['t.deleted_at IS NULL'];
    const params: any[] = [];
    let idx = 1;

    if (filters.search?.trim()) {
      where.push(`(si.invoice_number ILIKE $${idx} OR t.name ILIKE $${idx} OR t.slug ILIKE $${idx} OR t.primary_email ILIKE $${idx})`);
      params.push(`%${filters.search.trim()}%`);
      idx++;
    }

    if (filters.tenantId) {
      where.push(`si.tenant_id = $${idx++}`);
      params.push(filters.tenantId);
    }

    if (filters.status) {
      if (filters.status === 'overdue') {
        where.push(`si.status = '${PENDING_STATUS}' AND si.due_date < CURRENT_DATE`);
      } else if (filters.status === PENDING_STATUS) {
        where.push(`si.status = '${PENDING_STATUS}' AND si.due_date >= CURRENT_DATE`);
      } else {
        where.push(`si.status = $${idx++}`);
        params.push(filters.status);
      }
    }

    if (filters.dueWindow) {
      if (filters.dueWindow === 'overdue') {
        where.push(`si.status = '${PENDING_STATUS}' AND si.due_date < CURRENT_DATE`);
      } else if (filters.dueWindow === 'due_7') {
        where.push(`si.status = '${PENDING_STATUS}' AND si.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`);
      } else if (filters.dueWindow === 'due_30') {
        where.push(`si.status = '${PENDING_STATUS}' AND si.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`);
      }
    }

    const fromSql = this.baseInvoiceFrom();
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(
        `${this.baseInvoiceSelect()}
         ${fromSql}
         ${whereSql}
         ORDER BY si.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, safeLimit, offset],
      ),
      this.db.query(`SELECT COUNT(*) ${fromSql} ${whereSql}`, params),
    ]);

    const total = parseInt(countRows[0].count, 10);
    return {
      data: rows,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async summary() {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE si.status = '${PENDING_STATUS}' AND si.due_date >= CURRENT_DATE)::int AS pending,
         COUNT(*) FILTER (WHERE si.status = '${PENDING_STATUS}' AND si.due_date < CURRENT_DATE)::int AS overdue,
         COUNT(*) FILTER (WHERE si.status = '${PAID_STATUS}')::int AS paid,
         COUNT(*) FILTER (WHERE si.status = '${VOID_STATUS}')::int AS voided,
         COALESCE(SUM(si.total_amount) FILTER (WHERE si.status = '${PENDING_STATUS}'), 0) AS outstanding_amount,
         COALESCE(SUM(si.total_amount) FILTER (WHERE si.status = '${PAID_STATUS}'), 0) AS collected_amount
       FROM subscription_invoices si
       JOIN tenants t ON t.id = si.tenant_id
       WHERE t.deleted_at IS NULL`,
    );
    return rows[0];
  }

  async detail(id: string) {
    const invoice = await this.getInvoiceRow(id);
    const [payments, activity] = await Promise.all([
      this.db.query('SELECT * FROM payment_transactions WHERE invoice_id = $1 ORDER BY created_at DESC', [id]),
      this.auditLog.findAll(invoice.tenant_id, { entityType: 'subscription_invoice', limit: 20 }),
    ]);

    return {
      invoice,
      payments: payments.rows,
      activity: activity.data.filter((entry) => entry.entity_id === id),
    };
  }

  async create(dto: CreateSubscriptionInvoiceDto, actor: OpsActor) {
    await this.getTenant(dto.tenantId);
    const created = await this.db.transaction(async (client) => {
      const subscription = await this.resolveSubscription(client, dto.tenantId, dto.subscriptionId);
      const amount = this.resolveAmount(dto.amount, subscription.amount);
      const taxAmount = dto.taxAmount ?? this.roundCurrency(amount * 0.18);
      const totalAmount = this.roundCurrency(amount + taxAmount);
      const dueDate = this.toDateOnly(dto.dueDate);
      const invoiceNumber = dto.invoiceNumber?.trim() || await this.generateInvoiceNumber(client, dto.tenantId);
      const currency = await this.currencyService.getTenantCurrencySnapshot(dto.tenantId);

      try {
        const { rows } = await client.query(
          `INSERT INTO subscription_invoices (
             tenant_id, subscription_id, invoice_number, amount, tax_amount, total_amount,
             currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base,
             exchange_rate_source, exchange_rate_as_of, currency_snapshot,
             status, due_date, notes, created_by_user_id, updated_by_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,'${PENDING_STATUS}',$15,$16,$17,$17)
           RETURNING *`,
          [
            dto.tenantId,
            subscription.id,
            invoiceNumber,
            amount,
            taxAmount,
            totalAmount,
            currency.currencyCode,
            currency.currencySymbol,
            currency.exchangeRate,
            currency.baseCurrency,
            currency.exchangeRateToBase,
            currency.exchangeRateSource,
            currency.exchangeRateAsOf,
            JSON.stringify(currency.snapshot),
            dueDate,
            dto.notes?.trim() || null,
            actor.sub,
          ],
        );
        return rows[0];
      } catch (err) {
        if ((err as any)?.code === UNIQUE_VIOLATION) {
          throw new BadRequestException('Invoice number already exists for this organization');
        }
        throw err;
      }
    });

    await this.auditLog.log({
      tenantId: created.tenant_id,
      userId: actor.sub,
      entityType: 'subscription_invoice',
      entityId: created.id,
      action: 'subscription_invoice_created',
      newValues: created,
    });

    return created;
  }

  async update(id: string, dto: UpdateSubscriptionInvoiceDto, actor: OpsActor) {
    const existing = await this.requirePendingInvoice(id);
    const amount = this.resolveAmount(dto.amount, existing.amount);
    const taxAmount = dto.taxAmount ?? Number(existing.tax_amount);
    const totalAmount = this.roundCurrency(amount + Number(taxAmount));
    const dueDate = dto.dueDate ? this.toDateOnly(dto.dueDate) : this.toDateOnly(existing.due_date);
    const hasNotes = Object.prototype.hasOwnProperty.call(dto, 'notes');

    try {
      const { rows } = await this.db.query(
        `UPDATE subscription_invoices SET
           invoice_number = COALESCE($2, invoice_number),
           amount = $3,
           tax_amount = $4,
           total_amount = $5,
           due_date = $6,
           notes = CASE WHEN $7 THEN $8 ELSE notes END,
           updated_by_user_id = $9,
           updated_at = now()
         WHERE id = $1 AND status = '${PENDING_STATUS}'
         RETURNING *`,
        [
          id,
          dto.invoiceNumber?.trim() || null,
          amount,
          taxAmount,
          totalAmount,
          dueDate,
          hasNotes,
          dto.notes?.trim() || null,
          actor.sub,
        ],
      );
      if (!rows.length) throw new BadRequestException('Invoice is no longer pending');

      await this.auditLog.log({
        tenantId: rows[0].tenant_id,
        userId: actor.sub,
        entityType: 'subscription_invoice',
        entityId: id,
        action: 'subscription_invoice_updated',
        oldValues: existing,
        newValues: rows[0],
      });

      return rows[0];
    } catch (err) {
      if ((err as any)?.code === UNIQUE_VIOLATION) {
        throw new BadRequestException('Invoice number already exists for this organization');
      }
      throw err;
    }
  }

  async markPaid(id: string, dto: MarkSubscriptionInvoicePaidDto, actor: OpsActor) {
    const result = await this.db.transaction(async (client) => {
      const invoice = await this.requirePendingInvoiceForUpdate(client, id);
      const { rows } = await client.query(
        `UPDATE subscription_invoices SET
           status = '${PAID_STATUS}', paid_at = now(), payment_method = $2,
           payment_reference = $3, updated_by_user_id = $4, updated_at = now()
         WHERE id = $1 AND status = '${PENDING_STATUS}'
         RETURNING *`,
        [id, dto.paymentMethod.trim(), dto.paymentReference?.trim() || null, actor.sub],
      );
      if (!rows.length) throw new BadRequestException('Invoice is no longer pending');

      const payment = await client.query(
        `INSERT INTO payment_transactions (
           tenant_id, invoice_id, amount, currency, currency_symbol, exchange_rate,
           base_currency, exchange_rate_to_base, exchange_rate_source, exchange_rate_as_of,
           currency_snapshot, gateway, gateway_transaction_id, status
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,'completed')
         RETURNING *`,
        [
          invoice.tenant_id,
          id,
          invoice.total_amount,
          invoice.currency,
          invoice.currency_symbol,
          invoice.exchange_rate,
          invoice.base_currency,
          invoice.exchange_rate_to_base,
          invoice.exchange_rate_source,
          invoice.exchange_rate_as_of,
          JSON.stringify(invoice.currency_snapshot ?? {}),
          dto.gateway?.trim() || 'manual',
          dto.paymentReference?.trim() || null,
        ],
      );

      return { oldInvoice: invoice, invoice: rows[0], payment: payment.rows[0] };
    });

    await this.auditLog.log({
      tenantId: result.invoice.tenant_id,
      userId: actor.sub,
      entityType: 'subscription_invoice',
      entityId: id,
      action: 'subscription_invoice_paid',
      oldValues: result.oldInvoice,
      newValues: { invoice: result.invoice, payment: result.payment },
    });

    return result.invoice;
  }

  async void(id: string, dto: VoidSubscriptionInvoiceDto, actor: OpsActor) {
    const existing = await this.requirePendingInvoice(id);
    const { rows } = await this.db.query(
      `UPDATE subscription_invoices SET
         status = '${VOID_STATUS}', voided_at = now(), void_reason = $2,
         updated_by_user_id = $3, updated_at = now()
       WHERE id = $1 AND status = '${PENDING_STATUS}'
       RETURNING *`,
      [id, dto.reason.trim(), actor.sub],
    );
    if (!rows.length) throw new BadRequestException('Invoice is no longer pending');

    await this.auditLog.log({
      tenantId: rows[0].tenant_id,
      userId: actor.sub,
      entityType: 'subscription_invoice',
      entityId: id,
      action: 'subscription_invoice_voided',
      oldValues: existing,
      newValues: rows[0],
    });

    return rows[0];
  }

  private pagination(filters: ListSubscriptionInvoicesQueryDto) {
    const safeLimit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
    const safePage = Math.max(Number(filters.page) || 1, 1);
    return { safePage, safeLimit, offset: (safePage - 1) * safeLimit };
  }

  private baseInvoiceSelect() {
    return `SELECT
      si.*,
      CASE WHEN si.status = '${PENDING_STATUS}' AND si.due_date < CURRENT_DATE THEN 'overdue' ELSE si.status END AS effective_status,
      t.name AS organization_name,
      t.slug AS organization_slug,
      t.primary_email AS organization_email,
      ts.billing_cycle,
      ts.current_period_start,
      ts.current_period_end,
      COALESCE(sbp.name, ts.custom_plan_name, 'Custom plan') AS plan_name`;
  }

  private baseInvoiceFrom() {
    return `FROM subscription_invoices si
      JOIN tenants t ON t.id = si.tenant_id
      LEFT JOIN tenant_subscriptions ts ON ts.id = si.subscription_id
      LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id`;
  }

  private async getInvoiceRow(id: string) {
    const { rows } = await this.db.query(
      `${this.baseInvoiceSelect()} ${this.baseInvoiceFrom()} WHERE si.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('Invoice not found');
    return rows[0];
  }

  private async requirePendingInvoice(id: string) {
    const { rows } = await this.db.query('SELECT * FROM subscription_invoices WHERE id = $1', [id]);
    if (!rows.length) throw new NotFoundException('Invoice not found');
    if (rows[0].status !== PENDING_STATUS) throw new BadRequestException('Only pending invoices can be changed');
    return rows[0];
  }

  private async requirePendingInvoiceForUpdate(client: Client, id: string) {
    const { rows } = await client.query('SELECT * FROM subscription_invoices WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) throw new NotFoundException('Invoice not found');
    if (rows[0].status !== PENDING_STATUS) throw new BadRequestException('Only pending invoices can be changed');
    return rows[0];
  }

  private async getTenant(tenantId: string) {
    const { rows } = await this.db.query('SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenantId]);
    if (!rows.length) throw new NotFoundException('Organization not found');
    return rows[0];
  }

  private async resolveSubscription(client: Client, tenantId: string, subscriptionId?: string) {
    const params = subscriptionId ? [subscriptionId, tenantId] : [tenantId];
    const query = subscriptionId
      ? `SELECT * FROM tenant_subscriptions WHERE id = $1 AND tenant_id = $2`
      : `SELECT * FROM tenant_subscriptions WHERE tenant_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
    const { rows } = await client.query(query, params);
    if (!rows.length) {
      throw new BadRequestException(subscriptionId ? 'Subscription does not belong to this organization' : 'No active subscription found for this organization');
    }
    return rows[0];
  }

  private async generateInvoiceNumber(client: Client, tenantId: string) {
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM subscription_invoices WHERE tenant_id = $1', [tenantId]);
    let next = Number(rows[0]?.count || 0) + 1;
    for (let attempt = 0; attempt < 100; attempt++) {
      const invoiceNumber = `INV-${String(next).padStart(4, '0')}`;
      const exists = await client.query('SELECT 1 FROM subscription_invoices WHERE tenant_id = $1 AND invoice_number = $2', [tenantId, invoiceNumber]);
      if (!exists.rows.length) return invoiceNumber;
      next++;
    }
    throw new BadRequestException('Could not generate a unique invoice number');
  }

  private resolveAmount(value: number | string | undefined, fallback: number | string) {
    const amount = Number(value ?? fallback);
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('Invoice amount must be a non-negative number');
    return this.roundCurrency(amount);
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private toDateOnly(value: string | Date) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new BadRequestException('Invalid invoice date');
    return date.toISOString().slice(0, 10);
  }
}
