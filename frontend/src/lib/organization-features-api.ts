import api from '@/lib/api';

export type FeatureOverrideState = 'enabled' | 'disabled' | 'inherit';

export interface OrganizationFeatureListRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  lifecycle_stage: string;
  primary_email: string | null;
  subscription_id: string | null;
  plan_name: string | null;
  subscription_source: string | null;
  current_period_end: string | null;
  override_count: number;
}

export interface OrganizationFeatureModule {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  subscription_enabled: boolean;
  override_state: FeatureOverrideState;
  override_reason: string | null;
  override_source: string;
  effective_enabled: boolean;
  effective_source: string;
  disabled_reason: string | null;
}

export interface OrganizationFeature extends OrganizationFeatureModule {
  module_id: string;
  module_slug: string;
  module_name: string;
}

export interface OrganizationFeatureTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  items: Array<{ entity_type: 'module' | 'feature'; entity_id: string; state: FeatureOverrideState }>;
}

export interface OrganizationFeatureMatrix {
  organization: { id: string; name: string; slug: string; status: string; lifecycle_stage: string } | null;
  subscription: { id: string; plan_name: string | null; plan_slug: string | null; subscription_source: string | null; current_period_end: string | null } | null;
  summary: {
    enabledModules: number;
    disabledModules: number;
    enabledFeatures: number;
    disabledFeatures: number;
    overrideCount: number;
    subscriptionModules: number;
    subscriptionFeatures: number;
  };
  modules: OrganizationFeatureModule[];
  features: OrganizationFeature[];
  recentChanges: any[];
  templates: OrganizationFeatureTemplate[];
}

export async function listOrganizationFeatureOrganizations(params?: { search?: string; page?: number; limit?: number }) {
  const { data } = await api.get('/operations/organization-features/organizations', { params });
  return { data: data.data as OrganizationFeatureListRow[], meta: data.meta };
}

export async function getOrganizationFeatureMatrix(tenantId: string): Promise<OrganizationFeatureMatrix> {
  const { data } = await api.get(`/operations/organization-features/${tenantId}`);
  return data.data;
}

export async function updateOrganizationFeatureOverrides(
  tenantId: string,
  payload: { overrides: Array<{ entityType: 'module' | 'feature'; entityId: string; state: FeatureOverrideState }>; reason?: string },
): Promise<OrganizationFeatureMatrix> {
  const { data } = await api.post(`/operations/organization-features/${tenantId}/overrides`, payload);
  return data.data;
}

export async function resetOrganizationFeatureOverrides(tenantId: string, reason?: string): Promise<OrganizationFeatureMatrix> {
  const { data } = await api.post(`/operations/organization-features/${tenantId}/reset`, { reason });
  return data.data;
}

export async function applyOrganizationFeatureTemplate(tenantId: string, templateId: string, reason?: string): Promise<OrganizationFeatureMatrix> {
  const { data } = await api.post(`/operations/organization-features/${tenantId}/apply-template`, { templateId, reason });
  return data.data;
}

export async function saveOrganizationFeatureTemplate(payload: {
  name: string;
  slug: string;
  description?: string;
  overrides: Array<{ entityType: 'module' | 'feature'; entityId: string; state: FeatureOverrideState }>;
}): Promise<OrganizationFeatureTemplate> {
  const { data } = await api.post('/operations/organization-features/templates', payload);
  return data.data;
}
