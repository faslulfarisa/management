'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Eye, FileText,
  Loader2, Pencil, Plus, RefreshCw, Search, Tag, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useAuthStore } from '@/store/auth.store';
import { canOps, OPS_PERMISSIONS } from '@/lib/internal-roles';
import {
  assignOpsSubscription,
  cancelOpsSubscription,
  getOpsSubscriptionCatalog,
  getOpsSubscriptionDetail,
  getOpsSubscriptionSummary,
  listOpsSubscriptions,
  renewOpsSubscription,
  updateCurrentOpsSubscription,
  type AssignSubscriptionPayload,
  type BillingCycle,
  type OpsSubscriptionDetail,
  type OpsSubscriptionRow,
  type SubscriptionCatalog,
  type SubscriptionMode,
  type SubscriptionSource,
} from '@/lib/operations-subscriptions-api';

const SOURCE_LABELS: Record<SubscriptionSource, string> = {
  catalog: 'Catalog',
  custom: 'Custom',
  signup_offer: 'Signup Offer',
  free_trial: 'Free Trial',
  free_plan: 'Free Plan',
  manual: 'Manual',
};

const SOURCE_OPTIONS: SubscriptionSource[] = ['catalog', 'custom', 'signup_offer', 'free_trial', 'free_plan', 'manual'];

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `INR ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function dateInput(value: string | null | undefined) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
}

function sourceBadge(source: SubscriptionSource) {
  const classes: Record<SubscriptionSource, string> = {
    catalog: 'bg-blue-50 text-blue-700 border-blue-200',
    custom: 'bg-violet-50 text-violet-700 border-violet-200',
    signup_offer: 'bg-amber-50 text-amber-700 border-amber-200',
    free_trial: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    free_plan: 'bg-slate-100 text-slate-600 border-slate-200',
    manual: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return `inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[source]}`;
}

function buildSummaryFromRows(rows: OpsSubscriptionRow[]) {
  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  return rows.reduce((summary, row) => {
    const source = row.effective_source;
    const expiry = row.current_period_end ? new Date(row.current_period_end) : null;
    const amount = Number(row.amount || 0);

    if (row.subscription_status === 'active' && amount > 0 && source !== 'free_plan' && source !== 'free_trial') summary.active_paid += 1;
    if (source === 'free_plan') summary.free_plan += 1;
    if (source === 'free_trial') summary.free_trial += 1;
    if (source === 'signup_offer' || row.offer_redemption_id) summary.signup_offer += 1;
    if (source === 'custom') summary.custom += 1;
    if (row.subscription_status === 'active' && expiry && expiry >= now && expiry <= soon) summary.expiring_soon += 1;
    if (expiry && expiry < now) summary.expired += 1;

    return summary;
  }, {
    active_paid: 0,
    free_plan: 0,
    free_trial: 0,
    signup_offer: 0,
    custom: 0,
    expiring_soon: 0,
    expired: 0,
  });
}

function StatCard({ icon: Icon, label, value }: { icon: typeof CreditCard; label: string; value: number }) {
  return (
    <div className="ops-panel p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground">{value ?? 0}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function EntitlementList({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={`${title}-${item.id}`} className="rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{item.name}</span>
                {item.source && <span className="text-[11px] text-muted-foreground capitalize">{item.source}</span>}
              </div>
              {'allocated_quantity' in item && (
                <p className="text-xs text-muted-foreground mt-1">
                  Allocated {item.allocated_quantity ?? item.included_quantity ?? 'Unlimited'} {item.unit_name || 'units'}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function DetailDrawer({
  detail,
  canManage,
  onClose,
  onEdit,
  onRenew,
  onCancel,
}: {
  detail: OpsSubscriptionDetail | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRenew: () => void;
  onCancel: () => void;
}) {
  if (!detail) return null;
  const current = detail.current;
  const source = (current?.subscription_source || (detail.tenant.trial_ends_at ? 'free_trial' : 'free_plan')) as SubscriptionSource;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{detail.tenant.name}</h2>
            <p className="text-sm text-muted-foreground">{detail.tenant.primary_email || detail.tenant.slug}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Subscription</p>
                <h3 className="text-base font-bold text-foreground">{current?.plan_name || current?.custom_plan_name || 'Free Plan'}</h3>
              </div>
              <span className={sourceBadge(source)}>{SOURCE_LABELS[source]}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Status</p><p className="font-medium capitalize">{current?.status || 'none'}</p></div>
              <div><p className="text-muted-foreground">Billing</p><p className="font-medium capitalize">{current?.billing_cycle || '-'}</p></div>
              <div><p className="text-muted-foreground">Amount</p><p className="font-medium">{money(current?.amount)}</p></div>
              <div><p className="text-muted-foreground">Expires</p><p className="font-medium">{dateLabel(current?.current_period_end || detail.tenant.trial_ends_at)}</p></div>
              <div><p className="text-muted-foreground">Period Start</p><p className="font-medium">{dateLabel(current?.current_period_start)}</p></div>
              <div><p className="text-muted-foreground">Next Billing</p><p className="font-medium">{dateLabel(current?.next_billing_date)}</p></div>
            </div>
            {current?.internal_notes && <p className="mt-4 text-sm text-muted-foreground border-t border-border pt-3">{current.internal_notes}</p>}
            {canManage && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={onEdit} className="gap-1.5"><Pencil className="h-4 w-4" /> Edit</Button>
                {current && <Button size="sm" variant="outline" onClick={onRenew} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Renew</Button>}
                {current && <Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5 text-destructive"><AlertTriangle className="h-4 w-4" /> Cancel</Button>}
              </div>
            )}
          </section>

          {detail.offerRedemption && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Signup Offer</p>
              <p className="font-semibold text-amber-950">{detail.offerRedemption.offer_name || detail.offerRedemption.offer_type}</p>
              <p className="text-sm text-amber-800">
                Redeemed {dateLabel(detail.offerRedemption.redeemed_at)}
                {detail.offerRedemption.offer_code ? ` with code ${detail.offerRedemption.offer_code}` : ''}
              </p>
            </section>
          )}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EntitlementList title="Modules" items={current?.entitlements?.modules || []} empty="No modules assigned." />
            <EntitlementList title="Features" items={current?.entitlements?.features || []} empty="No features assigned." />
            <EntitlementList title="Resources" items={current?.entitlements?.resources || []} empty="No resource limits assigned." />
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Subscription History</p>
            <div className="rounded-lg border border-border overflow-hidden">
              {detail.history.length ? detail.history.map((item) => (
                <div key={item.id} className="px-3 py-3 border-b border-border last:border-b-0 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{item.plan_name}</p>
                    <span className="capitalize text-muted-foreground">{item.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{dateLabel(item.current_period_start)} to {dateLabel(item.current_period_end)} - {money(item.amount)}</p>
                </div>
              )) : <p className="p-4 text-sm text-muted-foreground">No history yet.</p>}
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Invoices</p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {detail.invoices.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="px-3 py-2 text-sm flex justify-between gap-2">
                    <span>{invoice.invoice_number}</span>
                    <span className="text-muted-foreground">{money(invoice.total_amount)} - {invoice.status}</span>
                  </div>
                ))}
                {!detail.invoices.length && <p className="p-3 text-sm text-muted-foreground">No invoices.</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Audit Activity</p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {detail.activity.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="px-3 py-2 text-sm">
                    <p className="font-medium">{entry.action.replaceAll('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">{dateLabel(entry.created_at)}</p>
                  </div>
                ))}
                {!detail.activity.length && <p className="p-3 text-sm text-muted-foreground">No subscription activity.</p>}
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function SubscriptionFormDrawer({
  row,
  detail,
  catalog,
  mode,
  onClose,
  onSaved,
}: {
  row: OpsSubscriptionRow | null;
  detail: OpsSubscriptionDetail | null;
  catalog: SubscriptionCatalog | null;
  mode: 'assign' | 'edit';
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const current = detail?.current;
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = addMonths(new Date(), 1);
  const [form, setForm] = useState({
    mode: (current?.plan_id ? 'catalog' : current ? 'custom' : 'catalog') as SubscriptionMode,
    planId: current?.plan_id || '',
    customPlanName: current?.custom_plan_name || '',
    billingCycle: (current?.billing_cycle || 'monthly') as BillingCycle,
    subscriptionSource: (current?.subscription_source || (current ? 'custom' : 'catalog')) as SubscriptionSource,
    currentPeriodStart: dateInput(current?.current_period_start) || today,
    currentPeriodEnd: dateInput(current?.current_period_end) || defaultEnd,
    nextBillingDate: dateInput(current?.next_billing_date) || defaultEnd,
    amount: current?.amount !== undefined && current?.amount !== null ? String(current.amount) : '',
    basePrice: current?.base_price !== undefined && current?.base_price !== null ? String(current.base_price) : '',
    internalNotes: current?.internal_notes || '',
  });
  const [resourceQuantities, setResourceQuantities] = useState<Record<string, string>>(() => {
    const entries = (current?.entitlements?.resources || [])
      .filter((r: any) => r.allocated_quantity !== null && r.allocated_quantity !== undefined)
      .map((r: any) => [r.id, String(r.allocated_quantity)]);
    return Object.fromEntries(entries);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!row || !catalog) return null;

  const activeResources = catalog.resources.filter((resource) => resource.is_active);
  const branchResource = activeResources.find((resource) => resource.slug === 'branches' || resource.slug === 'active-branches');
  const employeeResource = activeResources.find((resource) => resource.slug === 'employees' || resource.slug === 'active-employees');
  const otherResources = activeResources.filter((resource) => resource.id !== branchResource?.id && resource.id !== employeeResource?.id);

  const setResourceQuantity = (resourceId: string, value: string) => {
    setResourceQuantities((quantities) => ({ ...quantities, [resourceId]: value }));
  };

  const submit = async () => {
    if (form.mode === 'catalog' && !form.planId) { setError('Choose a catalog plan'); return; }
    if (form.mode === 'custom' && !form.customPlanName.trim()) { setError('Custom plan name is required'); return; }
    if (form.mode === 'custom' && form.amount === '') { setError('Price is required for custom subscriptions'); return; }
    if (form.amount !== '' && Number(form.amount) < 0) { setError('Price cannot be negative'); return; }
    if (form.basePrice !== '' && Number(form.basePrice) < 0) { setError('Base price cannot be negative'); return; }

    const resources = Object.fromEntries(
      Object.entries(resourceQuantities)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => [key, Number(value)]),
    );
    if (Object.values(resources).some((value) => !Number.isFinite(value) || value < 0)) {
      setError('Resource quantities must be non-negative numbers');
      return;
    }

    const payload: AssignSubscriptionPayload = {
      mode: form.mode,
      planId: form.mode === 'catalog' ? form.planId : undefined,
      customPlanName: form.mode === 'custom' ? form.customPlanName.trim() : undefined,
      billingCycle: form.billingCycle,
      subscriptionSource: form.subscriptionSource,
      currentPeriodStart: new Date(form.currentPeriodStart).toISOString(),
      currentPeriodEnd: new Date(form.currentPeriodEnd).toISOString(),
      nextBillingDate: new Date(form.nextBillingDate).toISOString(),
      amount: form.amount === '' ? undefined : Number(form.amount),
      basePrice: form.basePrice === '' ? undefined : Number(form.basePrice),
      resourceQuantities: resources,
      internalNotes: form.internalNotes.trim() || undefined,
      signupOfferRedemptionId: detail?.offerRedemption?.id,
    };

    setSaving(true);
    setError('');
    try {
      if (mode === 'edit') await updateCurrentOpsSubscription(row.tenant_id, payload);
      else await assignOpsSubscription(row.tenant_id, payload);
      await onSaved();
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to save subscription';
      setError(Array.isArray(message) ? message[0] : message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{mode === 'edit' ? 'Edit Subscription' : 'Assign Subscription'}</h2>
            <p className="text-sm text-muted-foreground">{row.organization_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            {(['catalog', 'custom'] as SubscriptionMode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, mode: value, subscriptionSource: value }))}
                className={`rounded-md px-3 py-2 text-sm font-medium ${form.mode === value ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                {value === 'catalog' ? 'Reusable Plan' : 'One-Off Custom'}
              </button>
            ))}
          </div>

          {form.mode === 'catalog' ? (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Plan</label>
              <select value={form.planId} onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">Select plan</option>
                {catalog.plans.filter((p) => p.is_active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Custom Plan Name</label>
              <Input value={form.customPlanName} onChange={(e) => setForm((f) => ({ ...f, customPlanName: e.target.value }))} placeholder="Enterprise custom bundle" className="mt-1" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Source</label>
              <select value={form.subscriptionSource} onChange={(e) => setForm((f) => ({ ...f, subscriptionSource: e.target.value as SubscriptionSource }))} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                {SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Billing Cycle</label>
              <select value={form.billingCycle} onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value as BillingCycle }))} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ['currentPeriodStart', 'Start'],
              ['currentPeriodEnd', 'End'],
              ['nextBillingDate', 'Next Billing'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="text-xs font-semibold uppercase text-muted-foreground">{label}</label>
                <Input type="date" value={(form as any)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="mt-1" />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Subscription Price</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Price {form.mode === 'custom' && <span className="text-destructive">*</span>}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder={form.mode === 'catalog' ? 'Auto from plan' : '0'}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Base Price</label>
                <Input type="number" min={0} value={form.basePrice} onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))} placeholder="Optional" className="mt-1" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Branch & Employee Limits</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {branchResource ? (
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Branches</label>
                  <Input
                    type="number"
                    min={0}
                    value={resourceQuantities[branchResource.id] || ''}
                    onChange={(e) => setResourceQuantity(branchResource.id, e.target.value)}
                    placeholder="Unlimited if blank"
                    className="mt-1"
                  />
                </div>
              ) : null}
              {employeeResource ? (
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Employees</label>
                  <Input
                    type="number"
                    min={0}
                    value={resourceQuantities[employeeResource.id] || ''}
                    onChange={(e) => setResourceQuantity(employeeResource.id, e.target.value)}
                    placeholder="Unlimited if blank"
                    className="mt-1"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {otherResources.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Additional Limits</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {otherResources.map((resource) => (
                <div key={resource.id}>
                  <label className="text-xs text-muted-foreground">{resource.name}</label>
                  <Input
                    type="number"
                    min={0}
                    value={resourceQuantities[resource.id] || ''}
                    onChange={(e) => setResourceQuantity(resource.id, e.target.value)}
                    placeholder={resource.unit_name}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
          </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Internal Notes</label>
            <textarea value={form.internalNotes} onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm resize-none" />
          </div>
        </div>

        <div className="border-t border-border px-6 py-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </aside>
    </div>
  );
}

function RenewDialog({ detail, onClose, onSaved }: { detail: OpsSubscriptionDetail | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const current = detail?.current;
  const start = current?.current_period_end ? dateInput(current.current_period_end) : new Date().toISOString().slice(0, 10);
  const defaultEnd = addMonths(new Date(start), current?.billing_cycle === 'yearly' ? 12 : 1);
  const [form, setForm] = useState({ start, end: defaultEnd, next: defaultEnd, amount: current?.amount ? String(current.amount) : '', notes: current?.internal_notes || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!detail || !current) return null;

  const submit = async () => {
    setSaving(true); setError('');
    try {
      await renewOpsSubscription(detail.tenant.id, {
        currentPeriodStart: new Date(form.start).toISOString(),
        currentPeriodEnd: new Date(form.end).toISOString(),
        nextBillingDate: new Date(form.next).toISOString(),
        amount: form.amount === '' ? undefined : Number(form.amount),
        internalNotes: form.notes || undefined,
      });
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to renew subscription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><h3 className="font-bold text-lg">Renew Subscription</h3><p className="text-sm text-muted-foreground">{detail.tenant.name}</p></div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {error && <p className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="space-y-3">
          <Input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
          <Input type="date" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
          <Input type="date" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} />
          <Input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount" />
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full rounded-lg border border-border px-3 py-2 text-sm resize-none" placeholder="Internal notes" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Renewing...' : 'Renew'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  const { internalRole } = useAuthStore();
  const canManage = canOps(internalRole, OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS);
  const [summary, setSummary] = useState<any>(null);
  const [rows, setRows] = useState<OpsSubscriptionRow[]>([]);
  const [catalog, setCatalog] = useState<SubscriptionCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', source: '', expiryWindow: '' });
  const [detail, setDetail] = useState<OpsSubscriptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formRow, setFormRow] = useState<OpsSubscriptionRow | null>(null);
  const [formMode, setFormMode] = useState<'assign' | 'edit'>('assign');
  const [renewDetail, setRenewDetail] = useState<OpsSubscriptionDetail | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const [listData, catalogData] = await Promise.all([
        listOpsSubscriptions({ ...filters, source: filters.source || undefined, expiryWindow: filters.expiryWindow || undefined }),
        getOpsSubscriptionCatalog(),
      ]);
      setRows(listData.data);
      setCatalog(catalogData);
      try {
        setSummary(await getOpsSubscriptionSummary());
      } catch (err: any) {
        setSummary(buildSummaryFromRows(listData.data));
        if (err?.response?.status === 404) {
          setActionError('Subscription summary endpoint was not found. The page is using table data for KPIs; restart the backend so the new Operations subscription routes are loaded.');
        } else {
          setActionError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to load subscription summary');
        }
      }
    } catch (err: any) {
      setRows([]);
      setCatalog(null);
      setSummary(buildSummaryFromRows([]));
      setActionError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to load subscription management data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row: OpsSubscriptionRow) => {
    setDetailLoading(true);
    setActionError('');
    try {
      const data = await getOpsSubscriptionDetail(row.tenant_id);
      setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  };

  const openForm = async (row: OpsSubscriptionRow) => {
    if (row.subscription_id) {
      setDetailLoading(true);
      try {
        const data = await getOpsSubscriptionDetail(row.tenant_id);
        setDetail(data);
      } finally {
        setDetailLoading(false);
      }
    }
    setFormRow(row);
    setFormMode(row.subscription_id ? 'edit' : 'assign');
  };

  const reloadDetail = async () => {
    await load();
    if (detail?.tenant?.id) setDetail(await getOpsSubscriptionDetail(detail.tenant.id));
  };

  const handleCancel = async () => {
    if (!detail?.tenant?.id || !confirm(`Cancel subscription for ${detail.tenant.name}?`)) return;
    try {
      await cancelOpsSubscription(detail.tenant.id, 'Cancelled from Operations subscription workspace');
      await reloadDetail();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to cancel subscription');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subscription Management</h1>
          <p className="text-muted-foreground">Manage customer plan assignments, trials, offers, renewals, and custom subscriptions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
        <StatCard icon={CreditCard} label="Active Paid" value={summary?.active_paid || 0} />
        <StatCard icon={FileText} label="Free Plan" value={summary?.free_plan || 0} />
        <StatCard icon={CalendarClock} label="Free Trial" value={summary?.free_trial || 0} />
        <StatCard icon={Tag} label="Signup Offer" value={summary?.signup_offer || 0} />
        <StatCard icon={Pencil} label="Custom" value={summary?.custom || 0} />
        <StatCard icon={RefreshCw} label="Expiring Soon" value={summary?.expiring_soon || 0} />
        <StatCard icon={AlertTriangle} label="Expired" value={summary?.expired || 0} />
      </div>

      <div className="ops-panel p-3 grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search organizations..." className="pl-9" />
        </div>
        <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} className="rounded-lg border border-border px-3 py-2 text-sm">
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
        </select>
        <select value={filters.expiryWindow} onChange={(e) => setFilters((f) => ({ ...f, expiryWindow: e.target.value }))} className="rounded-lg border border-border px-3 py-2 text-sm">
          <option value="">All expiries</option>
          <option value="expiring_soon">Expiring in 30 days</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {actionError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{actionError}</div>}

      <div className="ops-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Offer</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading subscriptions...</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No organizations match the current filters.</TableCell></TableRow>}
            {!loading && rows.map((row) => (
              <TableRow key={row.tenant_id}>
                <TableCell>
                  <p className="font-medium text-foreground">{row.organization_name}</p>
                  <p className="text-xs text-muted-foreground">{row.primary_email || row.slug}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{row.plan_name || row.custom_plan_name || 'Free Plan'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{row.subscription_status || 'none'} {row.billing_cycle ? `- ${row.billing_cycle}` : ''}</p>
                </TableCell>
                <TableCell><span className={sourceBadge(row.effective_source)}>{SOURCE_LABELS[row.effective_source]}</span></TableCell>
                <TableCell>{row.subscription_id ? money(row.amount) : '-'}</TableCell>
                <TableCell>{dateLabel(row.current_period_end || row.trial_ends_at)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.offer_name || row.offer_code || '-'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openDetail(row)} className="p-1.5 rounded-lg hover:bg-muted" title="View details"><Eye className="h-4 w-4" /></button>
                    {canManage && (
                      <button onClick={() => openForm(row)} className="p-1.5 rounded-lg hover:bg-muted" title={row.subscription_id ? 'Edit' : 'Assign'}>
                        {row.subscription_id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {detailLoading && <div className="fixed bottom-4 right-4 z-50 rounded-md border bg-white px-3 py-2 text-sm shadow-lg">Loading subscription details...</div>}
      <DetailDrawer
        detail={detail}
        canManage={canManage}
        onClose={() => setDetail(null)}
        onEdit={() => { if (detail) { setFormRow(rows.find((r) => r.tenant_id === detail.tenant.id) || null); setFormMode('edit'); } }}
        onRenew={() => setRenewDetail(detail)}
        onCancel={handleCancel}
      />
      <SubscriptionFormDrawer
        row={formRow}
        detail={detail?.tenant?.id === formRow?.tenant_id ? detail : null}
        catalog={catalog}
        mode={formMode}
        onClose={() => setFormRow(null)}
        onSaved={async () => { await reloadDetail(); }}
      />
      <RenewDialog detail={renewDetail} onClose={() => setRenewDetail(null)} onSaved={reloadDetail} />
    </div>
  );
}
