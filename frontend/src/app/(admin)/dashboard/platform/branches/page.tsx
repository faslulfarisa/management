'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
  Loader2, X, Pencil, Trash2, GitBranch,
  Building2, Users, CheckCircle2,
  ShieldCheck, UserPlus, ChevronDown,
  PowerOff, RotateCcw, AlertTriangle,
  Lock, Unlock, Circle, Sparkles, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteWarningModal } from '@/components/ui/delete-warning-modal';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import { profileApi, type OrganizationProfile } from '@/lib/company-profile-api';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ExportButton } from '@/components/export';
import { ImportButton } from '@/components/import';
import { PERMISSIONS } from '@/lib/permissions';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';

type ActivationStatus = 'active' | 'inactive' | 'locked_by_plan';

interface Branch {
  id: string;
  name: string;
  code: string;
  display_name: string | null;
  branch_type: string;
  status: string;
  is_active: boolean;
  is_default: boolean;
  activation_status: ActivationStatus;
  timezone: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: Record<string, any> | null;
  parent_branch_id: string | null;
  parent_branch_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  department_count: number;
  employee_count: number;
  device_count: number;
}

const BRANCH_TYPES = ['main', 'regional', 'satellite', 'franchise', 'warehouse', 'admin'];
const STATUSES = ['active', 'inactive', 'under_construction', 'closed'];
const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles',
  'UTC',
];

const BRANCH_ACCESS_ROLES = ['branch_admin', 'branch_manager', 'branch_hr', 'viewer'];

const ROLE_COLORS: Record<string, string> = {
  branch_admin: 'bg-red-100 text-red-700',
  branch_manager: 'bg-blue-100 text-blue-700',
  branch_hr: 'bg-purple-100 text-purple-700',
  viewer: 'bg-gray-100 text-gray-600',
};

const TYPE_COLORS: Record<string, string> = {
  main: 'bg-blue-100 text-blue-700',
  regional: 'bg-purple-100 text-purple-700',
  satellite: 'bg-cyan-100 text-cyan-700',
  franchise: 'bg-orange-100 text-orange-700',
  warehouse: 'bg-yellow-100 text-yellow-700',
  admin: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-500',
  under_construction: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-600',
};

const ACTIVATION_BADGES: Record<ActivationStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-500', icon: Circle },
  locked_by_plan: { label: 'Locked by Plan', className: 'bg-amber-100 text-amber-700', icon: Lock },
};

const UPGRADE_FEATURES = [
  'Activate multiple branches',
  'Manage branch-wise employees',
  'Branch-specific attendance',
  'Branch-specific payroll',
  'Multi-branch reporting',
];

interface BranchAccess {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  employee_code: string | null;
  role: string;
  granted_by_name: string | null;
  created_at: string;
}

