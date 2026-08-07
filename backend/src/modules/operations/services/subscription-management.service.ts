import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { BillingEngineService } from '../../billing/services/billing-engine.service';
import { CurrencyService } from '../../../shared/currency.service';
import {
  AssignOpsSubscriptionDto,
  RenewOpsSubscriptionDto,
  UpdateOpsSubscriptionDto,
} from '../dto/subscription-management.dto';

interface OpsActor {
  sub: string;
}

type Client = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

const ACTIVE_STATUS = 'active';
const REPLACED_STATUS = 'replaced';
const EXPIRED_STATUS = 'expired';
const CANCELLED_STATUS = 'cancelled';

@Injectable()
export class SubscriptionManagementService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private billingEngine: BillingEngineService,
    private currencyService: CurrencyService,
  ) {}

  async getCatalog() {
    const [plans, modules, features, resources] = await Promise.all([
      this.db.query('SELECT * FROM saas_base_plans ORDER BY is_active DESC, price_monthly ASC, name ASC'),
      this.db.query('SELECT * FROM saas_modules ORDER BY is_active DESC, name ASC'),
      this.db.query(`SELECT f.*, m.name AS module_name FROM saas_features f LEFT JOIN saas_modules m ON m.id = f.module_id ORDER BY f.is_active DESC, f.name ASC`),
      this.db.query('SELECT * FROM saas_resources ORDER BY is_active DESC, name ASC'),
    ]);

    return {
      plans: plans.rows,
      modules: modules.rows,
      features: features.rows,
      resources: resources.rows,
    };
  }

  async list(filters: any) {
    const { page = 1, limit = 50 } = filters;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    const where: string[] = ['t.deleted_at IS NULL'];
    const params: any[] = [];
    let idx = 1;

    if (filters.search) {
      where.push(`(t.name ILIKE $${idx} OR t.slug ILIKE $${idx} OR t.primary_email ILIKE $${idx})`);
      params.push(`%${String(filters.search).trim()}%`);
      idx++;
    }
    if (filters.status) {
      if (filters.status === 'none') {
        where.push('current_sub.id IS NULL');
      } else {
        where.push(`current_sub.status = $${idx++}`);
        params.push(filters.status);
      }
    }
    if (filters.source) {
      where.push(`COALESCE(current_sub.subscription_source, CASE WHEN t.trial_ends_at > now() THEN 'free_trial' ELSE 'free_plan' END) = $${idx++}`);
      params.push(filters.source);
    }
    if (filters.planId) {
      where.push(`current_sub.plan_id = $${idx++}`);
      params.push(filters.planId);
    }
    if (filters.expiryWindow === 'expiring_soon') {
      where.push(`current_sub.status = '${ACTIVE_STATUS}' AND current_sub.current_period_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`);
    }
    if (filters.expiryWindow === 'expired') {
      where.push(`current_sub.current_period_end < CURRENT_DATE`);
    }
    if (filters.category === 'signup_offer') {
      where.push('(current_sub.subscription_source = $' + idx + ' OR redemption.id IS NOT NULL)');
      params.push('signup_offer');
      idx++;
    }
    if (filters.category === 'custom') {
      where.push('current_sub.subscription_source = $' + idx++);
      params.push('custom');
    }
    if (filters.category === 'free_trial') {
      where.push(`COALESCE(current_sub.subscription_source, CASE WHEN t.trial_ends_at > now() THEN 'free_trial' ELSE NULL END) = $${idx++}`);
      params.push('free_trial');
    }
    if (filters.category === 'free_plan') {
      where.push(`COALESCE(current_sub.subscription_source, CASE WHEN current_sub.id IS NULL AND (t.trial_ends_at IS NULL OR t.trial_ends_at <= now()) THEN 'free_plan' ELSE NULL END) = $${idx++}`);
      params.push('free_plan');
    }

    const baseFrom = `
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT ts.*, COALESCE(sbp.name, ts.custom_plan_name, 'Custom plan') AS plan_name, sbp.slug AS plan_slug
        FROM tenant_subscriptions ts
        LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id
        WHERE ts.tenant_id = t.id AND ts.status = '${ACTIVE_STATUS}'
        ORDER BY ts.created_at DESC
        LIMIT 1
      ) current_sub ON true
      LEFT JOIN LATERAL (
        SELECT r.*, o.name AS offer_name, o.code AS offer_code
        FROM tenant_signup_offer_redemptions r
        LEFT JOIN signup_offers o ON o.id = r.offer_id
        WHERE r.tenant_id = t.id
        ORDER BY r.redeemed_at DESC
        LIMIT 1
      ) redemption ON true
    `;
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(
        `SELECT
           t.id AS tenant_id, t.name AS organization_name, t.slug, t.status AS organization_status,
           t.lifecycle_stage, t.primary_email, t.trial_ends_at,
           current_sub.id AS subscription_id, current_sub.plan_id, current_sub.plan_name,
           current_sub.plan_slug, current_sub.custom_plan_name, current_sub.subscription_source,
           current_sub.status AS subscription_status, current_sub.billing_cycle,
           current_sub.current_period_start, current_sub.current_period_end,
           current_sub.next_billing_date, current_sub.amount, current_sub.base_price,
           current_sub.is_custom_pricing, current_sub.internal_notes, current_sub.created_at AS subscription_created_at,
           redemption.id AS offer_redemption_id, redemption.offer_name, redemption.offer_code,
           redemption.offer_type, redemption.redeemed_at
         ${baseFrom}
         ${whereSql}
         ORDER BY COALESCE(current_sub.updated_at, t.updated_at) DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, safeLimit, offset],
      ),
      this.db.query(`SELECT COUNT(*) ${baseFrom} ${whereSql}`, params),
    ]);

    return {
      data: rows.map((row) => ({ ...row, effective_source: this.effectiveSource(row) })),
      meta: {
        page: safePage,
        limit: safeLimit,
        total: parseInt(countRows[0].count, 10),
        totalPages: Math.ceil(parseInt(countRows[0].count, 10) / safeLimit),
      },
    };
  }

  async getSummary() {
    const { rows } = await this.db.query(
      `WITH current_rows AS (
         SELECT t.id, t.trial_ends_at, ts.id AS subscription_id, ts.status, ts.amount,
                ts.subscription_source, ts.current_period_end, r.id AS redemption_id
         FROM tenants t
         LEFT JOIN LATERAL (
           SELECT * FROM tenant_subscriptions ts
           WHERE ts.tenant_id = t.id AND ts.status = '${ACTIVE_STATUS}'
           ORDER BY ts.created_at DESC LIMIT 1
         ) ts ON true
         LEFT JOIN tenant_signup_offer_redemptions r ON r.tenant_id = t.id
         WHERE t.deleted_at IS NULL
       )
       SELECT
         COUNT(*) FILTER (WHERE subscription_id IS NOT NULL AND status = '${ACTIVE_STATUS}' AND amount > 0 AND subscription_source NOT IN ('free_trial', 'free_plan'))::int AS active_paid,
         COUNT(*) FILTER (WHERE COALESCE(subscription_source, CASE WHEN subscription_id IS NULL AND (trial_ends_at IS NULL OR trial_ends_at <= now()) THEN 'free_plan' END) = 'free_plan')::int AS free_plan,
         COUNT(*) FILTER (WHERE COALESCE(subscription_source, CASE WHEN trial_ends_at > now() THEN 'free_trial' END) = 'free_trial')::int AS free_trial,
         COUNT(*) FILTER (WHERE subscription_source = 'signup_offer' OR redemption_id IS NOT NULL)::int AS signup_offer,
         COUNT(*) FILTER (WHERE subscription_source = 'custom')::int AS custom,
         COUNT(*) FILTER (WHERE status = '${ACTIVE_STATUS}' AND current_period_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')::int AS expiring_soon,
         COUNT(*) FILTER (WHERE current_period_end < CURRENT_DATE)::int AS expired
       FROM current_rows`,
    );
    return rows[0];
  }

  async getTenantSubscriptionDetail(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    const [current, history, offer, invoices, transactions, activity] = await Promise.all([
      this.getCurrentSubscription(tenantId),
      this.db.query(
        `SELECT ts.*, COALESCE(sbp.name, ts.custom_plan_name, 'Custom plan') AS plan_name, sbp.slug AS plan_slug
         FROM tenant_subscriptions ts
         LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id
         WHERE ts.tenant_id = $1
         ORDER BY ts.created_at DESC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT r.*, o.name AS offer_name, o.code AS offer_code, o.description AS offer_description
         FROM tenant_signup_offer_redemptions r
         LEFT JOIN signup_offers o ON o.id = r.offer_id
         WHERE r.tenant_id = $1
         ORDER BY r.redeemed_at DESC
         LIMIT 1`,
        [tenantId],
      ),
      this.db.query('SELECT * FROM subscription_invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20', [tenantId]),
      this.db.query('SELECT * FROM payment_transactions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20', [tenantId]),
      this.auditLog.findAll(tenantId, { entityType: 'subscription', limit: 20 }),
    ]);

    return {
      tenant,
      current: current ? { ...current, entitlements: await this.getEntitlements(current.id, current.plan_id) } : null,
      history: history.rows,
      offerRedemption: offer.rows[0] || null,
      invoices: invoices.rows,
      transactions: transactions.rows,
      activity: activity.data,
    };
  }

  async assign(tenantId: string, dto: AssignOpsSubscriptionDto, actor: OpsActor) {
    await this.getTenant(tenantId);
    this.validateDateOrder(dto.currentPeriodStart, dto.currentPeriodEnd, dto.nextBillingDate);

    const created = await this.db.transaction(async (client) => {
      const normalized = await this.normalizeSubscriptionInput(client, tenantId, dto, actor.sub);
      const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId);

      await client.query(
        `UPDATE tenant_subscriptions
         SET status = $2, auto_renew = false, cancelled_at = now(), updated_at = now(), updated_by_user_id = $3
         WHERE tenant_id = $1 AND status = '${ACTIVE_STATUS}'`,
        [tenantId, REPLACED_STATUS, actor.sub],
      );

      const { rows } = await client.query(
        `INSERT INTO tenant_subscriptions (
           tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end,
           next_billing_date, amount, base_price, is_custom_pricing, custom_pricing_notes,
           subscription_source, custom_plan_name, internal_notes, assigned_by_user_id,
           updated_by_user_id, signup_offer_redemption_id, currency, currency_symbol, exchange_rate,
           base_currency, exchange_rate_to_base, exchange_rate_source, exchange_rate_as_of,
           currency_snapshot
         ) VALUES (
           $1,$2,'${ACTIVE_STATUS}',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb
         ) RETURNING *`,
        [
          tenantId,
          normalized.planId,
          dto.billingCycle,
          this.toDateOnly(dto.currentPeriodStart),
          this.toDateOnly(dto.currentPeriodEnd),
          this.toDateOnly(dto.nextBillingDate),
          normalized.amount,
          normalized.basePrice,
          normalized.isCustomPricing,
          JSON.stringify(normalized.pricingBreakdown),
          dto.subscriptionSource,
          normalized.customPlanName,
          dto.internalNotes || null,
          actor.sub,
          normalized.signupOfferRedemptionId,
          currency.currencyCode,
          currency.currencySymbol,
          currency.exchangeRate,
          currency.baseCurrency,
          currency.exchangeRateToBase,
          currency.exchangeRateSource,
          currency.exchangeRateAsOf,
          JSON.stringify(currency.snapshot),
        ],
      );

      await this.replaceEntitlements(client, rows[0].id, normalized);
      await this.syncTrialMarker(client, tenantId, dto.subscriptionSource, dto.currentPeriodEnd);
      return rows[0];
    });

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'subscription',
      entityId: created.id,
      action: 'subscription_assigned',
      newValues: created,
    });

    return created;
  }

  async updateCurrent(tenantId: string, dto: UpdateOpsSubscriptionDto, actor: OpsActor) {
    const current = await this.requireCurrentSubscription(tenantId);
    const start = dto.currentPeriodStart || current.current_period_start;
    const end = dto.currentPeriodEnd || current.current_period_end;
    const next = dto.nextBillingDate || current.next_billing_date;
    this.validateDateOrder(start, end, next);

    const updated = await this.db.transaction(async (client) => {
      const normalized = await this.normalizeSubscriptionInput(
        client,
        tenantId,
        {
          mode: dto.mode || (dto.planId || current.plan_id ? 'catalog' : 'custom'),
          planId: dto.planId ?? current.plan_id,
          customPlanName: dto.customPlanName ?? current.custom_plan_name,
          billingCycle: dto.billingCycle || current.billing_cycle,
          subscriptionSource: dto.subscriptionSource || current.subscription_source,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          nextBillingDate: next,
          amount: dto.amount,
          basePrice: dto.basePrice,
          selectedModules: dto.selectedModules,
          selectedFeatures: dto.selectedFeatures,
          resourceQuantities: dto.resourceQuantities,
          internalNotes: dto.internalNotes,
          signupOfferRedemptionId: dto.signupOfferRedemptionId ?? current.signup_offer_redemption_id,
        },
        actor.sub,
        current,
      );

      const { rows } = await client.query(
        `UPDATE tenant_subscriptions SET
           plan_id = $2, billing_cycle = $3, current_period_start = $4, current_period_end = $5,
           next_billing_date = $6, amount = $7, base_price = $8, is_custom_pricing = $9,
           custom_pricing_notes = $10, subscription_source = $11, custom_plan_name = $12,
           internal_notes = $13, updated_by_user_id = $14, signup_offer_redemption_id = $15,
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          current.id,
          normalized.planId,
          normalized.billingCycle,
          this.toDateOnly(start),
          this.toDateOnly(end),
          this.toDateOnly(next),
          normalized.amount,
          normalized.basePrice,
          normalized.isCustomPricing,
          JSON.stringify(normalized.pricingBreakdown),
          normalized.subscriptionSource,
          normalized.customPlanName,
          dto.internalNotes ?? current.internal_notes,
          actor.sub,
          normalized.signupOfferRedemptionId,
        ],
      );

      if (dto.selectedModules || dto.selectedFeatures || dto.resourceQuantities) {
        await this.replaceEntitlements(client, rows[0].id, normalized);
      }
      await this.syncTrialMarker(client, tenantId, normalized.subscriptionSource, end);
      return rows[0];
    });

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'subscription',
      entityId: updated.id,
      action: 'subscription_updated',
      oldValues: current,
      newValues: updated,
    });

    return updated;
  }

  async renew(tenantId: string, dto: RenewOpsSubscriptionDto, actor: OpsActor) {
    const current = await this.requireCurrentSubscription(tenantId);
    this.validateDateOrder(dto.currentPeriodStart, dto.currentPeriodEnd, dto.nextBillingDate);

    const created = await this.db.transaction(async (client) => {
      const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId);
      await client.query(
        `UPDATE tenant_subscriptions
         SET status = $2, auto_renew = false, updated_at = now(), updated_by_user_id = $3
         WHERE id = $1`,
        [current.id, EXPIRED_STATUS, actor.sub],
      );

      const { rows } = await client.query(
        `INSERT INTO tenant_subscriptions (
           tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end,
           next_billing_date, amount, base_price, is_custom_pricing, custom_pricing_notes,
           subscription_source, custom_plan_name, internal_notes, assigned_by_user_id,
           updated_by_user_id, signup_offer_redemption_id, currency, currency_symbol, exchange_rate,
           base_currency, exchange_rate_to_base, exchange_rate_source, exchange_rate_as_of,
           currency_snapshot
         ) VALUES ($1,$2,'${ACTIVE_STATUS}',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
         RETURNING *`,
        [
          tenantId,
          current.plan_id,
          current.billing_cycle,
          this.toDateOnly(dto.currentPeriodStart),
          this.toDateOnly(dto.currentPeriodEnd),
          this.toDateOnly(dto.nextBillingDate),
          dto.amount ?? current.amount,
          current.base_price,
          current.is_custom_pricing,
          current.custom_pricing_notes,
          current.subscription_source,
          current.custom_plan_name,
          dto.internalNotes ?? current.internal_notes,
          actor.sub,
          current.signup_offer_redemption_id,
          currency.currencyCode,
          currency.currencySymbol,
          currency.exchangeRate,
          currency.baseCurrency,
          currency.exchangeRateToBase,
          currency.exchangeRateSource,
          currency.exchangeRateAsOf,
          JSON.stringify(currency.snapshot),
        ],
      );

      await this.copyEntitlements(client, current.id, rows[0].id);
      await this.syncTrialMarker(client, tenantId, current.subscription_source, dto.currentPeriodEnd);
      return rows[0];
    });

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'subscription',
      entityId: created.id,
      action: 'subscription_renewed',
      oldValues: current,
      newValues: created,
    });

    return created;
  }

  async cancel(tenantId: string, actor: OpsActor, reason?: string) {
    const current = await this.requireCurrentSubscription(tenantId);
    const { rows } = await this.db.query(
      `UPDATE tenant_subscriptions
       SET status = '${CANCELLED_STATUS}', cancelled_at = now(), auto_renew = false,
           updated_at = now(), updated_by_user_id = $2
       WHERE id = $1
       RETURNING *`,
      [current.id, actor.sub],
    );

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'subscription',
      entityId: current.id,
      action: 'subscription_cancelled',
      oldValues: current,
      newValues: { ...rows[0], reason: reason || null },
    });

    return rows[0];
  }

  private async normalizeSubscriptionInput(client: Client, tenantId: string, dto: any, actorId: string, current?: any) {
    const mode = dto.mode as 'catalog' | 'custom';
    let planId: string | null = dto.planId || null;
    let customPlanName: string | null = dto.customPlanName || null;

    if (mode === 'catalog') {
      if (!planId) throw new BadRequestException('planId is required for catalog subscriptions');
      const plan = await client.query('SELECT * FROM saas_base_plans WHERE id = $1 AND is_active = true', [planId]);
      if (!plan.rows.length) throw new BadRequestException('Active catalog plan not found');
      customPlanName = null;
    } else {
      if (!customPlanName?.trim()) throw new BadRequestException('customPlanName is required for custom subscriptions');
      if (dto.amount === undefined && !current) throw new BadRequestException('amount is required for custom subscriptions');
      planId = null;
      customPlanName = customPlanName.trim();
    }

    const selectedModules = dto.selectedModules ?? (current ? await this.getCurrentModuleIds(client, current.id) : []);
    const selectedFeatures = dto.selectedFeatures ?? (current ? await this.getCurrentFeatureIds(client, current.id) : []);
    const resourceQuantities = this.normalizeResourceQuantities(dto.resourceQuantities ?? (current ? await this.getCurrentResourceQuantities(client, current.id) : {}));

    await this.validateEntitlementIds(client, selectedModules, selectedFeatures, resourceQuantities);

    let calculated: any = { basePrice: dto.basePrice ?? 0, total: dto.amount ?? 0, breakdown: {} };
    if (mode === 'catalog') {
      calculated = await this.billingEngine.calculateSubscriptionPrice(
        planId!,
        dto.billingCycle,
        selectedModules,
        selectedFeatures,
        resourceQuantities,
      );
    }

    const amount = dto.amount ?? current?.amount ?? calculated.total ?? 0;
    const basePrice = dto.basePrice ?? current?.base_price ?? calculated.basePrice ?? amount;
    const isCustomPricing = mode === 'custom' || dto.amount !== undefined || dto.basePrice !== undefined;
    const signupOfferRedemptionId = await this.resolveOfferRedemption(client, tenantId, dto.signupOfferRedemptionId);

    return {
      mode,
      planId,
      customPlanName,
      billingCycle: dto.billingCycle,
      subscriptionSource: dto.subscriptionSource,
      amount,
      basePrice,
      isCustomPricing,
      pricingBreakdown: calculated.breakdown || {},
      selectedModules,
      selectedFeatures,
      resourceQuantities,
      signupOfferRedemptionId,
      actorId,
    };
  }

  private async replaceEntitlements(client: Client, subscriptionId: string, normalized: any) {
    await client.query('DELETE FROM tenant_subscription_modules WHERE subscription_id = $1', [subscriptionId]);
    await client.query('DELETE FROM tenant_subscription_features WHERE subscription_id = $1', [subscriptionId]);
    await client.query('DELETE FROM tenant_subscription_resources WHERE subscription_id = $1', [subscriptionId]);

    for (const moduleId of normalized.selectedModules) {
      const price = await this.getModulePrice(moduleId, normalized.billingCycle);
      await client.query(
        'INSERT INTO tenant_subscription_modules (subscription_id, module_id, price) VALUES ($1, $2, $3) ON CONFLICT (subscription_id, module_id) DO UPDATE SET price = EXCLUDED.price',
        [subscriptionId, moduleId, normalized.mode === 'custom' ? 0 : price],
      );
    }
    for (const featureId of normalized.selectedFeatures) {
      const price = await this.getFeaturePrice(featureId, normalized.billingCycle);
      await client.query(
        'INSERT INTO tenant_subscription_features (subscription_id, feature_id, price) VALUES ($1, $2, $3) ON CONFLICT (subscription_id, feature_id) DO UPDATE SET price = EXCLUDED.price',
        [subscriptionId, featureId, normalized.mode === 'custom' ? 0 : price],
      );
    }
    for (const [resourceId, quantity] of Object.entries(normalized.resourceQuantities)) {
      const unitPrice = await this.getResourcePrice(resourceId, normalized.billingCycle);
      await client.query(
        'INSERT INTO tenant_subscription_resources (subscription_id, resource_id, allocated_quantity, unit_price) VALUES ($1, $2, $3, $4) ON CONFLICT (subscription_id, resource_id) DO UPDATE SET allocated_quantity = EXCLUDED.allocated_quantity, unit_price = EXCLUDED.unit_price',
        [subscriptionId, resourceId, quantity, normalized.mode === 'custom' ? 0 : unitPrice],
      );
    }
  }

  private async copyEntitlements(client: Client, fromSubscriptionId: string, toSubscriptionId: string) {
    await client.query(
      `INSERT INTO tenant_subscription_modules (subscription_id, module_id, price)
       SELECT $2, module_id, price FROM tenant_subscription_modules WHERE subscription_id = $1`,
      [fromSubscriptionId, toSubscriptionId],
    );
    await client.query(
      `INSERT INTO tenant_subscription_features (subscription_id, feature_id, price)
       SELECT $2, feature_id, price FROM tenant_subscription_features WHERE subscription_id = $1`,
      [fromSubscriptionId, toSubscriptionId],
    );
    await client.query(
      `INSERT INTO tenant_subscription_resources (subscription_id, resource_id, allocated_quantity, unit_price)
       SELECT $2, resource_id, allocated_quantity, unit_price FROM tenant_subscription_resources WHERE subscription_id = $1`,
      [fromSubscriptionId, toSubscriptionId],
    );
  }

  private async getEntitlements(subscriptionId: string, planId: string | null) {
    const [modules, features, resources] = await Promise.all([
      this.db.query(
        `SELECT sm.*, 'assigned' AS source, tsm.price
         FROM tenant_subscription_modules tsm JOIN saas_modules sm ON sm.id = tsm.module_id
         WHERE tsm.subscription_id = $1
         UNION
         SELECT sm.*, 'included' AS source, 0::numeric AS price
         FROM saas_plan_modules spm JOIN saas_modules sm ON sm.id = spm.module_id
         WHERE spm.plan_id = $2`,
        [subscriptionId, planId],
      ),
      this.db.query(
        `SELECT sf.*, 'assigned' AS source, tsf.price
         FROM tenant_subscription_features tsf JOIN saas_features sf ON sf.id = tsf.feature_id
         WHERE tsf.subscription_id = $1
         UNION
         SELECT sf.*, 'included' AS source, 0::numeric AS price
         FROM saas_plan_features spf JOIN saas_features sf ON sf.id = spf.feature_id
         WHERE spf.plan_id = $2`,
        [subscriptionId, planId],
      ),
      this.db.query(
        `SELECT sr.*, tsr.allocated_quantity, tsr.unit_price, spr.included_quantity, spr.max_allowed
         FROM tenant_subscription_resources tsr
         JOIN saas_resources sr ON sr.id = tsr.resource_id
         LEFT JOIN saas_plan_resources spr ON spr.plan_id = $2 AND spr.resource_id = sr.id
         WHERE tsr.subscription_id = $1
         UNION
         SELECT sr.*, NULL::int AS allocated_quantity, 0::numeric AS unit_price, spr.included_quantity, spr.max_allowed
         FROM saas_plan_resources spr JOIN saas_resources sr ON sr.id = spr.resource_id
         WHERE spr.plan_id = $2 AND NOT EXISTS (
           SELECT 1 FROM tenant_subscription_resources tsr WHERE tsr.subscription_id = $1 AND tsr.resource_id = sr.id
         )`,
        [subscriptionId, planId],
      ),
    ]);

    return { modules: modules.rows, features: features.rows, resources: resources.rows };
  }

  private async getTenant(tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenantId]);
    if (!rows.length) throw new NotFoundException('Organization not found');
    return rows[0];
  }

  private async getCurrentSubscription(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT ts.*, COALESCE(sbp.name, ts.custom_plan_name, 'Custom plan') AS plan_name, sbp.slug AS plan_slug
       FROM tenant_subscriptions ts
       LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id
       WHERE ts.tenant_id = $1 AND ts.status = '${ACTIVE_STATUS}'
       ORDER BY ts.created_at DESC LIMIT 1`,
      [tenantId],
    );
    return rows[0] || null;
  }

  private async requireCurrentSubscription(tenantId: string) {
    await this.getTenant(tenantId);
    const current = await this.getCurrentSubscription(tenantId);
    if (!current) throw new NotFoundException('No active subscription found for this organization');
    return current;
  }

  private validateDateOrder(start: string, end: string, nextBilling: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const nextDate = new Date(nextBilling);
    if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf()) || Number.isNaN(nextDate.valueOf())) {
      throw new BadRequestException('Invalid subscription dates');
    }
    if (endDate < startDate) throw new BadRequestException('Current period end cannot be before current period start');
    if (nextDate < startDate) throw new BadRequestException('Next billing date cannot be before current period start');
  }

  private toDateOnly(value: string | Date) {
    return new Date(value).toISOString().slice(0, 10);
  }

  private normalizeResourceQuantities(value: Record<string, number>) {
    const result: Record<string, number> = {};
    for (const [resourceId, rawQuantity] of Object.entries(value || {})) {
      const quantity = Number(rawQuantity);
      if (!Number.isFinite(quantity) || quantity < 0) throw new BadRequestException('Resource quantities must be non-negative numbers');
      result[resourceId] = quantity;
    }
    return result;
  }

  private async validateEntitlementIds(client: Client, moduleIds: string[], featureIds: string[], resourceQuantities: Record<string, number>) {
    if (moduleIds.length) {
      const { rows } = await client.query('SELECT id FROM saas_modules WHERE id = ANY($1::uuid[]) AND is_active = true', [moduleIds]);
      if (rows.length !== new Set(moduleIds).size) throw new BadRequestException('One or more selected modules are inactive or invalid');
    }
    if (featureIds.length) {
      const { rows } = await client.query('SELECT id FROM saas_features WHERE id = ANY($1::uuid[]) AND is_active = true', [featureIds]);
      if (rows.length !== new Set(featureIds).size) throw new BadRequestException('One or more selected features are inactive or invalid');
    }
    const resourceIds = Object.keys(resourceQuantities);
    if (resourceIds.length) {
      const { rows } = await client.query('SELECT id FROM saas_resources WHERE id = ANY($1::uuid[]) AND is_active = true', [resourceIds]);
      if (rows.length !== new Set(resourceIds).size) throw new BadRequestException('One or more selected resources are inactive or invalid');
    }
  }

  private async resolveOfferRedemption(client: Client, tenantId: string, requestedId?: string | null) {
    if (requestedId) {
      const { rows } = await client.query('SELECT id FROM tenant_signup_offer_redemptions WHERE id = $1 AND tenant_id = $2', [requestedId, tenantId]);
      if (!rows.length) throw new BadRequestException('Signup offer redemption does not belong to this organization');
      return requestedId;
    }
    const { rows } = await client.query('SELECT id FROM tenant_signup_offer_redemptions WHERE tenant_id = $1 ORDER BY redeemed_at DESC LIMIT 1', [tenantId]);
    return rows[0]?.id || null;
  }

  private async syncTrialMarker(client: Client, tenantId: string, source: string, periodEnd: string) {
    if (source === 'free_trial') {
      await client.query('UPDATE tenants SET trial_ends_at = $2, updated_at = now() WHERE id = $1', [tenantId, new Date(periodEnd)]);
      return;
    }
    if (source !== 'signup_offer') {
      await client.query('UPDATE tenants SET trial_ends_at = NULL, updated_at = now() WHERE id = $1 AND trial_ends_at IS NOT NULL', [tenantId]);
    }
  }

  private effectiveSource(row: any) {
    if (row.subscription_source) return row.subscription_source;
    if (row.trial_ends_at && new Date(row.trial_ends_at) > new Date()) return 'free_trial';
    return 'free_plan';
  }

  private async getCurrentModuleIds(client: Client, subscriptionId: string) {
    const { rows } = await client.query('SELECT module_id FROM tenant_subscription_modules WHERE subscription_id = $1', [subscriptionId]);
    return rows.map((r) => r.module_id);
  }

  private async getCurrentFeatureIds(client: Client, subscriptionId: string) {
    const { rows } = await client.query('SELECT feature_id FROM tenant_subscription_features WHERE subscription_id = $1', [subscriptionId]);
    return rows.map((r) => r.feature_id);
  }

  private async getCurrentResourceQuantities(client: Client, subscriptionId: string) {
    const { rows } = await client.query('SELECT resource_id, allocated_quantity FROM tenant_subscription_resources WHERE subscription_id = $1', [subscriptionId]);
    return Object.fromEntries(rows.map((r) => [r.resource_id, r.allocated_quantity]));
  }

  private async getModulePrice(moduleId: string, billingCycle: string) {
    const { rows } = await this.db.query('SELECT price_monthly, price_yearly FROM saas_modules WHERE id = $1', [moduleId]);
    return billingCycle === 'yearly' ? rows[0]?.price_yearly || 0 : rows[0]?.price_monthly || 0;
  }

  private async getFeaturePrice(featureId: string, billingCycle: string) {
    const { rows } = await this.db.query('SELECT price_monthly, price_yearly FROM saas_features WHERE id = $1', [featureId]);
    return billingCycle === 'yearly' ? rows[0]?.price_yearly || 0 : rows[0]?.price_monthly || 0;
  }

  private async getResourcePrice(resourceId: string, billingCycle: string) {
    const { rows } = await this.db.query('SELECT price_per_unit_monthly, price_per_unit_yearly FROM saas_resources WHERE id = $1', [resourceId]);
    return billingCycle === 'yearly' ? rows[0]?.price_per_unit_yearly || 0 : rows[0]?.price_per_unit_monthly || 0;
  }
}
