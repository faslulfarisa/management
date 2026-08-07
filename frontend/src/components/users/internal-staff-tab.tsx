'use client';

import { useEffect, useState } from 'react';
import {
  UserPlus, X, Loader2, Check, MoreHorizontal, Pencil, KeyRound, PowerOff, Power,
  Trash2, AlertTriangle, Eye, EyeOff, Users,
} from 'lucide-react';
import {
  listInternalStaff, createInternalStaff, updateInternalStaff, deactivateInternalStaff,
  reactivateInternalStaff, resetInternalStaffPassword, deleteInternalStaff,
  type InternalStaffMember,
} from '@/lib/operations-api';
import {
  INTERNAL_ROLE_LABELS, TEAM_BY_INTERNAL_ROLE, type InternalRole, type InternalTeam,
} from '@/lib/internal-roles';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const TEAMS: { value: InternalTeam; label: string }[] = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'technical', label: 'Technical' },
  { value: 'finance', label: 'Finance' },
  { value: 'customer_success', label: 'Customer Success' },
  { value: 'customer_support', label: 'Customer Support' },
];
const TIERS: { value: 'executive' | 'manager'; label: string }[] = [
  { value: 'executive', label: 'Executive' },
  { value: 'manager', label: 'Manager' },
];

function roleFromTeamTier(team: InternalTeam, tier: 'executive' | 'manager'): InternalRole {
  return `${team}_${tier}` as InternalRole;
}

function tierFromRole(role: InternalRole): 'executive' | 'manager' {
  return role.endsWith('manager') ? 'manager' : 'executive';
}

function fullName(s: InternalStaffMember) {
  return s.full_name?.trim() || s.email;
}

