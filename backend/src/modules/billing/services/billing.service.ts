import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { BillingEngineService } from './billing-engine.service';
import { CurrencyService } from '../../../shared/currency.service';

@Injectable()
export class BillingService {
  constructor(
    private db: DatabaseService,
    private engine: BillingEngineService,
    private currencyService: CurrencyService,
  ) {}

  async getPlans(includeInactive = false) {
    const { rows } = await this.db.query(
      includeInactive
        ? 'SELECT * FROM saas_base_plans ORDER BY price_monthly'
        : 'SELECT * FROM saas_base_plans WHERE is_active = true ORDER BY price_monthly',
      [],
    );
    return rows;
  }

  async getModules(includeInactive = false) {
    const { rows } = await this.db.query(
      includeInactive 
        ? 'SELECT * FROM saas_modules ORDER BY name'
        : 'SELECT * FROM saas_modules WHERE is_active = true ORDER BY name'
    );
    return rows;
  }

  async getFeatures(includeInactive = false) {
    const { rows } = await this.db.query(
      includeInactive
        ? 'SELECT f.*, m.name as module_name FROM saas_features f LEFT JOIN saas_modules m ON m.id = f.module_id ORDER BY f.name'
        : 'SELECT f.*, m.name as module_name FROM saas_features f LEFT JOIN saas_modules m ON m.id = f.module_id WHERE f.is_active = true ORDER BY f.name'
    );
    return rows;
  }

  async getResources(includeInactive = false) {
    const { rows } = await this.db.query(
      includeInactive
        ? 'SELECT * FROM saas_resources ORDER BY name'
        : 'SELECT * FROM saas_resources WHERE is_active = true ORDER BY name'
    );
    return rows;
  }

