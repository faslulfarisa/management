'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import {
  Loader2, X, Plus, Trash2, CheckCircle2, XCircle,
  GitBranch, ChevronDown, ChevronUp, Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCanAny } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { ExportButton } from '@/components/export';
import { ImportButton } from '@/components/import';
import { useAuthStore } from '@/store/auth.store';

interface Branch { id: string; name: string; code: string; }
interface TenantUser { id: string; email: string; name: string; }
interface AdminUser { id: string; email: string; name: string; user_type: string; }
interface ApprovalChain {
  id: string;
  branch_id: string;
  branch_name: string;
  branch_code: string;
  workflow_type: string;
  steps: ApprovalStep[];
  is_active: boolean;
  auto_approve_hours: number | null;
  updated_at: string;
}
// `role` is legacy — older chains may still carry a role-pool step; new steps are
// always assigned to a specific elevated-user approver instead.
interface ApprovalStep { step: number; role?: string; label?: string; approver_id?: string; }

const WORKFLOW_TYPES = [
  { value: 'leave',                label: 'Leave Requests' },
  { value: 'leave_encashment',     label: 'Leave Encashment' },
  { value: 'expense',              label: 'Expense Claims' },
  { value: 'reimbursement',        label: 'Reimbursements' },
  { value: 'transfer',             label: 'Branch Transfers' },
  { value: 'payroll',              label: 'Payroll Runs' },
  { value: 'attendance_correction', label: 'Attendance Corrections' },
  { value: 'overtime',             label: 'Overtime' },
  { value: 'shift_override',       label: 'Shift Changes' },
  { value: 'biometric_device',     label: 'Biometric Device' },
  { value: 'exit_request',         label: 'Exit Requests' },
  { value: 'ff_settlement',        label: 'F&F Settlement' },
  { value: 'compliance_document',  label: 'Compliance Documents' },
  { value: 'vacancy_request',      label: 'Vacancy Requests' },
  { value: 'job_description',      label: 'Job Descriptions' },
  { value: 'offer',                label: 'Offers' },
  { value: 'probation_confirmation', label: 'Probation Confirmation' },
  { value: 'workforce_plan',       label: 'Workforce Plans' },
  { value: 'fine_deduction',       label: 'Fine & Deduction' },
  { value: 'fine_appeal',          label: 'Fine Appeals' },
];

// Legacy role-pool labels — kept only to render older chains created before
// steps were switched to a single named approver.
const LEGACY_ROLE_LABELS: Record<string, string> = {
  branch_manager: 'Branch Manager',
  branch_hr: 'Branch HR',
  branch_admin: 'Branch Admin',
  org_admin: 'Org Admin',
  finance_manager: 'Finance Manager',
  payroll_officer: 'Payroll Officer',
  compliance_officer: 'Compliance Officer',
};

const USER_TYPE_LABELS: Record<string, string> = {
  org_admin: 'Org Admin',
  branch_admin: 'Branch Admin',
  admin: 'Admin',
};

const WF_COLORS: Record<string, string> = {
  leave:                'bg-blue-100 text-blue-700',
  leave_encashment:     'bg-sky-100 text-sky-700',
  expense:              'bg-amber-100 text-amber-700',
  reimbursement:        'bg-purple-100 text-purple-700',
  transfer:             'bg-cyan-100 text-cyan-700',
  payroll:              'bg-emerald-100 text-emerald-700',
  payroll_payment:      'bg-green-100 text-green-700',
  attendance_correction:'bg-orange-100 text-orange-700',
  manual_attendance:    'bg-yellow-100 text-yellow-700',
  overtime:             'bg-lime-100 text-lime-700',
  shift_change:         'bg-teal-100 text-teal-700',
  shift_override:       'bg-teal-100 text-teal-700',
  biometric_device:     'bg-sky-100 text-sky-700',
  onboarding:           'bg-indigo-100 text-indigo-700',
  exit_request:         'bg-red-100 text-red-700',
  exit_clearance:       'bg-rose-100 text-rose-700',
  ff_settlement:        'bg-pink-100 text-pink-700',
  compliance_document:  'bg-slate-200 text-slate-700',
  vacancy_request:      'bg-blue-100 text-blue-700',
  job_description:      'bg-indigo-100 text-indigo-700',
  offer:                'bg-emerald-100 text-emerald-700',
  probation_confirmation:'bg-violet-100 text-violet-700',
  workforce_plan:       'bg-cyan-100 text-cyan-700',
  salary_revision:      'bg-violet-100 text-violet-700',
  role_change:          'bg-fuchsia-100 text-fuchsia-700',
  policy_change:        'bg-slate-200 text-slate-700',
  vendor_approval:      'bg-stone-100 text-stone-700',
  fine_deduction:       'bg-red-100 text-red-700',
  fine_appeal:          'bg-rose-100 text-rose-700',
};

