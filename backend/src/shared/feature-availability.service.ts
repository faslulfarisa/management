import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

export interface FeatureAvailability {
  moduleSlug: string;
  featureSlug?: string;
  enabled: boolean;
  source: 'system' | 'organization_override' | 'system_disabled';
  reason?: string;
}

@Injectable()
export class FeatureAvailabilityService {
  constructor(private readonly db: DatabaseService) {}

  async isModuleEnabled(tenantId: string, moduleSlug: string): Promise<FeatureAvailability> {
    const matrix = await this.getTenantAvailability(tenantId);
    const module = matrix.modules.find((item: any) => item.slug === moduleSlug);
    if (!module) {
      return { moduleSlug, enabled: false, source: 'system_disabled', reason: 'Module is not registered' };
    }
    return {
      moduleSlug,
      enabled: module.effective_enabled,
      source: module.effective_source,
      reason: module.disabled_reason,
    };
  }

  async isFeatureEnabled(tenantId: string, moduleSlug: string, featureSlug: string): Promise<FeatureAvailability> {
    const matrix = await this.getTenantAvailability(tenantId);
    const module = matrix.modules.find((item: any) => item.slug === moduleSlug);
    const feature = matrix.features.find((item: any) => item.module_slug === moduleSlug && item.slug === featureSlug);
    if (!module || !feature) {
      return { moduleSlug, featureSlug, enabled: false, source: 'system_disabled', reason: 'Feature is not registered' };
    }
    if (!module.effective_enabled) {
      return { moduleSlug, featureSlug, enabled: false, source: module.effective_source, reason: 'Parent module is disabled' };
    }
    return {
      moduleSlug,
      featureSlug,
      enabled: feature.effective_enabled,
      source: feature.effective_source,
      reason: feature.disabled_reason,
    };
  }

  async assertEnabled(tenantId: string, moduleSlug: string, featureSlug?: string) {
    const availability = featureSlug
      ? await this.isFeatureEnabled(tenantId, moduleSlug, featureSlug)
      : await this.isModuleEnabled(tenantId, moduleSlug);

    if (!availability.enabled) {
      throw new ForbiddenException({
        message: 'Feature Disabled',
        error: 'Feature Disabled',
        module: moduleSlug,
        feature: featureSlug || null,
        reason: availability.reason || availability.source,
      });
    }
  }