  async createPlan(data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO saas_base_plans (name, slug, description, price_monthly, price_yearly)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.name, data.slug, data.description || '', data.price_monthly, data.price_yearly],
    );
    return rows[0];
  }

  async updatePlan(id: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE saas_base_plans SET name = COALESCE($2, name), slug = COALESCE($3, slug),
        description = COALESCE($4, description),
        price_monthly = COALESCE($5, price_monthly), price_yearly = COALESCE($6, price_yearly),
        is_active = COALESCE($7, is_active), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [id, data.name, data.slug, data.description, data.price_monthly, data.price_yearly, data.is_active],
    );
    if (!rows.length) throw new NotFoundException('Plan not found');
    return rows[0];
  }

  async deletePlan(id: string) {
    await this.db.query('UPDATE saas_base_plans SET is_active = false, updated_at = now() WHERE id = $1', [id]);
    return { success: true };
  }

  // --- MODULES CRUD ---
  async createModule(data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO saas_modules (name, slug, description, price_monthly, price_yearly, setup_fee, is_standalone_allowed)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, data.slug, data.description || '', data.price_monthly, data.price_yearly, data.setup_fee || 0, data.is_standalone_allowed || false]
    );
    return rows[0];
  }

  async updateModule(id: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE saas_modules SET name = COALESCE($2, name), slug = COALESCE($3, slug),
       description = COALESCE($4, description), price_monthly = COALESCE($5, price_monthly),
       price_yearly = COALESCE($6, price_yearly), setup_fee = COALESCE($7, setup_fee),
       is_standalone_allowed = COALESCE($8, is_standalone_allowed), is_active = COALESCE($9, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, data.name, data.slug, data.description, data.price_monthly, data.price_yearly, data.setup_fee, data.is_standalone_allowed, data.is_active]
    );
    if (!rows.length) throw new NotFoundException('Module not found');
    return rows[0];
  }

  async deleteModule(id: string) {
    await this.db.query('UPDATE saas_modules SET is_active = false, updated_at = now() WHERE id = $1', [id]);
    return { success: true };
  }

  // --- FEATURES CRUD ---
  async createFeature(data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO saas_features (module_id, name, slug, description, price_monthly, price_yearly)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.module_id, data.name, data.slug, data.description || '', data.price_monthly, data.price_yearly]
    );
    return rows[0];
  }

  async updateFeature(id: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE saas_features SET module_id = COALESCE($2, module_id), name = COALESCE($3, name), slug = COALESCE($4, slug),
       description = COALESCE($5, description), price_monthly = COALESCE($6, price_monthly),
       price_yearly = COALESCE($7, price_yearly), is_active = COALESCE($8, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, data.module_id, data.name, data.slug, data.description, data.price_monthly, data.price_yearly, data.is_active]
    );
    if (!rows.length) throw new NotFoundException('Feature not found');
    return rows[0];
  }

  async deleteFeature(id: string) {
    await this.db.query('UPDATE saas_features SET is_active = false, updated_at = now() WHERE id = $1', [id]);
    return { success: true };
  }

  // --- RESOURCES CRUD ---
  async createResource(data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO saas_resources (name, slug, description, unit_name, price_per_unit_monthly, price_per_unit_yearly)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.name, data.slug, data.description || '', data.unit_name, data.price_per_unit_monthly, data.price_per_unit_yearly]
    );
    return rows[0];
  }

  async updateResource(id: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE saas_resources SET name = COALESCE($2, name), slug = COALESCE($3, slug),
       description = COALESCE($4, description), unit_name = COALESCE($5, unit_name),
       price_per_unit_monthly = COALESCE($6, price_per_unit_monthly), price_per_unit_yearly = COALESCE($7, price_per_unit_yearly),
       is_active = COALESCE($8, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, data.name, data.slug, data.description, data.unit_name, data.price_per_unit_monthly, data.price_per_unit_yearly, data.is_active]
    );
    if (!rows.length) throw new NotFoundException('Resource not found');
    return rows[0];
  }

  async deleteResource(id: string) {
    await this.db.query('UPDATE saas_resources SET is_active = false, updated_at = now() WHERE id = $1', [id]);
    return { success: true };
  }

  async getSubscription(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT ts.*, COALESCE(sp.name, ts.custom_plan_name, 'Custom plan') as plan_name, sp.slug as plan_slug
        FROM tenant_subscriptions ts
        LEFT JOIN saas_base_plans sp ON ts.plan_id = sp.id
        WHERE ts.tenant_id = $1 ORDER BY ts.created_at DESC LIMIT 1`,
      [tenantId],
    );
    return rows[0] || null;
  }

  async submitPlanUpgradeRequest(tenantId: string, data: any, userId: string) {
    const { rows: existing } = await this.db.query(
      `SELECT 1 FROM organization_change_requests 
       WHERE tenant_id = $1 AND status = 'pending' AND changes->>'requestType' = 'plan_upgrade'`,
      [tenantId]
    );
    if (existing.length) {
      throw new BadRequestException('A plan upgrade request is already pending approval.');
    }

    const { rows: planRows } = await this.db.query('SELECT name FROM saas_base_plans WHERE id = $1', [data.plan_id]);
    const planName = planRows[0]?.name || 'Unknown Plan';

    const changes = {
      requestType: 'plan_upgrade',
      plan_id: data.plan_id,
      plan_name: planName,
      billing_cycle: data.billing_cycle,
      selected_modules: data.selected_modules || [],
      selected_features: data.selected_features || [],
      resource_quantities: data.resource_quantities || {}
    };

    const { rows } = await this.db.query(
      `INSERT INTO organization_change_requests (tenant_id, requested_by_user_id, changes, reason, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [tenantId, userId, JSON.stringify(changes), 'Request to upgrade SaaS plan']
    );

    return rows[0];
  }

  async subscribe(tenantId: string, data: { plan_id: string; billing_cycle: 'monthly' | 'yearly'; selected_modules?: string[]; selected_features?: string[]; resource_quantities?: Record<string, number>; discount_code?: string }) {
    // 1. Calculate precise modular pricing
    const pricing = await this.engine.calculateSubscriptionPrice(
      data.plan_id,
      data.billing_cycle,
      data.selected_modules || [],
      data.selected_features || [],
      data.resource_quantities || {},
      data.discount_code
    );

    let amount = pricing.total;

    // 2. Backward compatibility: apply one-time signup discount if present
    const { rows: discountRows } = await this.db.query(
      `SELECT r.id, r.discount_percent_granted, r.discount_amount_granted
       FROM tenant_signup_offer_redemptions r
       JOIN signup_offers o ON o.id = r.offer_id
       WHERE r.tenant_id = $1 AND r.discount_consumed_at IS NULL
         AND (r.discount_percent_granted IS NOT NULL OR r.discount_amount_granted IS NOT NULL)
         AND (o.applicable_plan_id IS NULL OR o.applicable_plan_id = $2)
       LIMIT 1`,
      [tenantId, data.plan_id],
    );
    let appliedDiscountId: string | null = null;
    if (discountRows.length) {
      const d = discountRows[0];
      appliedDiscountId = d.id;
      if (d.discount_percent_granted) {
        amount = amount * (1 - parseFloat(d.discount_percent_granted) / 100);
      } else if (d.discount_amount_granted) {
        amount = Math.max(0, amount - parseFloat(d.discount_amount_granted));
      }
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (data.billing_cycle === 'yearly' ? 12 : 1));
    const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId);

    await this.db.query('BEGIN');
    try {
      const { rows } = await this.db.query(
        `INSERT INTO tenant_subscriptions (
          tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end,
          next_billing_date, amount, base_price, currency, currency_symbol, exchange_rate,
          base_currency, exchange_rate_to_base, exchange_rate_source, exchange_rate_as_of,
          currency_snapshot, is_custom_pricing, custom_pricing_notes
        )
          VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, false, $17) RETURNING *`,
        [
          tenantId, data.plan_id, data.billing_cycle, now.toISOString().split('T')[0],
          periodEnd.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0],
          amount, pricing.basePrice, currency.currencyCode, currency.currencySymbol,
          currency.exchangeRate, currency.baseCurrency, currency.exchangeRateToBase,
          currency.exchangeRateSource, currency.exchangeRateAsOf, JSON.stringify(currency.snapshot),
          JSON.stringify(pricing.breakdown),
        ],
      );

      const subId = rows[0].id;

      // Insert modular choices
      for (const m of pricing.breakdown.modules) {
        await this.db.query('INSERT INTO tenant_subscription_modules (subscription_id, module_id, price) VALUES ($1, $2, $3)', [subId, m.id, m.cost]);
      }
      for (const f of pricing.breakdown.features) {
        await this.db.query('INSERT INTO tenant_subscription_features (subscription_id, feature_id, price) VALUES ($1, $2, $3)', [subId, f.id, f.cost]);
      }
      for (const r of pricing.breakdown.resources) {
        // Here we insert the *total requested*, not just the billable units.
        const totalReq = (data.resource_quantities || {})[r.id] || 0;
        await this.db.query('INSERT INTO tenant_subscription_resources (subscription_id, resource_id, allocated_quantity, unit_price) VALUES ($1, $2, $3, $4)', [subId, r.id, totalReq, r.unitPrice]);
      }

      if (appliedDiscountId) {
        await this.db.query('UPDATE tenant_signup_offer_redemptions SET discount_consumed_at = now() WHERE id = $1', [appliedDiscountId]);
      }

      await this.createInvoice(tenantId, subId, amount);
      
      await this.db.query('COMMIT');
      return rows[0];
    } catch (e) {
      await this.db.query('ROLLBACK');
      throw e;
    }
  }

  async cancelSubscription(tenantId: string) {
    const { rows } = await this.db.query(
      `UPDATE tenant_subscriptions SET status = 'cancelled', cancelled_at = now(), auto_renew = false, updated_at = now()
        WHERE tenant_id = $1 AND status = 'active' RETURNING *`,
      [tenantId],
    );
    if (!rows.length) throw new NotFoundException('No active subscription');
    return rows[0];
  }

  async getInvoices(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM subscription_invoices WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows;
  }

  async createInvoice(tenantId: string, subscriptionId: string, amount: number) {
    const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId);
    const count = await this.db.query('SELECT COUNT(*) FROM subscription_invoices WHERE tenant_id = $1', [tenantId]);
    const invoiceNum = `INV-${String(parseInt(count.rows[0].count) + 1).padStart(4, '0')}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);

    const taxAmount = amount * 0.18;
    const totalAmount = amount + taxAmount;

    const { rows } = await this.db.query(
      `INSERT INTO subscription_invoices (
        tenant_id, subscription_id, invoice_number, amount, tax_amount, total_amount,
        currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base,
        exchange_rate_source, exchange_rate_as_of, currency_snapshot, due_date
      )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15) RETURNING *`,
      [
        tenantId, subscriptionId, invoiceNum, amount, taxAmount, totalAmount,
        currency.currencyCode, currency.currencySymbol, currency.exchangeRate,
        currency.baseCurrency, currency.exchangeRateToBase, currency.exchangeRateSource,
        currency.exchangeRateAsOf, JSON.stringify(currency.snapshot), dueDate.toISOString().split('T')[0],
      ],
    );
    return rows[0];
  }

  async payInvoice(invoiceId: string, tenantId: string, data: { payment_method: string; gateway?: string; gateway_transaction_id?: string }) {
    const invoice = await this.db.query('SELECT * FROM subscription_invoices WHERE id = $1 AND tenant_id = $2', [invoiceId, tenantId]);
    if (!invoice.rows.length) throw new NotFoundException('Invoice not found');

    const { rows } = await this.db.query(
      `UPDATE subscription_invoices SET status = 'paid', paid_at = now(), payment_method = $3, payment_reference = $4, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [invoiceId, tenantId, data.payment_method, data.gateway_transaction_id || null],
    );

    await this.db.query(
      `INSERT INTO payment_transactions (
        tenant_id, invoice_id, amount, currency, currency_symbol, exchange_rate,
        base_currency, exchange_rate_to_base, exchange_rate_source, exchange_rate_as_of,
        currency_snapshot, gateway, gateway_transaction_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)`,
      [
        tenantId, invoiceId, invoice.rows[0].total_amount, invoice.rows[0].currency,
        invoice.rows[0].currency_symbol, invoice.rows[0].exchange_rate,
        invoice.rows[0].base_currency, invoice.rows[0].exchange_rate_to_base,
        invoice.rows[0].exchange_rate_source, invoice.rows[0].exchange_rate_as_of,
        JSON.stringify(invoice.rows[0].currency_snapshot ?? {}), data.gateway || 'manual',
        data.gateway_transaction_id || null, 'completed',
      ],
    );

    return rows[0];
  }

  async getTransactions(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM payment_transactions WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows;
  }

  async getSummary(tenantId: string) {
    const totalPaid = await this.db.query(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM subscription_invoices WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'paid'],
    );
    const totalPending = await this.db.query(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM subscription_invoices WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'pending'],
    );
    return { total_paid: totalPaid.rows[0].total, total_pending: totalPending.rows[0].total };
  }

  async getTenantCurrency(tenantId: string) {
    return this.db.query('SELECT currency, currency_symbol FROM tenants WHERE id = $1', [tenantId]);
  }
}