function BranchAccessModal({
  branch,
  onClose,
}: {
  branch: Branch;
  onClose: () => void;
}) {
  const [accessList, setAccessList] = useState<BranchAccess[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ user_id: '', role: 'viewer' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/branches/${branch.id}/access`),
      api.get('/users?limit=500'),
    ]).then(([aRes, uRes]) => {
      setAccessList(aRes.data.data || []);
      setUsers(uRes.data.data || []);
    }).catch(() => { }).finally(() => setLoading(false));
  }, [branch.id]);

  const grant = async () => {
    if (!form.user_id) { setError('Select a user'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/branches/${branch.id}/access`, form);
      const res = await api.get(`/branches/${branch.id}/access`);
      setAccessList(res.data.data || []);
      setForm({ user_id: '', role: 'viewer' });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to grant access');
    } finally { setSaving(false); }
  };

  const revoke = async (userId: string) => {
    try {
      await api.delete(`/branches/${branch.id}/access/${userId}`);
      setAccessList(prev => prev.filter(a => a.user_id !== userId));
    } catch { /* no-op */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Branch Access — {branch.name}
            </h2>
            <p className="text-xs text-muted-foreground">Manage user roles for this branch</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="bg-muted/40 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grant Access</p>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-1 border border-border rounded-xl px-2 bg-white">
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <select
                  value={form.user_id}
                  onChange={e => setForm(prev => ({ ...prev, user_id: e.target.value }))}
                  className="flex-1 py-2 text-sm bg-transparent focus:outline-none"
                >
                  <option value="">— Select User —</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 border border-border rounded-xl px-2 bg-white">
                <select
                  value={form.role}
                  onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                  className="py-2 text-sm bg-transparent focus:outline-none"
                >
                  {BRANCH_ACCESS_ROLES.map(r => (
                    <option key={r} value={r}>{r.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={grant}
                disabled={saving}
                className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Current Access ({accessList.length})
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : accessList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No users have branch access yet</p>
            ) : (
              <div className="space-y-2">
                {accessList.map(a => (
                  <div key={a.user_id} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{a.user_name}</p>
                      <p className="text-xs text-muted-foreground">{a.user_email}{a.employee_code ? ` · ${a.employee_code}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[a.role] || 'bg-gray-100 text-gray-600'}`}>
                        {a.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      <button
                        onClick={() => revoke(a.user_id)}
                        className="p-1 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                        title="Revoke access"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BranchDrawer({
  branch,
  branches,
  canCreate,
  planName,
  maxActiveBranches,
  onClose,
  onSaved,
}: {
  branch: Branch | null;
  branches: Branch[];
  canCreate: boolean;
  planName: string;
  maxActiveBranches: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const blockedByPlan = !branch && !canCreate;
  const [form, setForm] = useState({
    name: branch?.name || '',
    code: branch?.code || '',
    display_name: branch?.display_name || '',
    branch_type: branch?.branch_type || 'main',
    status: branch?.status || 'active',
    timezone: branch?.timezone || 'Asia/Kolkata',
    phone: branch?.phone || '',
    email: branch?.email || '',
    gstin: branch?.gstin || '',
    parent_branch_id: branch?.parent_branch_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [sameAsOrg, setSameAsOrg] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [orgProfile, setOrgProfile] = useState<OrganizationProfile | null>(null);
  const [preOrgSnapshot, setPreOrgSnapshot] = useState<typeof form | null>(null);

  const f = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleSameAsOrg = async (checked: boolean) => {
    setSameAsOrg(checked);
    if (!checked) {
      if (preOrgSnapshot) {
        setForm(preOrgSnapshot);
        setPreOrgSnapshot(null);
      }
      return;
    }
    setPreOrgSnapshot(form);
    setLoadingOrg(true);
    try {
      const profile = orgProfile || await profileApi.get();
      if (!orgProfile) setOrgProfile(profile);
      setForm(prev => ({
        ...prev,
        timezone: profile.timezone || prev.timezone,
        phone: profile.phone_number || prev.phone,
        email: profile.primary_email || prev.email,
        gstin: profile.gstin || prev.gstin,
      }));
    } catch {
      setError('Failed to load organization data');
      setSameAsOrg(false);
    } finally {
      setLoadingOrg(false);
    }
  };

  const save = async () => {
    if (blockedByPlan) return;
    if (!form.name.trim()) { setError('Branch name is required'); return; }
    if (!form.code.trim()) { setError('Branch code is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        parent_branch_id: form.parent_branch_id || null,
        display_name: form.display_name || null,
        phone: form.phone || null,
        email: form.email || null,
        gstin: form.gstin || null,
      };
      if (branch) {
        await api.put(`/branches/${branch.id}`, payload);
      } else {
        await api.post('/branches', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, required = false) => (
    <label className="text-xs font-medium text-muted-foreground block mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  );

  const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold">{branch ? 'Edit Branch' : 'New Branch'}</h2>
            <p className="text-xs text-muted-foreground">
              {branch ? 'Update branch details' : 'Add a new operational branch'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {blockedByPlan && (
            <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm font-semibold text-foreground">Upgrade to add more branches</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Your {planName} allows up to {maxActiveBranches ?? 1} branch{maxActiveBranches === 1 ? '' : 'es'}.
                Upgrade your subscription to create additional branches.
              </p>
              <Button
                size="sm"
                onClick={() => router.push('/dashboard/system/settings/saas-billing')}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Upgrade Plan
              </Button>
            </div>
          )}

          {error && !error.toLowerCase().includes('code') && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          {!branch && (
            <label className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={sameAsOrg}
                onChange={e => toggleSameAsOrg(e.target.checked)}
                className="rounded"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Same as Organization</p>
                <p className="text-xs text-muted-foreground">Prefill timezone, phone, email &amp; GSTIN from your organization profile </p>
              </div>
              {loadingOrg && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              {field('Branch Name', true)}
              <input value={form.name} onChange={e => f('name', e.target.value)}
                placeholder="e.g. Mumbai Main" className={inputCls} />
            </div>
            <div>
              {field('Branch Code', true)}
              <input value={form.code} onChange={e => { f('code', e.target.value.toUpperCase()); setError(''); }}
                placeholder="e.g. MUM-01"
                className={error.toLowerCase().includes('code') ? inputCls.replace('border-border', 'border-red-400') + ' focus:ring-red-400/30' : inputCls} />
              {error.toLowerCase().includes('code') && (
                <p className="text-xs text-red-500 mt-1">{error}</p>
              )}
            </div>
          </div>

          <div>
            {field('Display Name')}
            <input value={form.display_name} onChange={e => f('display_name', e.target.value)}
              placeholder="Short label for dashboards" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              {field('Branch Type')}
              <select value={form.branch_type} onChange={e => f('branch_type', e.target.value)} className={inputCls}>
                {BRANCH_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              {field('Status')}
              <select value={form.status} onChange={e => f('status', e.target.value)} className={inputCls}>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            {field('Timezone')}
            <select value={form.timezone} onChange={e => f('timezone', e.target.value)} className={inputCls}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              {field('Phone')}
              <PhoneNumberInput value={form.phone} onChange={value => f('phone', value)} />
            </div>
            <div>
              {field('Email')}
              <input value={form.email} onChange={e => f('email', e.target.value)}
                placeholder="branch@company.com" type="email" className={inputCls} />
            </div>
          </div>

          <div>
            {field('GSTIN')}
            <input value={form.gstin} onChange={e => f('gstin', e.target.value)}
              placeholder="e.g. 27AAPFU0939F1ZV" className={inputCls} />
          </div>

          <div>
            {field('Parent Branch')}
            <select value={form.parent_branch_id} onChange={e => f('parent_branch_id', e.target.value)} className={inputCls}>
              <option value="">— None (top level) —</option>
              {branches.filter(b => b.id !== branch?.id).map(b => (
                <option key={b.id} value={b.id}>{b.code} – {b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button onClick={save} disabled={saving || blockedByPlan} title={blockedByPlan ? 'Upgrade your subscription to add more branches' : undefined}
            className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
            {branch ? 'Update' : 'Create Branch'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HierarchyNode({ branch, allBranches, depth = 0 }: { branch: Branch; allBranches: Branch[]; depth?: number }) {
  const children = allBranches.filter(b => b.parent_branch_id === branch.id);
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div className={`flex items-center gap-2 py-1.5 group ${!branch.is_active ? 'opacity-50' : ''}`}>
        {children.length > 0 ? (
          <button onClick={() => setOpen(o => !o)} className="w-5 h-5 flex items-center justify-center shrink-0">
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
        ) : (
          <span className="w-5 h-5 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </span>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[branch.branch_type] || 'bg-gray-100 text-gray-600'}`}>
            <GitBranch className="w-3 h-3" />
            {branch.branch_type}
          </span>
          <span className="text-sm font-medium text-gray-900">{branch.name}</span>
          <span className="text-xs text-gray-400">({branch.code})</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[branch.status] || 'bg-gray-100 text-gray-500'}`}>
            {branch.status.replace('_', ' ')}
          </span>
          {!branch.is_active && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">deactivated</span>
          )}
          <span className="text-xs text-gray-400">
            {Number(branch.employee_count || 0)} emp · {Number(branch.department_count || 0)} dept
          </span>
        </div>
      </div>
      {open && children.map(c => (
        <HierarchyNode key={c.id} branch={c} allBranches={allBranches} depth={depth + 1} />
      ))}
    </div>
  );
}

function HierarchyView({ branches }: { branches: Branch[] }) {
  const roots = branches.filter(b => !b.parent_branch_id);
  if (roots.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No branch hierarchy configured yet. Set a parent branch to build the tree.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border rounded-xl px-5 py-4">
      <p className="text-xs text-gray-400 mb-4 font-medium uppercase tracking-wide">Organisation → Branch hierarchy</p>
      {roots.map(r => (
        <HierarchyNode key={r.id} branch={r} allBranches={branches} />
      ))}
    </div>
  );
}

function UpgradeBranchModal({
  branch, maxActiveBranches, planName, onClose,
}: {
  branch: Branch;
  maxActiveBranches: number | null;
  planName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Unlock Multiple Branches</h3>
            <p className="text-xs text-muted-foreground">Subscription upgrade required</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-3">
          Your {planName} allows only {maxActiveBranches ?? 1} active branch{maxActiveBranches === 1 ? '' : 'es'}.
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          <span className="font-semibold text-foreground">{branch.name}</span> has been created
          successfully, but activation of additional branches requires a higher-tier subscription.
        </p>

        <div className="bg-muted/40 border border-border rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-foreground mb-2">Upgrade your subscription to:</p>
          <ul className="space-y-1.5">
            {UPGRADE_FEATURES.map(feat => (
              <li key={feat} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                {feat}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            onClick={() => router.push('/dashboard/system/settings/saas-billing')}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Upgrade Plan
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDrawer, setShowDrawer] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // action modals
  const [deactivateBranch, setDeactivateBranch] = useState<Branch | null>(null);
  const [hardDeleteBranch, setHardDeleteBranch] = useState<Branch | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [hardDeleting, setHardDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const [accessBranch, setAccessBranch] = useState<Branch | null>(null);
  const [tab, setTab] = useState<'list' | 'hierarchy'>('list');

  // plan-based activation
  const [planLimits, setPlanLimits] = useState<{ maxActiveBranches: number | null; activeBranchCount: number; totalBranchCount: number; planName: string; canCreateBranch: boolean }>({ maxActiveBranches: null, activeBranchCount: 0, totalBranchCount: 0, planName: 'Free Plan', canCreateBranch: true });
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [upgradeBranch, setUpgradeBranch] = useState<Branch | null>(null);

  const router = useRouter();
  const depCheck = useDependencyCheck();

  useEffect(() => { fetchBranches(); }, []);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const res = await api.get('/branches');
      setBranches(res.data.data || []);
      setPlanLimits({
        maxActiveBranches: res.data.meta?.max_active_branches ?? null,
        activeBranchCount: res.data.meta?.active_branch_count ?? 0,
        totalBranchCount: res.data.meta?.total_branch_count ?? 0,
        planName: res.data.meta?.plan_name || 'Free Plan',
        canCreateBranch: res.data.meta?.can_create_branch ?? true,
      });
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (branch: Branch) => {
    setActivatingId(branch.id);
    setActionError('');
    try {
      await api.post(`/branches/${branch.id}/activate`);
      fetchBranches();
    } catch (err: any) {
      const body = err.response?.data;
      if (body?.code === 'BRANCH_ACTIVATION_LIMIT_REACHED') {
        setUpgradeBranch(branch);
      } else {
        setActionError(typeof body?.message === 'string' ? body.message : 'Failed to activate branch');
      }
    } finally {
      setActivatingId(null);
    }
  };

  const handleDeactivatePlanSlot = async (branch: Branch) => {
    setActivatingId(branch.id);
    setActionError('');
    try {
      await api.post(`/branches/${branch.id}/deactivate`);
      fetchBranches();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to deactivate branch slot');
    } finally {
      setActivatingId(null);
    }
  };

  const handleReactivate = async (branch: Branch) => {
    setActivatingId(branch.id);
    setActionError('');
    try {
      await api.put(`/branches/${branch.id}`, { is_active: true, status: 'active' });
      fetchBranches();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to reactivate branch');
    } finally {
      setActivatingId(null);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateBranch) return;
    setDeactivating(true);
    setActionError('');
    try {
      await api.delete(`/branches/${deactivateBranch.id}`);
      setDeactivateBranch(null);
      fetchBranches();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to deactivate branch');
    } finally {
      setDeactivating(false);
    }
  };

  const handleHardDelete = async () => {
    if (!hardDeleteBranch) return;
    setHardDeleting(true);
    setActionError('');
    try {
      await api.delete(`/branches/${hardDeleteBranch.id}/permanent`);
      setHardDeleteBranch(null);
      fetchBranches();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to permanently delete branch');
    } finally {
      setHardDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = branches.filter(b => {
    // Branches locked by the plan stay visible by default (alongside active
    // ones) so the upgrade indicator is always shown; manually deactivated
    // branches are tucked behind "Show Deactivated".
    if (showInactive ? (b.is_active || b.activation_status === 'locked_by_plan') : (!b.is_active && b.activation_status !== 'locked_by_plan')) return false;
    return (
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase()) ||
      (b.branch_type || '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const activeBranches = branches.filter(b => b.is_active).length;
  const inactiveBranches = branches.filter(b => !b.is_active).length;
  const totalEmployees = branches.filter(b => b.is_active).reduce((s, b) => s + Number(b.employee_count || 0), 0);
  const totalDepartments = branches.filter(b => b.is_active).reduce((s, b) => s + Number(b.department_count || 0), 0);

  return (
    <>
      {showDrawer && (
        <BranchDrawer
          branch={editBranch}
          branches={branches}
          canCreate={planLimits.canCreateBranch}
          planName={planLimits.planName}
          maxActiveBranches={planLimits.maxActiveBranches}
          onClose={() => { setShowDrawer(false); setEditBranch(null); }}
          onSaved={fetchBranches}
        />
      )}
      {accessBranch && (
        <BranchAccessModal branch={accessBranch} onClose={() => setAccessBranch(null)} />
      )}

      <div className="animate-fade-in">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Branches</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage operational branches — departments and employees are scoped to a branch
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 mr-2">
              <button
                onClick={() => setTab('list')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                List
              </button>
              <button
                onClick={() => setTab('hierarchy')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'hierarchy' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Hierarchy
              </button>
            </div>
            <ExportButton
              config={{
                module: 'branches',
                title: 'Branches',
                permission: PERMISSIONS.PLATFORM_BRANCHES_VIEW,
                columns: [
                  { key: 'name', header: 'Branch Name' },
                  { key: 'code', header: 'Branch Code' },
                  { key: 'area_name', header: 'Area' },
                  { key: 'is_active', header: 'Active' },
                  { key: 'address', header: 'Address' },
                  { key: 'contact_number', header: 'Contact' },
                  { key: 'contact_email', header: 'Email' },
                  { key: 'created_at', header: 'Created At', type: 'date' },
                ],
                defaultColumns: ['name', 'code', 'area_name', 'is_active', 'address'],
                filenamePrefix: 'branches',
              }}
              filters={{ search, is_active: showInactive ? undefined : true }}
              currentPageData={branches}
            />
            <ImportButton
              config={{
                module: 'branches',
                title: 'Branches',
                permission: PERMISSIONS.PLATFORM_ORGANIZATIONS_CREATE,
              }}
            />
            <Button onClick={() => { setEditBranch(null); setShowDrawer(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Add Branch
            </Button>
          </div>
        </div>

        {/* Plan-based activation usage */}
        {planLimits.maxActiveBranches !== null && (() => {
          const atLimit = planLimits.activeBranchCount >= planLimits.maxActiveBranches;
          return (
            <div className={`mb-6 rounded-xl border px-5 py-3.5 flex items-center justify-between flex-wrap gap-3 ${atLimit
                ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50'
                : 'border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50'
              }`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0">
                  {atLimit
                    ? <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
                    : <Unlock className="w-4.5 h-4.5 text-indigo-600" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {planLimits.activeBranchCount} of {planLimits.maxActiveBranches} active branch{planLimits.maxActiveBranches === 1 ? '' : 'es'} used
                    <span className="font-normal text-muted-foreground"> · {planLimits.planName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {atLimit
                      ? `You've reached your ${planLimits.planName} limit — upgrade to activate more branches`
                      : `${planLimits.maxActiveBranches - planLimits.activeBranchCount} more branch${planLimits.maxActiveBranches - planLimits.activeBranchCount === 1 ? '' : 'es'} can be activated on your current plan`
                    }
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={atLimit ? 'default' : 'outline'}
                onClick={() => router.push('/dashboard/system/settings/saas-billing')}
                className={atLimit ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white' : ''}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {atLimit ? 'Upgrade Plan' : 'Manage Plan'}
              </Button>
            </div>
          );
        })()}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-blue text-white">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeBranches}</p>
                <p className="text-xs text-muted-foreground">Active Branches</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 text-gray-500">
                <PowerOff className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inactiveBranches}</p>
                <p className="text-xs text-muted-foreground">Deactivated</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-amber text-white">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDepartments}</p>
                <p className="text-xs text-muted-foreground">Departments</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-purple text-white">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEmployees}</p>
                <p className="text-xs text-muted-foreground">Active Employees</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {tab === 'hierarchy' && <HierarchyView branches={branches} />}

        {actionError && !deactivateBranch && (
          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <span>{actionError}</span>
            <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {tab === 'list' && (
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search branches..."
                  className="w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {/* Show inactive toggle */}
              <button
                onClick={() => setShowInactive(v => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${showInactive
                    ? 'bg-gray-100 border-gray-300 text-gray-700'
                    : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
              >
                <PowerOff className="w-3.5 h-3.5" />
                {showInactive ? 'Hide Deactivated' : 'Show Deactivated'}
                {inactiveBranches > 0 && (
                  <span className="ml-0.5 bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                    {inactiveBranches}
                  </span>
                )}
              </button>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-muted/40">
                  <TableHead className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(b => b.id)))}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch Name</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activation</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parent</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Departments</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employees</TableHead>
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manager</TableHead>
                  <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-16">
                      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Loading branches...</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-16">
                      <GitBranch className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {search ? 'No branches match your search' : 'No branches found'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b, idx) => (
                    <TableRow
                      key={b.id}
                      className={`transition-colors ${b.is_active ? 'hover:bg-muted/30' : 'bg-gray-50/60 opacity-70 hover:opacity-100 hover:bg-gray-100/60'}`}
                      style={{ animation: `slideUp 0.3s ease ${idx * 0.03}s both` }}
                    >
                      <TableCell className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={`text-sm font-medium ${b.is_active ? 'text-primary' : 'text-muted-foreground'}`}>{b.code}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm font-medium ${b.is_active ? 'text-foreground' : 'text-muted-foreground line-through decoration-gray-400'}`}>{b.name}</p>
                          {b.is_default && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Default</span>
                          )}
                        </div>
                        {b.display_name && (
                          <p className="text-xs text-muted-foreground">{b.display_name}</p>
                        )}
                        {!b.is_active && (
                          <p className="text-[10px] text-gray-400 font-medium mt-0.5 no-underline" style={{ textDecoration: 'none' }}>Deactivated</p>
                        )}
                        {b.activation_status !== 'active' && (
                          <p className="text-[10px] text-amber-600 font-medium mt-0.5">Branch will become operational after activation</p>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[b.branch_type] || 'bg-gray-100 text-gray-600'}`}>
                          {b.branch_type}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-500'}`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {(() => {
                          const badge = ACTIVATION_BADGES[b.activation_status];
                          const Icon = badge.icon;
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                              <Icon className="w-3 h-3" />
                              {badge.label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {b.parent_branch_name || '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-foreground">
                        {Number(b.department_count || 0)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-foreground">
                        {Number(b.employee_count || 0)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {b.manager_name?.trim() || '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setAccessBranch(b)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-all"
                            title="Manage Access"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setEditBranch(b); setShowDrawer(true); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {b.is_active ? (
                            /* Active → deactivate */
                            <button
                              onClick={() => { setActionError(''); setDeactivateBranch(b); }}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-all"
                              title="Deactivate branch"
                            >
                              <PowerOff className="w-4 h-4" />
                            </button>
                          ) : (
                            /* Inactive / locked by plan → activate + permanent delete */
                            <>
                              <button
                                onClick={() => handleActivate(b)}
                                disabled={activatingId === b.id}
                                className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${b.activation_status === 'locked_by_plan'
                                    ? 'hover:bg-amber-50 text-amber-500 hover:text-amber-600'
                                    : 'hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600'
                                  }`}
                                title={b.activation_status === 'locked_by_plan' ? 'Locked by your plan — click to upgrade' : 'Activate branch'}
                              >
                                {activatingId === b.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <RotateCcw className="w-4 h-4" />
                                }
                              </button>
                              <button
                                onClick={() => { setActionError(''); setHardDeleteBranch(b); depCheck.check('branch', b.id); }}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                title="Permanently delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Deactivate confirmation */}
      {deactivateBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50">
                <PowerOff className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Deactivate Branch</h3>
                <p className="text-xs text-muted-foreground">The branch will be marked inactive</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Are you sure you want to deactivate{' '}
              <span className="font-semibold text-foreground">{deactivateBranch.name}</span>?
            </p>
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-5">
              Departments and employees linked to this branch will not be affected. You can reactivate the branch at any time, or permanently delete it once deactivated.
            </p>
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{actionError}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setDeactivateBranch(null)}>Cancel</Button>
              <Button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {deactivating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Deactivating...</> : 'Deactivate'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent delete — dependency-aware warning */}
      {hardDeleteBranch && (
        <DeleteWarningModal
          entityType="branch"
          entityLabel="Branch"
          isLoading={depCheck.isLoading}
          report={depCheck.report}
          onCancel={() => { setHardDeleteBranch(null); depCheck.clear(); }}
          onConfirmDelete={handleHardDelete}
          isDeleting={hardDeleting}
        />
      )}

      {/* Subscription upgrade prompt — shown when activation hits the plan limit */}
      {upgradeBranch && (
        <UpgradeBranchModal
          branch={upgradeBranch}
          maxActiveBranches={planLimits.maxActiveBranches}
          planName={planLimits.planName}
          onClose={() => setUpgradeBranch(null)}
        />
      )}
    </>
  );
}