  async getTenantAvailability(tenantId: string) {
    const [tenant, current, modules, features, overrides] = await Promise.all([
      this.db.query('SELECT id, name, slug, status, lifecycle_stage FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenantId]),
      this.db.query(
        `SELECT ts.*, COALESCE(sbp.name, ts.custom_plan_name, 'Custom plan') AS plan_name, sbp.slug AS plan_slug
         FROM tenant_subscriptions ts
         LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id
         WHERE ts.tenant_id = $1 AND ts.status = 'active'
         ORDER BY ts.created_at DESC
         LIMIT 1`,
        [tenantId],
      ),
      this.db.query('SELECT * FROM saas_modules ORDER BY name ASC'),
      this.db.query(
        `SELECT f.*, m.slug AS module_slug, m.name AS module_name
         FROM saas_features f
         JOIN saas_modules m ON m.id = f.module_id
         ORDER BY m.name ASC, f.name ASC`,
      ),
      this.db.query('SELECT * FROM organization_feature_overrides WHERE tenant_id = $1', [tenantId]),
    ]);

    const subscription = current.rows[0] || null;
    const [subscriptionModules, planModules, subscriptionFeatures, planFeatures] = subscription
      ? await Promise.all([
          this.db.query('SELECT module_id FROM tenant_subscription_modules WHERE subscription_id = $1', [subscription.id]),
          subscription.plan_id
            ? this.db.query('SELECT module_id FROM saas_plan_modules WHERE plan_id = $1', [subscription.plan_id])
            : Promise.resolve({ rows: [] }),
          this.db.query('SELECT feature_id FROM tenant_subscription_features WHERE subscription_id = $1', [subscription.id]),
          subscription.plan_id
            ? this.db.query('SELECT feature_id FROM saas_plan_features WHERE plan_id = $1', [subscription.plan_id])
            : Promise.resolve({ rows: [] }),
        ])
      : [
          { rows: [] },
          { rows: [] },
          { rows: [] },
          { rows: [] },
        ];

    const subscribedModuleIds = new Set([...subscriptionModules.rows, ...planModules.rows].map((row) => row.module_id));
    const explicitlySubscribedFeatureIds = new Set([...subscriptionFeatures.rows, ...planFeatures.rows].map((row) => row.feature_id));
    const overrideMap = new Map(overrides.rows.map((row) => [`${row.entity_type}:${row.entity_id}`, row]));

    const resolvedModules = modules.rows.map((module) => {
      const override = overrideMap.get(`module:${module.id}`);
      return this.resolveEntity(module, subscribedModuleIds.has(module.id), override);
    });

    const moduleById = new Map(resolvedModules.map((module: any) => [module.id, module]));
    const hasFeatureLevelSubscription = explicitlySubscribedFeatureIds.size > 0;
    const resolvedFeatures = features.rows.map((feature) => {
      const parent = moduleById.get(feature.module_id);
      const inheritedFromModule = subscribedModuleIds.has(feature.module_id);
      const subscriptionEnabled = hasFeatureLevelSubscription
        ? explicitlySubscribedFeatureIds.has(feature.id)
        : inheritedFromModule;
      const override = overrideMap.get(`feature:${feature.id}`);
      const resolved = this.resolveEntity(feature, subscriptionEnabled, override);
      if (!parent?.effective_enabled) {
        return {
          ...resolved,
          effective_enabled: false,
          effective_source: parent?.effective_source || 'system_disabled',
          disabled_reason: 'Parent module is disabled',
        };
      }
      return resolved;
    });

    return {
      organization: tenant.rows[0] || null,
      subscription,
      summary: {
        enabledModules: resolvedModules.filter((item: any) => item.effective_enabled).length,
        disabledModules: resolvedModules.filter((item: any) => !item.effective_enabled).length,
        enabledFeatures: resolvedFeatures.filter((item: any) => item.effective_enabled).length,
        disabledFeatures: resolvedFeatures.filter((item: any) => !item.effective_enabled).length,
        overrideCount: overrides.rows.filter((item) => item.state !== 'inherit').length,
        subscriptionModules: subscribedModuleIds.size,
        subscriptionFeatures: explicitlySubscribedFeatureIds.size,
      },
      modules: resolvedModules,
      features: resolvedFeatures,
      overrides: overrides.rows,
    };
  }

  private resolveEntity(entity: any, subscriptionEnabled: boolean, override: any) {
    const systemEnabled = entity.is_active !== false;
    const overrideState = override?.state || 'inherit';
    let effectiveEnabled = systemEnabled;
    let effectiveSource: FeatureAvailability['source'] = 'system';
    let disabledReason = systemEnabled ? null : 'Disabled in system registry';

    if (!systemEnabled) {
      effectiveEnabled = false;
      effectiveSource = 'system_disabled';
    } else if (overrideState === 'disabled') {
      effectiveEnabled = false;
      effectiveSource = 'organization_override';
      disabledReason = override.reason || 'Disabled by platform override';
    } else if (overrideState === 'enabled') {
      effectiveEnabled = true;
      effectiveSource = 'organization_override';
      disabledReason = null;
    }

    return {
      ...entity,
      subscription_enabled: subscriptionEnabled,
      override_state: overrideState,
      override_reason: override?.reason || null,
      override_source: override ? 'platform_override' : 'inherited',
      effective_enabled: effectiveEnabled,
      effective_source: effectiveSource,
      disabled_reason: disabledReason,
    };
  }
}
