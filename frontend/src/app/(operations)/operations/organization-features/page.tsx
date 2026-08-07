'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { canOps, OPS_PERMISSIONS } from '@/lib/internal-roles';
import {
  getOrganizationFeatureMatrix,
  listOrganizationFeatureOrganizations,
  resetOrganizationFeatureOverrides,
  saveOrganizationFeatureTemplate,
  updateOrganizationFeatureOverrides,
  type FeatureOverrideState,
  type OrganizationFeatureListRow,
  type OrganizationFeatureMatrix,
  type OrganizationFeatureModule,
} from '@/lib/organization-features-api';
import { useAuthStore } from '@/store/auth.store';

const statusClass: Record<string, string> = {
  organization_override: 'bg-amber-50 text-amber-700 border-amber-200',
  system: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  system_disabled: 'bg-slate-100 text-slate-600 border-slate-200',
};

function SourceBadge({ source }: { source: string }) {
  const label = source.replace(/_/g, ' ');
  return <span className={cn('rounded border px-2 py-0.5 text-xs capitalize', statusClass[source] || 'bg-slate-50 text-slate-700 border-slate-200')}>{label}</span>;
}

function ToggleButton({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-slate-200',
      )}
      aria-pressed={checked}
    >
      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  );
}

function nextState(item: { effective_enabled: boolean; override_state: FeatureOverrideState }): FeatureOverrideState {
  return item.effective_enabled ? 'disabled' : 'enabled';
}