function TeamBadge({ role }: { role: InternalRole }) {
  const team = TEAM_BY_INTERNAL_ROLE[role];
  const colors: Record<InternalTeam, string> = {
    marketing: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/60',
    sales: 'bg-blue-50 text-blue-700 border-blue-200/60',
    technical: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    finance: 'bg-amber-50 text-amber-700 border-amber-200/60',
    customer_success: 'bg-teal-50 text-teal-700 border-teal-200/60',
    customer_support: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    platform: 'bg-violet-50 text-violet-700 border-violet-200/60',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colors[team]}`}>
      {INTERNAL_ROLE_LABELS[role]}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200/60">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" /> Inactive
    </span>
  );
}

/* ─── Create modal ───────────────────────────────────────────────────────── */

function CreateStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [fullNameInput, setFullNameInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [team, setTeam] = useState<InternalTeam>('sales');
  const [tier, setTier] = useState<'executive' | 'manager'>('executive');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    if (!password || password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true); setError('');
    try {
      await createInternalStaff({ email: email.trim(), password, fullName: fullNameInput.trim() || undefined, internalRole: roleFromTeamTier(team, tier) });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to create staff account');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Add Internal Staff</h2>
            <p className="text-xs text-muted-foreground">Provision an AI-HRMS Platform staff account</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Full Name</label>
            <input
              value={fullNameInput}
              onChange={(e) => setFullNameInput(e.target.value)}
              placeholder="Priya Sharma"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="priya@company.com"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Team</label>
            <div className="grid grid-cols-3 gap-2">
              {TEAMS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTeam(t.value)}
                  className={`px-3 py-2 text-sm rounded-xl border transition-colors ${team === t.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-foreground hover:bg-muted'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Tier</label>
            <div className="grid grid-cols-2 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTier(t.value)}
                  className={`px-3 py-2 text-sm rounded-xl border transition-colors ${tier === t.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-foreground hover:bg-muted'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Edit role modal ────────────────────────────────────────────────────── */

function EditStaffModal({ staff, onClose, onSaved }: { staff: InternalStaffMember; onClose: () => void; onSaved: () => void }) {
  const [fullNameInput, setFullNameInput] = useState(staff.full_name || '');
  const [team, setTeam] = useState<InternalTeam>(TEAM_BY_INTERNAL_ROLE[staff.internal_role]);
  const [tier, setTier] = useState<'executive' | 'manager'>(tierFromRole(staff.internal_role));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await updateInternalStaff(staff.id, { fullName: fullNameInput.trim() || undefined, internalRole: roleFromTeamTier(team, tier) });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to update');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Edit Internal Staff</h2>
            <p className="text-xs text-muted-foreground">{staff.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Full Name</label>
            <input
              value={fullNameInput}
              onChange={(e) => setFullNameInput(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Team</label>
            <div className="grid grid-cols-3 gap-2">
              {TEAMS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTeam(t.value)}
                  className={`px-3 py-2 text-sm rounded-xl border transition-colors ${team === t.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-foreground hover:bg-muted'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Tier</label>
            <div className="grid grid-cols-2 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTier(t.value)}
                  className={`px-3 py-2 text-sm rounded-xl border transition-colors ${tier === t.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-foreground hover:bg-muted'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Reset password modal ───────────────────────────────────────────────── */

function ResetStaffPasswordModal({ staff, onClose }: { staff: InternalStaffMember; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const save = async () => {
    if (!password || password.length < 8) { setError('Minimum 8 characters'); return; }
    setSaving(true); setError('');
    try {
      await resetInternalStaffPassword(staff.id, password);
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to reset password');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Reset Password</h2>
            <p className="text-xs text-muted-foreground">{fullName(staff)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-foreground">Password reset successfully</p>
            </div>
          ) : (
            <>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Reset Password
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Delete confirm modal ───────────────────────────────────────────────── */

function DeleteStaffModal({ staff, onClose, onDeleted }: { staff: InternalStaffMember; onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const canConfirm = confirmText.trim() === 'DELETE';

  const confirmDelete = async () => {
    if (!canConfirm) return;
    setDeleting(true); setError('');
    try {
      await deleteInternalStaff(staff.id);
      onDeleted(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to delete');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Delete Internal Staff Account</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-relaxed">This action cannot be undone.</p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
          <p className="text-sm text-foreground">{fullName(staff)} <span className="text-muted-foreground">({staff.email})</span></p>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Type <span className="font-semibold text-foreground">DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 bg-background"
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={confirmDelete}
            disabled={!canConfirm || deleting}
            className="flex items-center gap-2 bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Row actions ────────────────────────────────────────────────────────── */

function RowActions({
  staff, onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: {
  staff: InternalStaffMember;
  onEdit: () => void;
  onResetPassword: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden py-1">
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-muted/60 transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => { setOpen(false); onResetPassword(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-muted/60 transition-colors">
              <KeyRound className="w-3.5 h-3.5" /> Reset Password
            </button>
            <div className="my-1 border-t border-border/60" />
            {staff.is_active ? (
              <button onClick={() => { setOpen(false); onDeactivate(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors">
                <PowerOff className="w-3.5 h-3.5" /> Deactivate
              </button>
            ) : (
              <>
                <button onClick={() => { setOpen(false); onReactivate(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors">
                  <Power className="w-3.5 h-3.5" /> Reactivate
                </button>
                <div className="my-1 border-t border-border/60" />
                <button onClick={() => { setOpen(false); onDelete(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Tab ─────────────────────────────────────────────────────────────────── */

export function InternalStaffTab({ onCountChange }: { onCountChange?: (count: number) => void } = {}) {
  const [staff, setStaff] = useState<InternalStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editStaff, setEditStaff] = useState<InternalStaffMember | null>(null);
  const [resetStaff, setResetStaff] = useState<InternalStaffMember | null>(null);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<InternalStaffMember | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await listInternalStaff();
      setStaff(result);
      onCountChange?.(result.length);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDeactivate = async (s: InternalStaffMember) => { await deactivateInternalStaff(s.id); load(); };
  const handleReactivate = async (s: InternalStaffMember) => { await reactivateInternalStaff(s.id); load(); };

  return (
    <div className="space-y-3">
      {showCreate && <CreateStaffModal onClose={() => setShowCreate(false)} onSaved={load} />}
      {editStaff && <EditStaffModal staff={editStaff} onClose={() => setEditStaff(null)} onSaved={load} />}
      {resetStaff && <ResetStaffPasswordModal staff={resetStaff} onClose={() => setResetStaff(null)} />}
      {deleteStaffTarget && <DeleteStaffModal staff={deleteStaffTarget} onClose={() => setDeleteStaffTarget(null)} onDeleted={load} />}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Marketing, Sales, Technical, Finance, Customer Success, and Customer Support accounts that use the separate AI-HRMS Platform Portal (<code>/operations</code>) instead of the customer dashboard.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
        >
          <UserPlus className="w-4 h-4" /> Add Internal Staff
        </button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-background">
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</TableHead>
              <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</TableHead>
              <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Team / Tier</TableHead>
              <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</TableHead>
              <TableHead className="py-3 px-3 w-12" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">No internal staff yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Add a Platform staff account to get started</p>
                    <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
                      <UserPlus className="w-4 h-4" /> Add Internal Staff
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              staff.map((s) => (
                <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="py-3.5 px-3 font-medium text-foreground">{fullName(s)}</TableCell>
                  <TableCell className="py-3.5 px-3 text-muted-foreground">{s.email}</TableCell>
                  <TableCell className="py-3.5 px-3"><TeamBadge role={s.internal_role} /></TableCell>
                  <TableCell className="py-3.5 px-3"><StatusBadge isActive={s.is_active} /></TableCell>
                  <TableCell className="py-3.5 px-3">
                    <RowActions
                      staff={s}
                      onEdit={() => setEditStaff(s)}
                      onResetPassword={() => setResetStaff(s)}
                      onDeactivate={() => handleDeactivate(s)}
                      onReactivate={() => handleReactivate(s)}
                      onDelete={() => setDeleteStaffTarget(s)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