function getApiErrorMessage(error: unknown) {
  const err = error as any;
  const message = err?.response?.data?.message || err?.message;
  return Array.isArray(message) ? message.join(', ') : message || 'Request failed';
}

function StepEditor({
  steps, onChange, adminUsers,
}: {
  steps: ApprovalStep[];
  onChange: (s: ApprovalStep[]) => void;
  adminUsers: AdminUser[];
}) {
  // Auto-select first approver if missing
  useEffect(() => {
    const hasMissing = steps.some(s => !s.approver_id);
    if (hasMissing && adminUsers.length > 0) {
      onChange(steps.map(s => s.approver_id ? s : { ...s, approver_id: adminUsers[0].id }));
    }
  }, [steps, adminUsers, onChange]);

  const addStep = () => {
    const nextStep = steps.length > 0 ? Math.max(...steps.map(s => s.step)) + 1 : 1;
    onChange([...steps, { step: nextStep, approver_id: adminUsers[0]?.id }]);
  };
  const removeStep = (i: number) => onChange(steps.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof ApprovalStep, val: string) => {
    const next = [...steps];
    next[i] = { ...next[i], [field]: val || undefined };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
          {/* Step header */}
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center font-bold shrink-0">
              {s.step}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Step {s.step}</span>
            <button type="button" onClick={() => removeStep(i)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Approver */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Approver <span className="text-red-500">*</span>
            </label>
            <select
              value={s.approver_id ?? adminUsers[0]?.id ?? ''}
              onChange={e => update(i, 'approver_id', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800"
            >
              {adminUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} — {USER_TYPE_LABELS[u.user_type] || u.user_type}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-0.5">
              Only this person can act on this step. List is limited to org/branch admins — regular employees aren't eligible approvers.
            </p>
            {s.role && !s.approver_id && (
              <p className="text-xs text-amber-500 mt-0.5">
                Legacy role-based step (was: {LEGACY_ROLE_LABELS[s.role] || s.role}) — pick an approver above to migrate it.
              </p>
            )}
          </div>

          {/* Custom label */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Display Label <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Department Head Sign-off"
              value={s.label || ''}
              onChange={e => update(i, 'label', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addStep}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mt-1"
      >
        <Plus className="w-4 h-4" /> Add step
      </button>
    </div>
  );
}

function ChainCard({
  chain, onEdit, onToggle, onDelete, users, canManage,
}: {
  chain: ApprovalChain;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  users: TenantUser[];
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const wfMeta = WORKFLOW_TYPES.find(w => w.value === chain.workflow_type);

  return (
    <div className={`border rounded-xl overflow-hidden ${chain.is_active ? 'bg-white' : 'bg-gray-50 opacity-70'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${WF_COLORS[chain.workflow_type] || 'bg-gray-100 text-gray-600'}`}>
          {wfMeta?.label ?? chain.workflow_type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">
            {chain.branch_name} <span className="text-gray-400 font-normal">· {chain.branch_code}</span>
          </p>
          <p className="text-xs text-gray-500">
            {chain.steps.length} step{chain.steps.length !== 1 ? 's' : ''}
            {chain.auto_approve_hours ? ` · auto-approve after ${chain.auto_approve_hours}h` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {chain.is_active
            ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
            : <span className="flex items-center gap-1 text-xs text-gray-400"><XCircle className="w-3.5 h-3.5" /> Inactive</span>
          }
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 hover:bg-gray-100 rounded-lg ml-1">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {canManage && (
            <>
              <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <Settings2 className="w-4 h-4 text-gray-400" />
              </button>
              <button onClick={onToggle} className="p-1.5 hover:bg-gray-100 rounded-lg" title={chain.is_active ? 'Deactivate' : 'Activate'}>
                {chain.is_active
                  ? <XCircle className="w-4 h-4 text-amber-500" />
                  : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              </button>
              <button onClick={onDelete} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </>
          )}
        </div>
      </div>
      {expanded && chain.steps.length > 0 && (
        <div className="px-4 pb-3 border-t bg-gray-50">
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {chain.steps.sort((a, b) => a.step - b.step).map((s, i) => {
              const assignedUser = s.approver_id ? users.find(u => u.id === s.approver_id) : null;
              const title = s.label || assignedUser?.name || (s.role ? (LEGACY_ROLE_LABELS[s.role] || s.role) : 'Unassigned');
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="text-xs bg-white border rounded-xl px-3 py-1.5 text-gray-700 space-y-0.5">
                    <div>
                      Step {s.step}: <strong>{title}</strong>
                    </div>
                    {assignedUser && s.label && (
                      <div className="text-blue-600 text-[11px]">→ {assignedUser.name}</div>
                    )}
                  </div>
                  {i < chain.steps.length - 1 && <span className="text-gray-300">→</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApprovalChainsPage() {
  const hasManagePermission = useCanAny([PERMISSIONS.APPROVALS_MANAGE, PERMISSIONS.PLATFORM_APPROVALS_VIEW]);
  const userType = useAuthStore((s) => s.userType);
  const activeOrganization = useAuthStore((s) => s.activeOrganization);
  const canManage = hasManagePermission || userType === 'org_admin' || activeOrganization?.isOrgAdmin === true;
  const [chains, setChains]       = useState<ApprovalChain[]>([]);
  const [branches, setBranches]   = useState<Branch[]>([]);
  const [users, setUsers]         = useState<TenantUser[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing]     = useState<ApprovalChain | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [loadError, setLoadError] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterWf, setFilterWf]   = useState('');

  const [form, setForm] = useState({
    branch_id:          '',
    workflow_type:      'leave',
    steps:              [] as ApprovalStep[],
    is_active:          true,
    auto_approve_hours: '',
  });

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const requests = {
        chains: api.get('/branch-approval-chains'),
        branches: api.get('/branches'),
        users: api.get('/users/directory?q='),
        admins: api.get('/users/admins'),
      };
      const [chainsRes, branchesRes, usersRes, adminsRes] = await Promise.allSettled(Object.values(requests));
      const failures: string[] = [];

      if (chainsRes.status === 'fulfilled') {
        setChains(chainsRes.value.data.data || []);
      } else {
        failures.push(`approval chains (${getApiErrorMessage(chainsRes.reason)})`);
      }

      if (branchesRes.status === 'fulfilled') {
        setBranches(branchesRes.value.data.data || []);
      } else {
        failures.push(`branches (${getApiErrorMessage(branchesRes.reason)})`);
      }

      if (usersRes.status === 'fulfilled') {
        const rawUsers: any[] = usersRes.value.data.data || [];
        setUsers(rawUsers.map(u => ({
          id: u.id,
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
        })));
      } else {
        failures.push(`user directory (${getApiErrorMessage(usersRes.reason)})`);
      }

      if (adminsRes.status === 'fulfilled') {
        const rawAdmins: any[] = adminsRes.value.data.data || [];
        setAdminUsers(rawAdmins.map(u => ({
          id: u.id,
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
          user_type: u.user_type,
        })));
      } else {
        failures.push(`approver list (${getApiErrorMessage(adminsRes.reason)})`);
      }

      if (failures.length) {
        setLoadError(`Could not load ${failures.join('; ')}.`);
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ branch_id: '', workflow_type: 'leave', steps: [], is_active: true, auto_approve_hours: '' });
    setError('');
    setShowDrawer(true);
  };

  const openEdit = (chain: ApprovalChain) => {
    setEditing(chain);
    setForm({
      branch_id:          chain.branch_id,
      workflow_type:      chain.workflow_type,
      steps:              chain.steps,
      is_active:          chain.is_active,
      auto_approve_hours: chain.auto_approve_hours ? String(chain.auto_approve_hours) : '',
    });
    setError('');
    setShowDrawer(true);
  };

  const handleSave = async () => {
    if (!form.branch_id || !form.workflow_type) { setError('Branch and workflow type are required.'); return; }
    if (form.steps.some(s => !s.approver_id)) { setError('Every approval step needs an approver selected.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/branch-approval-chains', {
        ...form,
        auto_approve_hours: form.auto_approve_hours ? parseInt(form.auto_approve_hours) : null,
      });
      setShowDrawer(false);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save chain');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (chain: ApprovalChain) => {
    try {
      if (chain.is_active) {
        await api.delete(`/branch-approval-chains/${chain.id}`);
      } else {
        await api.patch(`/branch-approval-chains/${chain.id}/activate`);
      }
      load();
    } catch {}
  };

  const handleDelete = async (chain: ApprovalChain) => {
    if (!confirm(`Remove the "${WORKFLOW_TYPES.find(w => w.value === chain.workflow_type)?.label}" chain for ${chain.branch_name}?`)) return;
    await api.delete(`/branch-approval-chains/${chain.id}`);
    load();
  };

  const filtered = chains.filter(c =>
    (!filterBranch || c.branch_id === filterBranch) &&
    (!filterWf     || c.workflow_type === filterWf),
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Chains</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure multi-step approval workflows per branch</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            config={{
              module: 'approval_chains',
              title: 'Approval Chains',
              permission: PERMISSIONS.PLATFORM_APPROVALS_VIEW,
              columns: [
                { key: 'name', header: 'Chain Name' },
                { key: 'target_type', header: 'Target Type' },
                { key: 'is_active', header: 'Active' },
                { key: 'created_at', header: 'Created At', type: 'date' },
              ],
              defaultColumns: ['name', 'target_type', 'is_active', 'created_at'],
              filenamePrefix: 'approval_chains',
            }}
            filters={{ branch_id: filterBranch, workflow_type: filterWf }}
            currentPageData={filtered}
          />
          <ImportButton
            config={{
              module: 'approval_chains',
              title: 'Approval Chains',
              permission: PERMISSIONS.PLATFORM_TEMPLATES_CREATE,
            }}
          />
          <Button
            onClick={openCreate}
            disabled={!canManage}
            title={canManage ? 'Create approval chain' : 'You do not have permission to manage approval chains'}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Chain
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={load} className="font-medium text-red-800 hover:underline shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {WORKFLOW_TYPES.map(wf => {
          const count = chains.filter(c => c.workflow_type === wf.value && c.is_active).length;
          return (
            <Card key={wf.value}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-1">{wf.label}</p>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-400">active chains</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterBranch}
          onChange={e => setFilterBranch(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          value={filterWf}
          onChange={e => setFilterWf(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All workflows</option>
          {WORKFLOW_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>
      </div>

      {/* Chain list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No approval chains configured yet.</p>
          <button
            onClick={openCreate}
            disabled={!canManage}
            className="mt-2 text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
          >
            Create the first one
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(chain => (
            <ChainCard
              key={chain.id}
              chain={chain}
              onEdit={() => openEdit(chain)}
              onToggle={() => handleToggle(chain)}
              onDelete={() => handleDelete(chain)}
              users={users}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowDrawer(false)} />
          <div className="ml-auto relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">
                {editing ? 'Edit Approval Chain' : 'New Approval Chain'}
              </h2>
              <button onClick={() => setShowDrawer(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {error && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Branch *</label>
                <select
                  value={form.branch_id}
                  onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select branch…</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Workflow *</label>
                <select
                  value={form.workflow_type}
                  onChange={e => setForm(f => ({ ...f, workflow_type: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {WORKFLOW_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">One chain per branch + workflow combination (upserts on save).</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Approval Steps</label>
                <StepEditor
                  steps={form.steps}
                  onChange={steps => setForm(f => ({ ...f, steps }))}
                  adminUsers={adminUsers}
                />
                <p className="text-xs text-gray-400 mt-1.5">Leave empty for single-step approval (default behaviour).</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="is_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
              </div>

              {form.is_active && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Auto-approve after (hours)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.auto_approve_hours}
                    onChange={e => setForm(f => ({ ...f, auto_approve_hours: e.target.value }))}
                    placeholder="e.g. 48 — leave blank to disable"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowDrawer(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                {editing ? 'Save Changes' : 'Create Chain'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
