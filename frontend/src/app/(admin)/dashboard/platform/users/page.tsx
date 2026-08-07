'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import {
  X, Loader2, ShieldCheck, UserPlus, Search,
  MoreHorizontal, Users, Eye, Pencil, KeyRound,
  Trash2, Download, Power, PowerOff, Shield,
  CheckCircle2, XCircle, RefreshCw, ChevronDown,
  EyeOff, Check, Clock, Mail, Phone, Calendar,
  AlertTriangle, Upload, Lock, Unlock, UserX, UserCheck, History,
  ArrowLeftRight,
} from 'lucide-react';
import { CreateUserDrawer } from '@/components/users/create-user-drawer';
import { exportReportCsv } from '@/lib/report-export';
import { UserTypeBadge, ScopeCell, type ScopeSummary } from '@/components/users/user-type-badge';
import UserBulkImportDrawer from '@/components/users/user-bulk-import-drawer';
import { ALL_USER_TYPES, USER_TYPE_LABELS, type UserType } from '@/lib/hierarchy';
import { useAuthStore } from '@/store/auth.store';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  type UserStatus, USER_STATUS_LABELS, USER_STATUS_BADGE,
  type DeactivationReason,
} from '@/lib/user-status';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  mfa_enabled?: boolean;
  department?: string;
  branch?: string;
  branches?: { id: string; name: string }[] | null;
  role?: string;
  employee_id?: string;
  employee_code?: string;
  last_login_at?: string;
  created_at?: string;
  user_type?: string;
  scope?: ScopeSummary | null;
  is_locked?: boolean;
  account_locked_at?: string;
  failed_login_count?: number;
  last_failed_login_at?: string;
  status?: UserStatus;
  deactivation_reason?: string;
  deactivation_reason_category?: string;
  deactivation_notes?: string;
  deactivated_at?: string;
  reactivated_at?: string;
  reporting_manager_id?: string | null;
  reporting_manager_name?: string | null;
}

/* ─── Avatar helpers ─────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function fullName(u: Pick<User, 'first_name' | 'last_name' | 'email'>) {
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email;
}

function isUserActive(u: Pick<User, 'status' | 'is_active'>) {
  return u.status === 'active' || u.is_active;
}

function initials(u: Pick<User, 'first_name' | 'last_name'>) {
  return `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function UserAvatar({ user }: { user: User }) {
  const name = fullName(user);
  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold shrink-0 ${avatarColor(name)}`}
    >
      {initials(user)}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/60">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200/60 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700/60">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
      Inactive
    </span>
  );
}

function AccountStatusBadge({ user }: { user: Pick<User, 'is_active' | 'is_locked' | 'status'> }) {
  if (user.is_locked) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200/60 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/60">
        <Lock className="w-3 h-3 shrink-0" />
        Locked
      </span>
    );
  }
  if (user.status) {
    const badge = USER_STATUS_BADGE[user.status];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.className}`}>
        <span aria-hidden>{badge.emoji}</span>
        {USER_STATUS_LABELS[user.status]}
      </span>
    );
  }
  return <StatusBadge isActive={user.is_active} />;
}

function MFABadge({ enabled }: { enabled?: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/60">
      <Shield className="w-3 h-3" /> MFA On
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium text-muted-foreground bg-muted/50">
      No MFA
    </span>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */

function SkeletonRow() {
  return (
    <TableRow className="border-b border-border/60">
      <TableCell className="py-4 px-4"><div className="w-4 h-4 bg-muted rounded animate-pulse" /></TableCell>
      <TableCell className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="w-28 h-3.5 bg-muted rounded animate-pulse" />
        </div>
      </TableCell>
      <TableCell className="py-4 px-4 space-y-1.5">
        <div className="w-36 h-3 bg-muted/70 rounded animate-pulse" />
        <div className="w-20 h-2.5 bg-muted/50 rounded animate-pulse" />
      </TableCell>
      <TableCell className="py-4 px-4"><div className="w-24 h-5 bg-muted rounded-md animate-pulse" /></TableCell>
      <TableCell className="py-4 px-4"><div className="w-28 h-5 bg-muted rounded-md animate-pulse" /></TableCell>
      <TableCell className="py-4 px-4"><div className="w-20 h-6 bg-muted rounded-full animate-pulse" /></TableCell>
      <TableCell className="py-4 px-4"><div className="w-16 h-5 bg-muted rounded-md animate-pulse" /></TableCell>
      <TableCell className="py-4 px-4"><div className="w-8 h-8 bg-muted rounded-lg animate-pulse" /></TableCell>
    </TableRow>
  );
}

/* ─── View Profile Drawer ────────────────────────────────────────────────── */

function ViewProfileDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    api.get(`/users/${user.id}`)
      .then(r => setDetail(r.data.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [user.id]);

  useEffect(() => {
    api.get(`/users/${user.id}/status-history`)
      .then(r => setHistory(r.data.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [user.id]);

  const fmt = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    });
  };

  const name = fullName(user);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-background shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">User Profile</h2>
            <p className="text-xs text-muted-foreground">Account details and access info</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Identity block */}
          <div className="flex items-center gap-4">
            <UserAvatar user={user} />
            <div>
              <p className="font-bold text-base text-foreground">{name}</p>
              <div className="flex items-center gap-2 mt-1">
                <AccountStatusBadge user={user} />
                <MFABadge enabled={user.mfa_enabled} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Contact</p>
            <ProfileRow icon={<Mail className="w-4 h-4" />} label="Email" value={user.email} />
            <ProfileRow icon={<Phone className="w-4 h-4" />} label="Phone" value={user.phone} />
          </div>

          {/* Access */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Access</p>
            <ProfileRow icon={<Shield className="w-4 h-4" />} label="Role" value={user.role} />
            <ProfileRow icon={<Users className="w-4 h-4" />} label="Department" value={user.department} />
          </div>

          {/* Activity */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Activity</p>
            {loading ? (
              <div className="space-y-3">
                <div className="w-48 h-3 bg-muted rounded animate-pulse" />
                <div className="w-40 h-3 bg-muted/70 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <ProfileRow icon={<Clock className="w-4 h-4" />} label="Last Login" value={fmt(detail?.last_login_at)} />
                <ProfileRow icon={<Calendar className="w-4 h-4" />} label="Account Created" value={fmt(detail?.created_at)} />
              </>
            )}
          </div>

          {/* Lockout details */}
          {!loading && user.is_locked && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account Lockout</p>
              <div className="rounded-xl border border-red-200/60 bg-red-50 dark:bg-red-950/20 dark:border-red-800/60 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                  <Lock className="w-4 h-4" />
                  Account locked
                </div>
                <ProfileRow icon={<Clock className="w-4 h-4" />} label="Locked At" value={fmt(detail?.account_locked_at)} />
                <ProfileRow icon={<AlertTriangle className="w-4 h-4" />} label="Failed Login Attempts" value={String(detail?.failed_login_count ?? '—')} />
              </div>
            </div>
          )}

          {/* Account Status History */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account Status History</p>
            {historyLoading ? (
              <div className="space-y-2">
                <div className="w-full h-10 bg-muted rounded-xl animate-pulse" />
                <div className="w-full h-10 bg-muted/70 rounded-xl animate-pulse" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No status changes recorded</p>
            ) : (
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <History className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {h.previous_status ? USER_STATUS_LABELS[h.previous_status as UserStatus] ?? h.previous_status : '—'}
                      <span className="text-muted-foreground font-normal">→</span>
                      {USER_STATUS_LABELS[h.new_status as UserStatus] ?? h.new_status}
                    </div>
                    {h.reason_label && (
                      <p className="text-xs text-muted-foreground">Reason: {h.reason_label}</p>
                    )}
                    {h.notes && (
                      <p className="text-xs text-muted-foreground">Notes: {h.notes}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {fmt(h.changed_at)}
                      {(h.changed_by_email || h.changed_by_name?.trim()) && (
                        <> · by {h.changed_by_name?.trim() || h.changed_by_email}</>
                      )}
                    </p>
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

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-foreground mt-0.5">{value || '—'}</p>
      </div>
    </div>
  );
}

/* ─── Edit User Drawer ───────────────────────────────────────────────────── */

function EditUserDrawer({
  user, onClose, onSaved,
}: { user: User; onClose: () => void; onSaved: () => void }) {
  const { selectedTenantId } = useAuthStore();

  // Reference data
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([]);
  const [manageableTypes, setManageableTypes] = useState<UserType[]>([]);
  const [scopeBranches, setScopeBranches] = useState<{ id: string; name: string }[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Form fields — covers every column shown in the table
  const [form, setForm] = useState({
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    department_id: '',           // resolved after departments load
    branch_id: user.user_type === 'employee' ? (user.branches?.[0]?.id ?? '') : '',
    reporting_manager_id: user.reporting_manager_id ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessUserType, setAccessUserType] = useState<UserType>((user.user_type as UserType) || 'employee');
  const [accessBranchIds, setAccessBranchIds] = useState<string[]>(user.branches?.map(branch => branch.id) ?? []);
  const [accessOrgId, setAccessOrgId] = useState('');
  const [editPositionId, setEditPositionId] = useState('');
  const [accessErrors, setAccessErrors] = useState<Record<string, string>>({});


  // Manager Search States
  const [managers, setManagers] = useState<{ id: string; first_name: string; last_name: string; employee_code: string; position_name?: string }[]>([]);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerLoading, setManagerLoading] = useState(false);
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const [selectedManagerName, setSelectedManagerName] = useState(user.reporting_manager_name ?? '');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsManagerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch manager candidates
  useEffect(() => {
    const fetchManagers = async () => {
      setManagerLoading(true);
      try {
        const res = await api.get('/employees/manager-select', {
          params: { search: managerSearch || undefined },
        });
        setManagers(res.data.data ?? []);
      } catch (err) {
        console.error('Failed to load managers', err);
      } finally {
        setManagerLoading(false);
      }
    };

    const timer = setTimeout(fetchManagers, managerSearch ? 300 : 0);
    return () => clearTimeout(timer);
  }, [managerSearch]);

  useEffect(() => {
    if (selectedTenantId && !accessOrgId) setAccessOrgId(selectedTenantId);
  }, [selectedTenantId, accessOrgId]);

  // Load reference data + resolve current dept/role IDs
  useEffect(() => {
    (async () => {
      try {
        const deptsRes = await api.get('/departments');
        const depts: { id: string; name: string }[] = deptsRes.data.data ?? [];
        setDepartments(depts);

        // Pre-select dept by matching the name we already have on the user row
        const matchedDept = depts.find(d => d.name === user.department);

        setForm(f => ({
          ...f,
          department_id: matchedDept?.id ?? '',
        }));
      } catch {
        // non-fatal — user can still save without dept
      } finally {
        try { const r = await api.get('/branches'); setBranches(r.data.data ?? []); } catch {}
        try { const r = await api.get('/positions'); setPositions(r.data.data ?? []); } catch {}
        try {
          const r = await api.get('/users/hierarchy/manageable-types');
          setManageableTypes((r.data.data?.types ?? []).filter((type: string): type is UserType =>
            ALL_USER_TYPES.includes(type as UserType),
          ));
          setScopeBranches(r.data.data?.branches ?? []);
        } catch {}
        try {
          const r = await api.get('/organizations');
          setOrganizations((r.data.data ?? []).map((org: any) => ({ id: org.id, name: org.name })));
        } catch {}
        setDataLoading(false);
      }
    })();
  }, [user.department]);

  // Load hierarchy/scope settings for this existing user.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/users/${user.id}/access`);
        const access = res.data?.data;
        if (access) {
          setAccessUserType((access.userType ?? 'employee') as UserType);
          setAccessBranchIds(access.branchIds ?? []);
          setEditPositionId(access.positionId ?? '');
        }
      } catch (err: any) {
        setErrors({ _: err.response?.data?.error ?? 'Failed to load user access' });
      } finally {
        setAccessLoading(false);
      }
    })();
  }, [user.id]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const setUserType = (nextType: UserType) => {
    setAccessUserType(nextType);
    setAccessErrors({});
    setAccessBranchIds(prev => {
      if (nextType === 'admin') return prev[0] ? [prev[0]] : [];
      if (nextType === 'branch_admin') return prev;
      return [];
    });
  };

  const toggleBranch = (branchId: string) => {
    setAccessBranchIds(prev =>
      prev.includes(branchId)
        ? prev.filter(id => id !== branchId)
        : [...prev, branchId],
    );
  };

  const validateAccess = () => {
    const e: Record<string, string> = {};
    if (manageableTypes.length === 0) {
      setAccessErrors(e);
      return true;
    }
    if (accessUserType === 'branch_admin' && accessBranchIds.length === 0) {
      e.branchIds = 'Select at least one branch';
    }
    if (accessUserType === 'admin' && accessBranchIds.length !== 1) {
      e.branchIds = 'Select exactly one branch';
    }
    if (accessUserType === 'org_admin' && !accessOrgId) {
      e.orgId = 'Select an organization';
    }
    setAccessErrors(e);
    return Object.keys(e).length === 0;
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim()) e.last_name = 'Required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!validateAccess()) return;
    setSaving(true);
    try {
      // 1. Update user + employee fields in one call.
      //    The backend creates an employee record if none exists (handles employee_id = null).
      const payload: any = {
        email: form.email,
        phone: form.phone || null,
        first_name: form.first_name,
        last_name: form.last_name,
        department_id: form.department_id || null,
        branch_id: form.branch_id || null,
        reporting_manager_id: form.reporting_manager_id || null,
      };

      await api.put(`/users/${user.id}`, payload);
      if (manageableTypes.length > 0) {
        await api.patch(`/users/${user.id}/access`, {
          userType: accessUserType,
          branchIds: (accessUserType === 'branch_admin' || accessUserType === 'admin') ? accessBranchIds : undefined,
          positionId: editPositionId || null,
          ...(accessUserType === 'org_admin' && accessOrgId ? { organizationId: accessOrgId } : {}),
        });
      }

      onSaved(); onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error ?? 'Failed to update user' });
    } finally { setSaving(false); }
  };

  const inp = (err?: string) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background transition-colors ${err ? 'border-red-400' : 'border-border'}`;

  const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 mt-1">
      {children}
    </p>
  );

  const selectCls = (err?: string) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background transition-colors ${err ? 'border-red-400' : 'border-border'}`;

  const accessTypeOptions = manageableTypes.length > 0
    ? manageableTypes
    : (['employee', 'admin', 'branch_admin', 'org_admin'] as UserType[]);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-[520px] bg-background shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Edit User</h2>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errors._ && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
              {errors._}
            </p>
          )}

          {/* Name */}
          <section>
            <SectionTitle>Identity</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>First Name</FieldLabel>
                <input
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder="First name"
                  className={inp(errors.first_name)}
                />
                {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>}
              </div>
              <div>
                <FieldLabel required>Last Name</FieldLabel>
                <input
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  placeholder="Last name"
                  className={inp(errors.last_name)}
                />
                {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>}
              </div>
            </div>
          </section>

          <div className="border-t border-border" />

          {/* Contact */}
          <section>
            <SectionTitle>Contact</SectionTitle>
            <div className="space-y-3">
              <div>
                <FieldLabel required>Email Address</FieldLabel>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={inp(errors.email)}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>
              <div>
                <FieldLabel>Phone Number</FieldLabel>
                <input
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+1 234 567 8900"
                  className={inp()}
                />
              </div>
            </div>
          </section>

          <div className="border-t border-border" />

          {/* Access */}
          <section>
            <SectionTitle>Access & Organisation</SectionTitle>
            <div className="space-y-4">
              {/* Status (read-only — use the row actions menu to deactivate/reactivate) */}
              <div>
                <FieldLabel>Account Status</FieldLabel>
                <div className="flex items-center justify-between gap-3 border border-border rounded-xl px-3 py-2.5 bg-muted/20">
                  <AccountStatusBadge user={user} />
                  <p className="text-xs text-muted-foreground">
                    Use the row actions menu to deactivate or reactivate this account.
                  </p>
                </div>
              </div>

              {accessLoading || dataLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-xl px-3 py-2.5 bg-muted/20">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading access settings...
                </div>
              ) : (
                <>
                  <div>
                    <FieldLabel>User Type</FieldLabel>
                    <select
                      value={accessUserType}
                      onChange={e => setUserType(e.target.value as UserType)}
                      disabled={manageableTypes.length === 0}
                      className={selectCls()}
                    >
                      {accessTypeOptions.map(type => (
                        <option key={type} value={type}>{USER_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                    {manageableTypes.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        You don't have permission to change this user's hierarchy or scope.
                      </p>
                    )}
                  </div>

                  {accessUserType === 'employee' && (
                    <div>
                      <FieldLabel>Branch / Location</FieldLabel>
                      <select
                        value={form.branch_id}
                        onChange={e => set('branch_id', e.target.value)}
                        className={selectCls(errors.branch_id)}
                      >
                        <option value="">Select branch</option>
                        {branches.map(branch => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                      {errors.branch_id && <p className="text-xs text-red-500 mt-1">{errors.branch_id}</p>}
                    </div>
                  )}

                  {accessUserType === 'org_admin' && (
                    <div>
                      <FieldLabel required>Organization</FieldLabel>
                      <select
                        value={accessOrgId}
                        onChange={e => setAccessOrgId(e.target.value)}
                        disabled={manageableTypes.length === 0}
                        className={selectCls(accessErrors.orgId)}
                      >
                        <option value="">Select organization</option>
                        {organizations.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                      {accessErrors.orgId && <p className="text-xs text-red-500 mt-1">{accessErrors.orgId}</p>}
                    </div>
                  )}

                  {accessUserType === 'admin' && (
                    <div>
                      <FieldLabel required>Branch</FieldLabel>
                      <select
                        value={accessBranchIds[0] ?? ''}
                        onChange={e => setAccessBranchIds(e.target.value ? [e.target.value] : [])}
                        disabled={manageableTypes.length === 0}
                        className={selectCls(accessErrors.branchIds)}
                      >
                        <option value="">Select branch</option>
                        {scopeBranches.map(branch => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                      {accessErrors.branchIds && <p className="text-xs text-red-500 mt-1">{accessErrors.branchIds}</p>}
                    </div>
                  )}

                  {accessUserType === 'branch_admin' && (
                    <div>
                      <FieldLabel required>Branches</FieldLabel>
                      <div className={`border rounded-xl overflow-hidden ${accessErrors.branchIds ? 'border-red-400' : 'border-border'}`}>
                        <div className="max-h-40 overflow-y-auto divide-y divide-border/60">
                          {scopeBranches.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-3 py-2.5">No branches available</p>
                          ) : scopeBranches.map(branch => (
                            <label key={branch.id} className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={accessBranchIds.includes(branch.id)}
                                onChange={() => toggleBranch(branch.id)}
                                disabled={manageableTypes.length === 0}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30"
                              />
                              <span>{branch.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {accessErrors.branchIds && <p className="text-xs text-red-500 mt-1">{accessErrors.branchIds}</p>}
                    </div>
                  )}

                  {positions.length > 0 && (
                    <div>
                      <FieldLabel>Position</FieldLabel>
                      <select
                        value={editPositionId}
                        onChange={e => setEditPositionId(e.target.value)}
                        disabled={manageableTypes.length === 0}
                        className={selectCls()}
                      >
                        <option value="">No position assigned</option>
                        {positions.map(position => (
                          <option key={position.id} value={position.id}>{position.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <div className="border-t border-border" />

          {/* Management Hierarchy */}
          <section>
            <SectionTitle>Management Hierarchy</SectionTitle>
            <div className="space-y-3">
              <div className="relative" ref={dropdownRef}>
                <FieldLabel>Reports To / Managed By</FieldLabel>
                <button
                  type="button"
                  onClick={() => setIsManagerDropdownOpen(!isManagerDropdownOpen)}
                  className={`${inp()} flex items-center justify-between text-left`}
                >
                  <span className={selectedManagerName ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedManagerName || 'Search and select reporting manager...'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Optional — leave blank if no direct manager applies
                </p>

                {isManagerDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-xl flex flex-col max-h-60 overflow-hidden">
                    {/* Search Input inside Dropdown */}
                    <div className="p-2 border-b border-border flex items-center gap-2 bg-muted/20">
                      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        value={managerSearch}
                        onChange={e => setManagerSearch(e.target.value)}
                        placeholder="Search employees..."
                        className="w-full bg-transparent text-sm outline-none border-none p-1 focus:ring-0 focus:outline-none"
                        autoFocus
                      />
                      {managerSearch && (
                        <button
                          type="button"
                          onClick={() => setManagerSearch('')}
                          className="p-1 hover:bg-muted rounded text-muted-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Options List */}
                    <div className="overflow-y-auto flex-1 py-1 max-h-48">
                      {selectedManagerName && (
                        <button
                          type="button"
                          onClick={() => {
                            set('reporting_manager_id', '');
                            setSelectedManagerName('');
                            setIsManagerDropdownOpen(false);
                            setManagerSearch('');
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 border-b border-border/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Clear Reporting Manager
                        </button>
                      )}
                      {managerLoading ? (
                        <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading candidates...
                        </div>
                      ) : managers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          No employees found
                        </div>
                      ) : (
                        managers.map(mgr => (
                          <button
                            key={mgr.id}
                            type="button"
                            onClick={() => {
                              set('reporting_manager_id', mgr.id);
                              setSelectedManagerName(`${mgr.first_name} ${mgr.last_name}`);
                              setIsManagerDropdownOpen(false);
                              setManagerSearch('');
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex flex-col"
                          >
                            <span className="font-medium text-foreground">
                              {mgr.first_name} {mgr.last_name}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{mgr.employee_code}</span>
                              {mgr.position_name && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-border" />
                                  <span>{mgr.position_name}</span>
                                </>
                              )}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || dataLoading || accessLoading}
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

/* ─── Reset Password Modal ───────────────────────────────────────────────── */

function ResetPasswordModal({
  user, onClose, onSaved,
}: { user: User; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const save = async () => {
    if (!password) { setError('Password is required'); return; }
    if (password.length < 8) { setError('Minimum 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/users/${user.id}`, { password });
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to reset password');
    } finally { setSaving(false); }
  };

  const pwInput = (val: string, set: (v: string) => void, show: boolean, toggle: () => void, placeholder: string) => (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={val}
        onChange={e => set(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
      />
      <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Reset Password</h2>
            <p className="text-xs text-muted-foreground">{fullName(user)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-foreground">Password reset successfully</p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  This will immediately change the user's password. They will need to log in again.
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">New Password</label>
                  {pwInput(password, setPassword, showPw, () => setShowPw(v => !v), 'Min. 8 characters')}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Confirm Password</label>
                  {pwInput(confirm, setConfirm, showCf, () => setShowCf(v => !v), 'Re-enter password')}
                </div>
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Reset Password
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Unlock Account Modal ───────────────────────────────────────────────── */

function UnlockAccountModal({
  user, onClose, onSaved,
}: { user: User; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const confirmUnlock = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/users/${user.id}/unlock`);
      setSuccess(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to unlock account');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Unlock Account</h2>
            <p className="text-xs text-muted-foreground">{fullName(user)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-foreground">Account reactivated</p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                <Unlock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  Resets failed login attempts and immediately restores sign-in access for this user.
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              <p className="text-sm text-foreground">
                Unlock account for <span className="font-semibold">{fullName(user)}</span>?
              </p>
            </>
          )}
        </div>

        {!success && (
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={confirmUnlock}
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              Unlock Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Deactivate User Modal ──────────────────────────────────────────────── */

function DeactivateUserModal({
  users, onClose, onSaved,
}: { users: User[]; onClose: () => void; onSaved: () => void }) {
  const [reasons, setReasons] = useState<DeactivationReason[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(true);
  const [reasonId, setReasonId] = useState('');
  const [reasonOpen, setReasonOpen] = useState(false);
  const reasonRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isBulk = users.length > 1;

  useEffect(() => {
    api.get('/users/deactivation-reasons')
      .then(r => setReasons(r.data.data ?? []))
      .catch(() => setReasons([]))
      .finally(() => setReasonsLoading(false));
  }, []);

  useEffect(() => {
    if (!reasonOpen) return;
    const h = (e: MouseEvent) => {
      if (!reasonRef.current?.contains(e.target as Node)) setReasonOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [reasonOpen]);

  const selectedReason = reasons.find(r => r.id === reasonId);
  const notesRequired = !!selectedReason?.requires_notes;

  const confirmDeactivate = async () => {
    if (!reasonId) { setError('Please select a reason'); return; }
    if (notesRequired && !notes.trim()) { setError('Notes are required for this reason'); return; }
    setSaving(true); setError('');
    try {
      const results = await Promise.allSettled(
        users.map(u => api.post(`/users/${u.id}/deactivate`, { reasonId, notes: notes.trim() || undefined })),
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0 && failed === results.length) {
        throw new Error('Failed to deactivate selected accounts');
      }
      setSuccess(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? err.message ?? 'Failed to deactivate account');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">{isBulk ? `Deactivate ${users.length} Users` : 'Deactivate User'}</h2>
            <p className="text-xs text-muted-foreground">{isBulk ? users.map(fullName).join(', ') : fullName(users[0])}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-sm font-semibold text-foreground">{isBulk ? 'Accounts deactivated' : 'Account deactivated'}</p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                <PowerOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  {isBulk ? `These ${users.length} users` : 'This user'} will no longer be able to log in or access the HRMS platform. Historical records and audit logs will remain intact.
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              <div ref={reasonRef} className="relative">
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                {reasonsLoading ? (
                  <div className="h-10 bg-muted rounded-xl animate-pulse" />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setReasonOpen(v => !v)}
                      className={`w-full flex items-center justify-between gap-2 border rounded-xl px-3 py-2.5 text-sm bg-background transition-colors ${reasonOpen ? 'border-primary/50 ring-2 ring-primary/30' : 'border-border'
                        }`}
                    >
                      <span className={selectedReason ? 'text-foreground' : 'text-muted-foreground'}>
                        {selectedReason ? selectedReason.label : '— Select a reason —'}
                      </span>
                      <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${reasonOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {reasonOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-background border border-border rounded-xl shadow-xl z-50 py-1 max-h-60 overflow-y-auto">
                        {reasons.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => { setReasonId(r.id); setReasonOpen(false); }}
                            className={`w-full text-left px-3.5 py-2 text-sm transition-colors hover:bg-muted/60 ${reasonId === r.id ? 'font-medium text-primary bg-primary/5' : 'text-foreground'
                              }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Notes {notesRequired && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder={notesRequired ? 'Required for this reason…' : 'Optional notes…'}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                />
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={confirmDeactivate}
              disabled={saving || reasonsLoading}
              className="flex items-center gap-2 bg-amber-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />}
              {isBulk ? `Deactivate ${users.length} Users` : 'Deactivate User'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Reactivate User Modal ──────────────────────────────────────────────── */

function ReactivateUserModal({
  user, onClose, onSaved,
}: { user: User; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const confirmReactivate = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/users/${user.id}/reactivate`, { notes: notes.trim() || undefined });
      setSuccess(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to reactivate account');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Reactivate User</h2>
            <p className="text-xs text-muted-foreground">{fullName(user)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-foreground">Account reactivated</p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                <Power className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  This restores the account to Active status and allows the user to sign in again.
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              <p className="text-sm text-foreground">
                Reactivate account for <span className="font-semibold">{fullName(user)}</span>?
              </p>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes…"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                />
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={confirmReactivate}
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Reactivate Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Delete User Modal ──────────────────────────────────────────────────── */

function DeleteUserModal({
  user, onClose, onDeleted,
}: { user: User; onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const canConfirm = confirmText.trim() === 'DELETE';

  const confirmDelete = async () => {
    if (!canConfirm) return;
    setDeleting(true); setError('');
    try {
      await api.delete(`/users/${user.id}`);
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to delete user');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Delete User Permanently</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
              This action cannot be undone. The user account will be permanently removed.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <ProfileRow icon={<Users className="w-4 h-4" />} label="Name" value={fullName(user)} />
            <ProfileRow icon={<KeyRound className="w-4 h-4" />} label="Employee ID" value={user.employee_code} />
            <ProfileRow icon={<Mail className="w-4 h-4" />} label="Email" value={user.email} />
            <div className="flex items-start gap-3">
              <span className="text-muted-foreground mt-0.5 shrink-0"><ShieldCheck className="w-4 h-4" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
                <div className="mt-1"><AccountStatusBadge user={user} /></div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Type <span className="font-semibold text-foreground">DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 bg-background"
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            disabled={!canConfirm || deleting}
            className="flex items-center gap-2 bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete User
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Row Action Dropdown ────────────────────────────────────────────────── */

function ActionMenuItem({
  icon, label, onClick, variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'warning' | 'success';
}) {
  const cls = {
    default: 'text-foreground hover:bg-muted/60',
    danger: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30',
    warning: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30',
    success: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
  }[variant];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm ${cls} transition-colors`}
    >
      {icon}
      {label}
    </button>
  );
}

function RowActions({
  user,
  canResetPasswordActor,
  canDeleteActor,
  onViewProfile,
  onEditUser,
  onResetPassword,
  onDeactivate,
  onReactivate,
  onDelete,
  onUnlock,
}: {
  user: User;
  canResetPasswordActor: boolean;
  canDeleteActor: boolean;
  onViewProfile: (user: User) => void;
  onEditUser: (user: User) => void;
  onResetPassword: (user: User) => void;
  onDeactivate: (user: User) => void;
  onReactivate: (user: User) => void;
  onDelete: (user: User) => void;
  onUnlock: (user: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const close = () => setOpen(false);

  const showLifecycleActions = true;
  const isActive = user.status === 'active' || user.is_active;
  const showDelete = !isActive && canDeleteActor;

  const MENU_WIDTH = 208; // w-52
  const ITEM_HEIGHT = 36;
  const DIVIDER_HEIGHT = 9;
  const itemCount = 2 + (isActive ? 1 : 0) + (user.is_locked ? 1 : 0) + (showLifecycleActions ? 1 : 0) + (showDelete ? 1 : 0);
  const dividerCount = (showLifecycleActions ? 1 : 0) + (showDelete ? 1 : 0);
  const menuHeight = itemCount * ITEM_HEIGHT + dividerCount * DIVIDER_HEIGHT + 8; // + py-1 container padding

  let menuStyle: React.CSSProperties = {};
  if (rect) {
    const openUp = rect.bottom + 4 + menuHeight > window.innerHeight && rect.top - menuHeight - 4 > 0;
    menuStyle = {
      position: 'fixed',
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      width: MENU_WIDTH,
      zIndex: 9999,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    };
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => {
          if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
          setOpen(v => !v);
        }}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="bg-background border border-border rounded-xl shadow-xl overflow-hidden py-1"
        >
          <ActionMenuItem
            icon={<Eye className="w-3.5 h-3.5" />}
            label="View Profile"
            onClick={() => { onViewProfile(user); close(); }}
          />
          <ActionMenuItem
            icon={<Pencil className="w-3.5 h-3.5" />}
            label="Edit User"
            onClick={() => { onEditUser(user); close(); }}
          />
          {isActive && canResetPasswordActor && (
            <ActionMenuItem
              icon={<KeyRound className="w-3.5 h-3.5" />}
              label="Reset Password"
              onClick={() => { onResetPassword(user); close(); }}
            />
          )}
          {user.is_locked && (
            <ActionMenuItem
              icon={<Unlock className="w-3.5 h-3.5" />}
              label="Unlock Account"
              onClick={() => { onUnlock(user); close(); }}
              variant="success"
            />
          )}
          {showLifecycleActions && (
            <>
              <div className="my-1 border-t border-border/60" />
              {isActive ? (
                <ActionMenuItem
                  icon={<UserX className="w-3.5 h-3.5" />}
                  label="Deactivate User"
                  onClick={() => { onDeactivate(user); close(); }}
                  variant="warning"
                />
              ) : (
                <ActionMenuItem
                  icon={<UserCheck className="w-3.5 h-3.5" />}
                  label="Reactivate User"
                  onClick={() => { onReactivate(user); close(); }}
                  variant="success"
                />
              )}
              {showDelete && (
                <>
                  <div className="my-1 border-t border-border/60" />
                  <ActionMenuItem
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    label="Delete User"
                    onClick={() => { onDelete(user); close(); }}
                    variant="danger"
                  />
                </>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ─── Filter Dropdown ────────────────────────────────────────────────────── */

function FilterDropdown({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${value
            ? 'border-primary/50 bg-primary/5 text-primary'
            : 'border-border hover:border-primary/30 text-foreground bg-background'
          }`}
      >
        <span>{value ? selected?.label : label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 min-w-[160px] bg-background border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden">
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full text-left px-3.5 py-2 text-sm hover:bg-muted/60 transition-colors ${!value ? 'font-medium text-primary' : 'text-foreground'}`}
          >
            All {label}s
          </button>
          <div className="border-t border-border/60 my-1" />
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-sm hover:bg-muted/60 transition-colors ${value === o.value ? 'font-medium text-primary' : 'text-foreground'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────────────────── */

function StatCard({
  label, value, icon, color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-background border border-border rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function UsersPage() {
  const { userType } = useAuthStore();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);

  // Row action drawers / modals
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [unlockUser, setUnlockUser] = useState<User | null>(null);
  const [deactivateUsers, setDeactivateUsers] = useState<User[] | null>(null);
  const [reactivateUser, setReactivateUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [bulkActivating, setBulkActivating] = useState(false);

  const canDeleteUsers = userType === 'org_admin';

  // Filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMFA, setFilterMFA] = useState('');
  const [filterUserType, setFilterUserType] = useState('');

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ── Data fetching (unchanged) ──────────────────────────────────────────── */

  const fetchData = async () => {
    setLoading(true);
    try {
      const usersRes = await api.get('/users', { params: { page: 1, limit: 100 } });
      setUsers(usersRes.data.data ?? []);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  /* ── Actions (unchanged logic) ──────────────────────────────────────────── */

  const selectedRows = () => filteredUsers.filter(u => selected.has(u.id));

  const handleBulkActivate = async () => {
    const targets = selectedRows().filter(u => !isUserActive(u));
    if (!targets.length) { alert('No inactive users selected'); return; }
    if (!confirm(`Reactivate ${targets.length} user(s)?`)) return;
    setBulkActivating(true);
    try {
      await Promise.allSettled(targets.map(u => api.post(`/users/${u.id}/reactivate`)));
      setSelected(new Set());
      await fetchData();
    } finally { setBulkActivating(false); }
  };

  const handleBulkDeactivateClick = () => {
    const targets = selectedRows().filter(u => isUserActive(u));
    if (!targets.length) { alert('No active users selected'); return; }
    setDeactivateUsers(targets);
  };

  const handleBulkExport = () => {
    const targets = selectedRows();
    if (!targets.length) return;
    exportReportCsv({
      columns: ['Name', 'Email', 'Phone', 'User Type', 'Department', 'Role', 'Status', 'MFA'],
      rows: targets.map(u => [
        fullName(u),
        u.email,
        u.phone ?? '',
        u.user_type ?? 'employee',
        u.department ?? '',
        u.role ?? '',
        isUserActive(u) ? 'Active' : 'Inactive',
        u.mfa_enabled ? 'Enabled' : 'Disabled',
      ]),
    }, 'users_export');
  };

  /* ── Derived state ───────────────────────────────────────────────────────── */

  const roleOptions = useMemo(() => {
    const unique = [...new Set(users.map(u => u.role).filter(Boolean))] as string[];
    return unique.map(r => ({ value: r, label: r }));
  }, [users]);

  const userTypeOptions = useMemo(() => {
    const present = new Set(users.map(u => u.user_type || 'employee'));
    return ALL_USER_TYPES.filter(t => present.has(t)).map(t => ({ value: t, label: USER_TYPE_LABELS[t] }));
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = search.toLowerCase();
      if (search) {
        const hit =
          fullName(u).toLowerCase().includes(q) ||
          (u.email?.toLowerCase().includes(q) ?? false) ||
          (u.phone?.includes(q) ?? false) ||
          (u.department?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      if (filterRole && u.role !== filterRole) return false;
      if (filterUserType && (u.user_type || 'employee') !== filterUserType) return false;
      if (filterStatus === 'active' && !u.is_active) return false;
      if (filterStatus === 'inactive' && u.is_active) return false;
      if (filterMFA === 'enabled' && !u.mfa_enabled) return false;
      if (filterMFA === 'disabled' && u.mfa_enabled) return false;
      return true;
    });
  }, [users, search, filterRole, filterUserType, filterStatus, filterMFA]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
    mfa: users.filter(u => u.mfa_enabled).length,
    locked: users.filter(u => u.is_locked).length,
  }), [users]);

  const hasFilters = !!(search || filterRole || filterUserType || filterStatus || filterMFA);

  /* ── Bulk selection helpers ──────────────────────────────────────────────── */

  const allSelected = filteredUsers.length > 0 && filteredUsers.every(u => selected.has(u.id));
  const someSelected = filteredUsers.some(u => selected.has(u.id));
  const selectedCount = [...selected].filter(id => filteredUsers.some(u => u.id === id)).length;

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filteredUsers.forEach(u => next.delete(u.id));
    else filteredUsers.forEach(u => next.add(u.id));
    setSelected(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const clearFilters = () => {
    setSearch(''); setFilterRole(''); setFilterUserType(''); setFilterStatus(''); setFilterMFA('');
  };

  /* ── Horizontal scroll affordance for the wide users table ─────────────────── */

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableOverflowing, setTableOverflowing] = useState(false);
  const [tableAtEnd, setTableAtEnd] = useState(false);
  const [tableScrolled, setTableScrolled] = useState(false);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const check = () => {
      setTableOverflowing(el.scrollWidth > el.clientWidth + 1);
      setTableAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, filteredUsers.length]);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setTableAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
    if (el.scrollLeft > 4) setTableScrolled(true);
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <>
      {showUserForm && (
        <CreateUserDrawer onClose={() => setShowUserForm(false)} onSaved={fetchData} />
      )}
      {showBulkDrawer && (
        <UserBulkImportDrawer
          onClose={() => setShowBulkDrawer(false)}
          onAllDone={fetchData}
        />
      )}
      {viewUser && (
        <ViewProfileDrawer user={viewUser} onClose={() => setViewUser(null)} />
      )}
      {editUser && (
        <EditUserDrawer user={editUser} onClose={() => setEditUser(null)} onSaved={fetchData} />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onSaved={fetchData} />
      )}
      {unlockUser && (
        <UnlockAccountModal user={unlockUser} onClose={() => setUnlockUser(null)} onSaved={fetchData} />
      )}
      {deactivateUsers && (
        <DeactivateUserModal users={deactivateUsers} onClose={() => setDeactivateUsers(null)} onSaved={fetchData} />
      )}
      {reactivateUser && (
        <ReactivateUserModal user={reactivateUser} onClose={() => setReactivateUser(null)} onSaved={fetchData} />
      )}
      {deleteUser && (
        <DeleteUserModal user={deleteUser} onClose={() => setDeleteUser(null)} onDeleted={fetchData} />
      )}

      <div className="space-y-6">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage user accounts and access control
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchData}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowBulkDrawer(true)}
              className="flex items-center gap-2 border border-border rounded-lg px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
            >
              <Upload className="w-4 h-4" /> Bulk Import
            </button>
            <button
              onClick={() => setShowUserForm(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>

        {/* ── Stats Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="border border-border rounded-xl p-4 flex items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
                  <div className="space-y-2">
                    <div className="w-10 h-5 bg-muted rounded" />
                    <div className="w-20 h-3 bg-muted/70 rounded" />
                  </div>
                </div>
              ))
            ) : (
              <>
                <StatCard
                  label="Total Users"
                  value={stats.total}
                  icon={<Users className="w-5 h-5" />}
                  color="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                />
                <StatCard
                  label="Active"
                  value={stats.active}
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  color="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                />
                <StatCard
                  label="Inactive"
                  value={stats.inactive}
                  icon={<XCircle className="w-5 h-5" />}
                  color="bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400"
                />
                <StatCard
                  label="MFA Enabled"
                  value={stats.mfa}
                  icon={<Shield className="w-5 h-5" />}
                  color="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400"
                />
                <StatCard
                  label="Locked Accounts"
                  value={stats.locked}
                  icon={<Lock className="w-5 h-5" />}
                  color="bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                />
              </>
            )}
        </div>

        <div className="space-y-3">

            {/* ── Filter Bar ──────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search users…"
                  className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {roleOptions.length > 0 && (
                <FilterDropdown label="Role" value={filterRole} options={roleOptions} onChange={setFilterRole} />
              )}

              {userTypeOptions.length > 0 && (
                <FilterDropdown label="User Type" value={filterUserType} options={userTypeOptions} onChange={setFilterUserType} />
              )}

              <FilterDropdown
                label="Status"
                value={filterStatus}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
                onChange={setFilterStatus}
              />

              <FilterDropdown
                label="MFA"
                value={filterMFA}
                options={[
                  { value: 'enabled', label: 'MFA On' },
                  { value: 'disabled', label: 'No MFA' },
                ]}
                onChange={setFilterMFA}
              />

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            {/* ── Bulk Action Bar ──────────────────────────────────────────── */}
            {selectedCount > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
                <span className="text-sm font-semibold text-primary">{selectedCount} selected</span>
                <div className="w-px h-4 bg-primary/20" />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkActivate}
                    disabled={bulkActivating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-md hover:bg-emerald-100 disabled:opacity-50 transition-colors dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/60"
                  >
                    {bulkActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} Activate
                  </button>
                  <button
                    onClick={handleBulkDeactivateClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200/60 rounded-md hover:bg-amber-100 transition-colors dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/60"
                  >
                    <PowerOff className="w-3.5 h-3.5" /> Deactivate
                  </button>
                  <button
                    onClick={handleBulkExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-md hover:bg-muted/70 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                </div>
                <button
                  onClick={() => setSelected(new Set())}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
            )}

            {/* ── Table ───────────────────────────────────────────────────── */}
            <div className="border border-border rounded-xl overflow-hidden bg-background">
              <div className="relative">
                {tableOverflowing && !tableAtEnd && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-10 z-10 bg-gradient-to-l from-background to-transparent" />
                )}
                {tableOverflowing && !tableScrolled && (
                  <div className="pointer-events-none absolute top-2 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-foreground/85 text-background text-[10px] font-medium shadow-sm">
                    <ArrowLeftRight className="w-3 h-3" /> Scroll for more
                  </div>
                )}
                <Table
                  className="text-sm"
                  containerRef={tableScrollRef}
                  onContainerScroll={handleTableScroll}
                >
                    <TableHeader>
                      <TableRow className="bg-muted/40 border-b border-border">
                        <TableHead className="py-3 px-3 w-10">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={toggleAll}
                            className="w-4 h-4 rounded border-border cursor-pointer accent-primary"
                          />
                        </TableHead>
                        <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[160px]">
                          Name
                        </TableHead>
                        <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[190px]">
                          Contact
                        </TableHead>
                        <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[110px]">
                          User Type
                        </TableHead>
                        <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[140px]">
                          Branch
                        </TableHead>
                        <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[95px]">
                          Status
                        </TableHead>
                        <TableHead className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[90px]">
                          Security
                        </TableHead>
                        <TableHead className="py-3 px-3 w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/60">
                      {loading ? (
                      Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            {hasFilters ? (
                              <>
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                  <Search className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-semibold text-foreground mb-1">
                                  No users match your filters
                                </p>
                                <p className="text-xs text-muted-foreground mb-4">
                                  Try adjusting your search or filter criteria
                                </p>
                                <button
                                  onClick={clearFilters}
                                  className="text-sm text-primary hover:underline"
                                >
                                  Clear all filters
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                  <Users className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-semibold text-foreground mb-1">No users yet</p>
                                <p className="text-xs text-muted-foreground mb-4">
                                  Get started by adding the first user to your organization
                                </p>
                                <button
                                  onClick={() => setShowUserForm(true)}
                                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
                                >
                                  <UserPlus className="w-4 h-4" /> Add First User
                                </button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map(u => (
                        <TableRow
                          key={u.id}
                          className={`group transition-colors hover:bg-muted/30 ${selected.has(u.id) ? 'bg-primary/5' : ''}`}
                        >
                          {/* Checkbox */}
                          <TableCell className="py-3.5 px-3">
                            <input
                              type="checkbox"
                              checked={selected.has(u.id)}
                              onChange={() => toggleOne(u.id)}
                              className="w-4 h-4 rounded border-border cursor-pointer accent-primary"
                            />
                          </TableCell>

                          {/* Name */}
                          <TableCell className="py-3.5 px-3">
                            <div className="flex items-center gap-3">
                              <UserAvatar user={u} />
                              <p className="font-semibold text-sm text-foreground truncate">
                                {fullName(u)}
                              </p>
                            </div>
                          </TableCell>

                          {/* Contact (email + phone) */}
                          <TableCell className="py-3.5 px-3">
                            <p className="text-sm text-foreground truncate">{u.email}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.phone || '—'}</p>
                          </TableCell>

                          {/* User Type */}
                          <TableCell className="py-3.5 px-3">
                            <UserTypeBadge userType={u.user_type} />
                          </TableCell>

                          {/* Scope */}
                          <TableCell className="py-3.5 px-3">
                            <ScopeCell userType={u.user_type} scope={u.scope} branch={u.branch} branches={u.branches} />
                          </TableCell>

                          {/* Status */}
                          <TableCell className="py-3.5 px-3">
                            <AccountStatusBadge user={u} />
                          </TableCell>

                          {/* MFA */}
                          <TableCell className="py-3.5 px-3">
                            <MFABadge enabled={u.mfa_enabled} />
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="py-3.5 px-3">
                            <RowActions
                              user={u}
                              canResetPasswordActor={userType === 'org_admin'}
                              canDeleteActor={canDeleteUsers}
                              onViewProfile={setViewUser}
                              onEditUser={setEditUser}
                              onResetPassword={setResetUser}
                              onDeactivate={(u) => setDeactivateUsers([u])}
                              onReactivate={setReactivateUser}
                              onDelete={setDeleteUser}
                              onUnlock={setUnlockUser}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Table Footer */}
              {!loading && filteredUsers.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    Showing{' '}
                    <span className="font-medium text-foreground">{filteredUsers.length}</span>
                    {' '}of{' '}
                    <span className="font-medium text-foreground">{users.length}</span> users
                  </p>
                  {hasFilters && (
                    <span className="text-xs font-medium text-primary">Filters active</span>
                  )}
                </div>
              )}
            </div>
          </div>
      </div>
    </>
  );
}