export default function OrganizationFeaturesPage() {
  const { internalRole } = useAuthStore();
  const canManage = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATION_FEATURES_MANAGE);
  const [organizations, setOrganizations] = useState<OrganizationFeatureListRow[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<OrganizationFeatureMatrix | null>(null);
  const [orgSearch, setOrgSearch] = useState('');
  const [featureSearch, setFeatureSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'overrides'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listOrganizationFeatureOrganizations({ search: orgSearch, limit: 50 })
        .then((result) => {
          setOrganizations(result.data);
          setSelectedOrgId((current) => current || result.data[0]?.id || null);
        })
        .catch((err) => setError(err.response?.data?.message || 'Failed to load organizations'))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [orgSearch]);

  useEffect(() => {
    if (!selectedOrgId) return;
    setDetailLoading(true);
    getOrganizationFeatureMatrix(selectedOrgId)
      .then((data) => {
        setMatrix(data);
        setExpanded(new Set(data.modules.slice(0, 4).map((module) => module.id)));
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load feature matrix'))
      .finally(() => setDetailLoading(false));
  }, [selectedOrgId]);

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) || null;
  const currentEnabledModules = useMemo(
    () => matrix?.modules.filter((module) => module.effective_enabled).map((module) => module.name) || [],
    [matrix],
  );
  const groupedModules = useMemo(() => {
    if (!matrix) return [];
    const query = featureSearch.trim().toLowerCase();
    return matrix.modules
      .map((module) => ({
        module,
        features: matrix.features.filter((feature) => feature.module_id === module.id),
      }))
      .filter(({ module, features }) => {
        if (filter === 'enabled' && !module.effective_enabled && !features.some((feature) => feature.effective_enabled)) return false;
        if (filter === 'disabled' && module.effective_enabled && features.every((feature) => feature.effective_enabled)) return false;
        if (filter === 'overrides' && module.override_state === 'inherit' && features.every((feature) => feature.override_state === 'inherit')) return false;
        if (!query) return true;
        return (
          module.name.toLowerCase().includes(query) ||
          module.slug.toLowerCase().includes(query) ||
          features.some((feature) => feature.name.toLowerCase().includes(query) || feature.slug.toLowerCase().includes(query))
        );
      });
  }, [matrix, featureSearch, filter]);

  async function setOverride(entityType: 'module' | 'feature', entityId: string, state: FeatureOverrideState) {
    if (!selectedOrgId || !matrix) return;
    setError(null);
    try {
      const data = await updateOrganizationFeatureOverrides(selectedOrgId, {
        overrides: [{ entityType, entityId, state }],
        reason: reason || undefined,
      });
      setMatrix(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update feature override');
    }
  }

  async function bulkUpdate(state: FeatureOverrideState) {
    if (!selectedOrgId || !matrix) return;
    const overrides = matrix.modules.map((module) => ({ entityType: 'module' as const, entityId: module.id, state }));
    try {
      setMatrix(await updateOrganizationFeatureOverrides(selectedOrgId, { overrides, reason: reason || undefined }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Bulk update failed');
    }
  }

  async function resetDefaults() {
    if (!selectedOrgId) return;
    setMatrix(await resetOrganizationFeatureOverrides(selectedOrgId, reason || undefined));
  }

  async function saveTemplateFromCurrent() {
    if (!matrix) return;
    const name = window.prompt('Template name');
    if (!name?.trim()) return;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const overrides = [
      ...matrix.modules
        .filter((module) => module.override_state !== 'inherit')
        .map((module) => ({ entityType: 'module' as const, entityId: module.id, state: module.override_state })),
      ...matrix.features
        .filter((feature) => feature.override_state !== 'inherit')
        .map((feature) => ({ entityType: 'feature' as const, entityId: feature.id, state: feature.override_state })),
    ];
    if (!overrides.length) {
      setError('There are no platform overrides to save as a template');
      return;
    }
    await saveOrganizationFeatureTemplate({ name: name.trim(), slug, overrides });
    if (selectedOrgId) setMatrix(await getOrganizationFeatureMatrix(selectedOrgId));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organization Features</h1>
          <p className="text-sm text-muted-foreground">Manage platform-controlled module and feature availability per organization.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!canManage || !matrix} onClick={() => bulkUpdate('enabled')}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Enable Modules
          </Button>
          <Button variant="outline" size="sm" disabled={!canManage || !matrix} onClick={() => bulkUpdate('disabled')}>
            <XCircle className="mr-2 h-4 w-4" /> Disable Modules
          </Button>
          <Button variant="outline" size="sm" disabled={!canManage || !matrix} onClick={resetDefaults}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
          <Button variant="outline" size="sm" disabled={!canManage || !matrix} onClick={saveTemplateFromCurrent}>
            <Copy className="mr-2 h-4 w-4" /> Save Template
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-md border bg-background">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={orgSearch} onChange={(event) => setOrgSearch(event.target.value)} placeholder="Search organizations" className="pl-9" />
            </div>
          </div>
          <div className="max-h-[720px] overflow-y-auto p-2">
            {loading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading organizations...</p>
            ) : organizations.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No organizations found.</p>
            ) : (
              organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrgId(org.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left transition-colors',
                    selectedOrgId === org.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <span className="block truncate text-sm font-medium">{org.name}</span>
                  <span className="mt-1 block truncate text-xs opacity-75">{org.plan_name || 'No active subscription'} · {org.override_count} overrides</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="space-y-4">
          {selectedOrg && matrix && (
            <div className="rounded-md border bg-background p-4">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{selectedOrg.name}</h2>
                      <span className="rounded border px-2 py-0.5 text-xs capitalize text-muted-foreground">{selectedOrg.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {matrix.subscription?.plan_name || 'No active subscription'} · {matrix.subscription?.subscription_source || 'free_plan'}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-semibold">{matrix.summary.enabledModules}</p><p className="text-xs text-muted-foreground">Enabled</p></div>
                    <div><p className="text-lg font-semibold">{matrix.summary.disabledModules}</p><p className="text-xs text-muted-foreground">Disabled</p></div>
                    <div><p className="text-lg font-semibold">{matrix.summary.overrideCount}</p><p className="text-xs text-muted-foreground">Overrides</p></div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current module access</p>
                  {currentEnabledModules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No modules are currently enabled.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {currentEnabledModules.map((moduleName) => (
                        <span key={moduleName} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {moduleName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border bg-background p-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={featureSearch} onChange={(event) => setFeatureSearch(event.target.value)} placeholder="Search module, feature, or category" className="pl-9" />
              </div>
              <select value={filter} onChange={(event) => setFilter(event.target.value as any)} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="all">All</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
                <option value="overrides">Overrides</option>
              </select>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for audit log" className="lg:w-64" />
            </div>
          </div>

          <div className="rounded-md border bg-background">
            {detailLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading feature matrix...</p>
            ) : !matrix ? (
              <p className="p-6 text-sm text-muted-foreground">Select an organization to manage features.</p>
            ) : groupedModules.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No modules match the current filters.</p>
            ) : (
              groupedModules.map(({ module, features }) => (
                <div key={module.id} className="border-b last:border-b-0">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      className="rounded p-1 hover:bg-muted"
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current);
                        next.has(module.id) ? next.delete(module.id) : next.add(module.id);
                        return next;
                      })}
                    >
                      {expanded.has(module.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{module.name}</p>
                        <SourceBadge source={module.effective_source} />
                        {!module.effective_enabled && module.disabled_reason && <span className="text-xs text-rose-600">{module.disabled_reason}</span>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{module.description || module.slug}</p>
                    </div>
                    <div className="w-[112px] shrink-0">
                      <OverrideControls item={module} disabled={!canManage} onSet={(state) => setOverride('module', module.id, state)} />
                    </div>
                  </div>

                  {expanded.has(module.id) && (
                    <div className="bg-muted/30 px-4 pb-3 pl-14">
                      {features.length === 0 ? (
                        <p className="py-3 text-sm text-muted-foreground">No registered features in this module.</p>
                      ) : (
                        <div className="divide-y rounded-md border bg-background">
                          {features.map((feature) => (
                            <div key={feature.id} className="flex items-center gap-3 px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-medium">{feature.name}</p>
                                  <SourceBadge source={feature.effective_source} />
                                </div>
                                {feature.disabled_reason && <p className="text-xs text-rose-600">{feature.disabled_reason}</p>}
                              </div>
                              <div className="w-[112px] shrink-0">
                                <OverrideControls item={feature} disabled={!canManage || !module.effective_enabled} onSet={(state) => setOverride('feature', feature.id, state)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {matrix && matrix.recentChanges.length > 0 && (
            <div className="rounded-md border bg-background p-4">
              <h3 className="mb-3 text-sm font-semibold">Recent Changes</h3>
              <div className="space-y-2">
                {matrix.recentChanges.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="capitalize">{String(entry.action).replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OverrideControls({
  item,
  disabled,
  onSet,
}: {
  item: OrganizationFeatureModule;
  disabled?: boolean;
  onSet: (state: FeatureOverrideState) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        disabled={disabled || item.override_state === 'inherit'}
        onClick={() => onSet('inherit')}
        className="rounded-md border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
      >
        Inherit
      </button>
      <ToggleButton checked={item.effective_enabled} disabled={disabled} onClick={() => onSet(nextState(item))} />
    </div>
  );
}
