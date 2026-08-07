import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { FeatureAvailabilityService } from '../../../shared/feature-availability.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import {
  ApplyFeatureTemplateDto,
  FeatureOverrideItemDto,
  SaveFeatureTemplateDto,
  UpdateOrganizationFeatureOverridesDto,
} from '../dto/organization-feature-management.dto';

interface OpsActor {
  sub: string;
}

type Client = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

@Injectable()
export class OrganizationFeatureManagementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly featureAvailability: FeatureAvailabilityService,
    private readonly auditLog: AuditLogService,
  ) {}

  async listOrganizations(filters: any) {
    const { page = 1, limit = 30, search } = filters;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (safePage - 1) * safeLimit;
    const params: any[] = [];
    let where = 'WHERE t.deleted_at IS NULL';

    if (search) {
      params.push(`%${String(search).trim()}%`);
      where += ` AND (t.name ILIKE $1 OR t.slug ILIKE $1 OR t.primary_email ILIKE $1)`;
    }

    const base = `
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT ts.*, COALESCE(sbp.name, ts.custom_plan_name, 'Custom plan') AS plan_name
        FROM tenant_subscriptions ts
        LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id
        WHERE ts.tenant_id = t.id AND ts.status = 'active'
        ORDER BY ts.created_at DESC
        LIMIT 1
      ) current_sub ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS override_count
        FROM organization_feature_overrides ofo
        WHERE ofo.tenant_id = t.id AND ofo.state <> 'inherit'
      ) overrides ON true
    `;

    const [{ rows }, count] = await Promise.all([
      this.db.query(
        `SELECT t.id, t.name, t.slug, t.status, t.lifecycle_stage, t.primary_email,
                current_sub.id AS subscription_id, current_sub.plan_name,
                current_sub.subscription_source, current_sub.current_period_end,
                COALESCE(overrides.override_count, 0) AS override_count
         ${base}
         ${where}
         ORDER BY t.name ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, safeLimit, offset],
      ),
      this.db.query(`SELECT COUNT(*) ${base} ${where}`, params),
    ]);

    const total = parseInt(count.rows[0].count, 10);
    return {
      data: rows,
      meta: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async getOrganizationFeatures(tenantId: string) {
    await this.requireTenant(tenantId);
    const [matrix, recentChanges, templates] = await Promise.all([
      this.featureAvailability.getTenantAvailability(tenantId),
      this.auditLog.findAll(tenantId, { entityType: 'organization_feature', limit: 10 }),
      this.listTemplates(),
    ]);

    return {
      ...matrix,
      recentChanges: recentChanges.data,
      templates,
    };
  }

  async updateOverrides(tenantId: string, dto: UpdateOrganizationFeatureOverridesDto, actor: OpsActor) {
    await this.requireTenant(tenantId);
    const uniqueOverrides = this.dedupeOverrides(dto.overrides || []);
    await this.validateOverrides(tenantId, uniqueOverrides);

    const previous = await this.db.query('SELECT * FROM organization_feature_overrides WHERE tenant_id = $1', [tenantId]);
    const updated = await this.db.transaction(async (client) => {
      for (const item of uniqueOverrides) {
        if (item.state === 'inherit') {
          await client.query(
            'DELETE FROM organization_feature_overrides WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3',
            [tenantId, item.entityType, item.entityId],
          );
          continue;
        }

        await client.query(
          `INSERT INTO organization_feature_overrides (
             tenant_id, entity_type, entity_id, state, reason, created_by_user_id, updated_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (tenant_id, entity_type, entity_id)
           DO UPDATE SET state = EXCLUDED.state, reason = EXCLUDED.reason,
                         updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()`,
          [tenantId, item.entityType, item.entityId, item.state, dto.reason || null, actor.sub],
        );

        if (item.entityType === 'module' && item.state === 'disabled') {
          await this.disableModuleFeatures(client, tenantId, item.entityId, dto.reason || null, actor.sub);
        }
      }

      const { rows } = await client.query('SELECT * FROM organization_feature_overrides WHERE tenant_id = $1', [tenantId]);
      return rows;
    });

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'organization_feature',
      entityId: tenantId,
      action: 'feature_overrides_updated',
      oldValues: previous.rows,
      newValues: { overrides: updated, reason: dto.reason || null },
    });

    return this.getOrganizationFeatures(tenantId);
  }

  async resetToSubscriptionDefaults(tenantId: string, actor: OpsActor, reason?: string) {
    await this.requireTenant(tenantId);
    const previous = await this.db.query('SELECT * FROM organization_feature_overrides WHERE tenant_id = $1', [tenantId]);
    await this.db.query('DELETE FROM organization_feature_overrides WHERE tenant_id = $1', [tenantId]);
    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'organization_feature',
      entityId: tenantId,
      action: 'feature_overrides_reset',
      oldValues: previous.rows,
      newValues: { reason: reason || null },
    });
    return this.getOrganizationFeatures(tenantId);
  }

  async listTemplates() {
    const { rows } = await this.db.query(
      `SELECT t.*, COALESCE(json_agg(i.*) FILTER (WHERE i.template_id IS NOT NULL), '[]') AS items
       FROM organization_feature_templates t
       LEFT JOIN organization_feature_template_items i ON i.template_id = t.id
       WHERE t.is_active = true
       GROUP BY t.id
       ORDER BY t.name ASC`,
    );
    return rows;
  }

  async saveTemplate(dto: SaveFeatureTemplateDto, actor: OpsActor) {
    const overrides = this.dedupeOverrides(dto.overrides || []);
    await this.validateEntityIds(overrides);

    const created = await this.db.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO organization_feature_templates (name, slug, description, created_by_user_id, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
                                      updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
         RETURNING *`,
        [dto.name.trim(), dto.slug.trim(), dto.description || null, actor.sub],
      );
      await client.query('DELETE FROM organization_feature_template_items WHERE template_id = $1', [rows[0].id]);
      for (const item of overrides) {
        await client.query(
          `INSERT INTO organization_feature_template_items (template_id, entity_type, entity_id, state)
           VALUES ($1, $2, $3, $4)`,
          [rows[0].id, item.entityType, item.entityId, item.state],
        );
      }
      return rows[0];
    });

    return created;
  }

  async applyTemplate(tenantId: string, dto: ApplyFeatureTemplateDto, actor: OpsActor) {
    await this.requireTenant(tenantId);
    const { rows } = await this.db.query(
      'SELECT entity_type AS "entityType", entity_id AS "entityId", state FROM organization_feature_template_items WHERE template_id = $1',
      [dto.templateId],
    );
    if (!rows.length) throw new NotFoundException('Feature template not found or empty');
    return this.updateOverrides(tenantId, { overrides: rows, reason: dto.reason || 'Applied feature template' }, actor);
  }

  private async requireTenant(tenantId: string) {
    const { rows } = await this.db.query('SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenantId]);
    if (!rows.length) throw new NotFoundException('Organization not found');
  }

  private dedupeOverrides(overrides: FeatureOverrideItemDto[]) {
    return Array.from(new Map(overrides.map((item) => [`${item.entityType}:${item.entityId}`, item])).values());
  }

  private async validateOverrides(tenantId: string, overrides: FeatureOverrideItemDto[]) {
    await this.validateEntityIds(overrides);
    const moduleIds = overrides.filter((item) => item.entityType === 'module').map((item) => item.entityId);
    const featureIds = overrides.filter((item) => item.entityType === 'feature').map((item) => item.entityId);
    const [modules, features] = await Promise.all([
      moduleIds.length
        ? this.db.query('SELECT id, is_active FROM saas_modules WHERE id = ANY($1::uuid[])', [moduleIds])
        : Promise.resolve({ rows: [] }),
      featureIds.length
        ? this.db.query(
            `SELECT f.id, f.module_id, f.is_active, m.is_active AS module_is_active,
                    parent_override.state AS parent_override_state
             FROM saas_features f
             JOIN saas_modules m ON m.id = f.module_id
             LEFT JOIN organization_feature_overrides parent_override
               ON parent_override.tenant_id = $2
              AND parent_override.entity_type = 'module'
              AND parent_override.entity_id = f.module_id
             WHERE f.id = ANY($1::uuid[])`,
            [featureIds, tenantId],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    const modulesById = new Map<string, any>(modules.rows.map((item: any) => [item.id, item] as [string, any]));
    const featuresById = new Map<string, any>(features.rows.map((item: any) => [item.id, item] as [string, any]));
    const disabledModuleIds = new Set(
      overrides
        .filter((item) => item.entityType === 'module' && item.state === 'disabled')
        .map((item) => item.entityId),
    );

    for (const item of overrides) {
      if (item.state !== 'enabled') continue;
      if (item.entityType === 'module') {
        const module = modulesById.get(item.entityId);
        if (module?.is_active === false) throw new BadRequestException('Cannot enable a module that is disabled in the system registry');
      } else {
        const feature = featuresById.get(item.entityId);
        if (feature?.is_active === false) throw new BadRequestException('Cannot enable a feature that is disabled in the system registry');
        if (feature?.module_is_active === false || feature?.parent_override_state === 'disabled' || disabledModuleIds.has(feature?.module_id)) {
          throw new BadRequestException('Cannot enable a feature while its parent module is disabled');
        }
      }
    }
  }

  private async validateEntityIds(overrides: FeatureOverrideItemDto[]) {
    const moduleIds = overrides.filter((item) => item.entityType === 'module').map((item) => item.entityId);
    const featureIds = overrides.filter((item) => item.entityType === 'feature').map((item) => item.entityId);
    if (moduleIds.length) {
      const { rows } = await this.db.query('SELECT id FROM saas_modules WHERE id = ANY($1::uuid[])', [moduleIds]);
      if (rows.length !== new Set(moduleIds).size) throw new BadRequestException('One or more modules are invalid');
    }
    if (featureIds.length) {
      const { rows } = await this.db.query('SELECT id FROM saas_features WHERE id = ANY($1::uuid[])', [featureIds]);
      if (rows.length !== new Set(featureIds).size) throw new BadRequestException('One or more features are invalid');
    }
  }

  private async disableModuleFeatures(client: Client, tenantId: string, moduleId: string, reason: string | null, actorId: string) {
    const { rows } = await client.query('SELECT id FROM saas_features WHERE module_id = $1', [moduleId]);
    for (const feature of rows) {
      await client.query(
        `INSERT INTO organization_feature_overrides (
           tenant_id, entity_type, entity_id, state, reason, created_by_user_id, updated_by_user_id
         ) VALUES ($1, 'feature', $2, 'disabled', $3, $4, $4)
         ON CONFLICT (tenant_id, entity_type, entity_id)
         DO UPDATE SET state = 'disabled', reason = EXCLUDED.reason,
                       updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()`,
        [tenantId, feature.id, reason, actorId],
      );
    }
  }
}
