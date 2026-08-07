import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class BillingEngineService {
  constructor(private db: DatabaseService) {}

  /**
   * Calculate the total subscription amount based on selected plan, modules, features, resources, and billing cycle.
   * This is used both for estimating (checkout) and for generating the final subscription.
   */
  async calculateSubscriptionPrice(
    planId: string,
    billingCycle: 'monthly' | 'yearly',
    selectedModules: string[] = [], // array of module IDs
    selectedFeatures: string[] = [], // array of feature IDs
    resourceQuantities: Record<string, number> = {}, // map of resource ID -> allocated quantity
    discountCode?: string,
  ): Promise<{
    basePrice: number;
    modulesCost: number;
    featuresCost: number;
    resourcesCost: number;
    discountAmount: number;
    total: number;
    breakdown: any;
  }> {
    let basePrice = 0;
    let modulesCost = 0;
    let featuresCost = 0;
    let resourcesCost = 0;
    let discountAmount = 0;
    const breakdown: { modules: any[]; features: any[]; resources: any[] } = { modules: [], features: [], resources: [] };

    // 1. Base Plan Price
    const plan = await this.db.query('SELECT * FROM saas_base_plans WHERE id = $1 AND is_active = true', [planId]);
    if (!plan.rows.length) throw new NotFoundException('Base plan not found');
    basePrice = billingCycle === 'yearly' ? parseFloat(plan.rows[0].price_yearly) : parseFloat(plan.rows[0].price_monthly);

    // 2. Base Plan Default Modules & Features (Included at no extra cost)
    const { rows: planModules } = await this.db.query('SELECT module_id FROM saas_plan_modules WHERE plan_id = $1', [planId]);
    const includedModuleIds = new Set(planModules.map(r => r.module_id));

    const { rows: planFeatures } = await this.db.query('SELECT feature_id FROM saas_plan_features WHERE plan_id = $1', [planId]);
    const includedFeatureIds = new Set(planFeatures.map(r => r.feature_id));

    const { rows: planResources } = await this.db.query('SELECT resource_id, included_quantity FROM saas_plan_resources WHERE plan_id = $1', [planId]);
    const includedResources = Object.fromEntries(planResources.map(r => [r.resource_id, r.included_quantity]));

    // 3. Modules Cost
    if (selectedModules.length > 0) {
      const { rows: modules } = await this.db.query('SELECT id, name, price_monthly, price_yearly FROM saas_modules WHERE id = ANY($1::uuid[]) AND is_active = true', [selectedModules]);
      for (const mod of modules) {
        if (!includedModuleIds.has(mod.id)) {
          const cost = billingCycle === 'yearly' ? parseFloat(mod.price_yearly) : parseFloat(mod.price_monthly);
          modulesCost += cost;
          breakdown.modules.push({ id: mod.id, name: mod.name, cost });
        }
      }
    }

    // 4. Features Cost
    if (selectedFeatures.length > 0) {
      const { rows: features } = await this.db.query('SELECT id, name, price_monthly, price_yearly FROM saas_features WHERE id = ANY($1::uuid[]) AND is_active = true', [selectedFeatures]);
      for (const feat of features) {
        if (!includedFeatureIds.has(feat.id)) {
          const cost = billingCycle === 'yearly' ? parseFloat(feat.price_yearly) : parseFloat(feat.price_monthly);
          featuresCost += cost;
          breakdown.features.push({ id: feat.id, name: feat.name, cost });
        }
      }
    }

    // 5. Resources Cost
    const resourceIds = Object.keys(resourceQuantities);
    if (resourceIds.length > 0) {
      const { rows: resources } = await this.db.query('SELECT id, name, price_per_unit_monthly, price_per_unit_yearly FROM saas_resources WHERE id = ANY($1::uuid[]) AND is_active = true', [resourceIds]);
      for (const res of resources) {
        const requestedQuantity = resourceQuantities[res.id];
        const includedQty = includedResources[res.id] || 0;
        
        if (requestedQuantity > includedQty) {
          const billableUnits = requestedQuantity - includedQty;
          const unitPrice = billingCycle === 'yearly' ? parseFloat(res.price_per_unit_yearly) : parseFloat(res.price_per_unit_monthly);
          const cost = billableUnits * unitPrice;
          resourcesCost += cost;
          breakdown.resources.push({ id: res.id, name: res.name, billableUnits, unitPrice, cost });
        }
      }
    }

    // Total before discount
    let total = basePrice + modulesCost + featuresCost + resourcesCost;

    // 6. Discount
    if (discountCode) {
      const { rows: discounts } = await this.db.query(
        'SELECT * FROM saas_discounts WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > now()) AND (usage_limit IS NULL OR times_used < usage_limit)',
        [discountCode]
      );
      if (discounts.length > 0) {
        const d = discounts[0];
        if (d.discount_type === 'percentage') {
          discountAmount = total * (parseFloat(d.amount) / 100);
        } else if (d.discount_type === 'flat') {
          discountAmount = parseFloat(d.amount);
        }
        discountAmount = Math.min(discountAmount, total); // don't discount below 0
      }
    }

    total -= discountAmount;

    return {
      basePrice,
      modulesCost,
      featuresCost,
      resourcesCost,
      discountAmount,
      total,
      breakdown,
    };
  }

  /**
   * Enforce Module Access. Returns true if the tenant has purchased or is granted the module.
   */
  async validateModuleAccess(tenantId: string, moduleSlug: string): Promise<boolean> {
    const { rows } = await this.db.query(`
      SELECT 1 
      FROM tenant_subscriptions ts
      JOIN tenant_subscription_modules tsm ON tsm.subscription_id = ts.id
      JOIN saas_modules sm ON sm.id = tsm.module_id
      WHERE ts.tenant_id = $1 AND ts.status = 'active' AND sm.slug = $2
    `, [tenantId, moduleSlug]);

    if (rows.length > 0) return true;

    // Also check if it's included in the base plan natively and not overridden
    const { rows: planRows } = await this.db.query(`
      SELECT 1 
      FROM tenant_subscriptions ts
      JOIN saas_plan_modules spm ON spm.plan_id = ts.plan_id
      JOIN saas_modules sm ON sm.id = spm.module_id
      WHERE ts.tenant_id = $1 AND ts.status = 'active' AND sm.slug = $2
    `, [tenantId, moduleSlug]);

    return planRows.length > 0;
  }

  /**
   * Retrieve resource limit details for a tenant.
   * Returns the allocated quantity (purchased) or the base plan included quantity.
   */
  async getResourceLimit(tenantId: string, resourceSlug: string): Promise<{ maxAllowed: number | null, allocated: number | null }> {
    // Check custom allocation in tenant_subscription_resources
    const { rows: subRes } = await this.db.query(`
      SELECT tsr.allocated_quantity 
      FROM tenant_subscriptions ts
      JOIN tenant_subscription_resources tsr ON tsr.subscription_id = ts.id
      JOIN saas_resources sr ON sr.id = tsr.resource_id
      WHERE ts.tenant_id = $1 AND ts.status = 'active' AND sr.slug = $2
      ORDER BY ts.created_at DESC LIMIT 1
    `, [tenantId, resourceSlug]);

    let allocated = null;
    if (subRes.length > 0) {
      allocated = subRes[0].allocated_quantity;
    }

    // Get Base Plan Limits
    const { rows: planRes } = await this.db.query(`
      SELECT spr.included_quantity, spr.max_allowed
      FROM tenant_subscriptions ts
      JOIN saas_plan_resources spr ON spr.plan_id = ts.plan_id
      JOIN saas_resources sr ON sr.id = spr.resource_id
      WHERE ts.tenant_id = $1 AND ts.status = 'active' AND sr.slug = $2
      ORDER BY ts.created_at DESC LIMIT 1
    `, [tenantId, resourceSlug]);

    let maxAllowed = null;
    let included = null;

    if (planRes.length > 0) {
      maxAllowed = planRes[0].max_allowed;
      included = planRes[0].included_quantity;
    }

    // If allocated is not set in tenant_subscription_resources, it means they are relying on the plan's included quantity.
    if (allocated === null) {
      allocated = included;
    }

    return { maxAllowed, allocated };
  }

  /**
   * Helper to ensure a requested resource consumption does not exceed limits.
   */
  async validateResourceConsumption(tenantId: string, resourceSlug: string, requestedConsumption: number): Promise<boolean> {
    const limits = await this.getResourceLimit(tenantId, resourceSlug);
    
    if (limits.allocated === null && limits.maxAllowed === null) {
      return true; // unlimited
    }
    
    // Check against allocated limits (which is included + purchased add-ons)
    if (limits.allocated !== null && requestedConsumption > limits.allocated) {
      return false;
    }

    // Check against hard ceiling if the plan imposes one
    if (limits.maxAllowed !== null && requestedConsumption > limits.maxAllowed) {
      return false;
    }

    return true;
  }
}
