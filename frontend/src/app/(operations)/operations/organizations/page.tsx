'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';
import {
  Plus, Search, MoreVertical, Pencil, Trash2, ArrowRightCircle, Ban, CheckCircle2, Archive, UserCog, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { canOps, OPS_PERMISSIONS } from '@/lib/internal-roles';
import {
  ORG_LIFECYCLE_LABELS, ORG_LIFECYCLE_BADGE_CLASSES, ORG_LIFECYCLE_STAGES,
  canTransitionLifecycleStage, type OrgLifecycleStage,
} from '@/lib/organization-lifecycle';
import {
  listOpsOrganizations, updateOpsOrganization, deleteOpsOrganization,
  transitionOpsOrganization, suspendOpsOrganization, activateOpsOrganization, archiveOpsOrganization,
  changeOpsOrganizationOwnership, resetOpsOrganizationAdminPassword, getOpsOrganization,
  listOpsOwnershipCandidates, type OpsOrganization, type OpsOwnershipCandidate,
} from '@/lib/operations-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrgFormDialog, type OrgFormValues } from '@/components/operations/org-form-dialog';

function StageBadge({ stage }: { stage: OrgLifecycleStage }) {
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${ORG_LIFECYCLE_BADGE_CLASSES[stage]}`}>
      {ORG_LIFECYCLE_LABELS[stage]}
    </span>
  );
}

function RowActions({
  org, canEdit, canDelete, canManage, onEdit, onDelete, onTransition, onSuspend, onActivate, onArchive, onChangeOwner, onResetAdminPassword,
}: {
  org: OpsOrganization;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTransition: (stage: OrgLifecycleStage) => void;
  onSuspend: () => void;
  onActivate: () => void;
  onArchive: () => void;
  onChangeOwner: () => void;
  onResetAdminPassword: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const positionMenu = useCallback(() => {
    const trigger = ref.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = 224;
    const preferredHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(preferredHeight, openAbove ? spaceAbove : spaceBelow));
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
    );

    setMenuStyle({
      position: 'fixed',
      top: openAbove ? undefined : rect.bottom + 4,
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      left,
      width: menuWidth,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const isTriggerClick = ref.current?.contains(target);
      const isMenuClick = menuRef.current?.contains(target);

      if (!isTriggerClick && !isMenuClick) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const update = () => positionMenu();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, positionMenu]);

  if (!canEdit && !canDelete && !canManage) return null;

  const nextStages = ORG_LIFECYCLE_STAGES.filter((s) => canTransitionLifecycleStage(org.lifecycle_stage, s) && s !== 'suspended' && s !== 'archived');
  const menu = open && mounted ? createPortal(
    <div ref={menuRef} className="z-50 overflow-y-auto rounded-xl border border-border bg-white py-1 shadow-xl" style={menuStyle}>
      {canEdit && (
        <button type="button" onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
      )}
      {canManage && nextStages.map((s) => (
        <button key={s} type="button" onClick={() => { setOpen(false); onTransition(s); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <ArrowRightCircle className="w-3.5 h-3.5" /> Move to {ORG_LIFECYCLE_LABELS[s]}
        </button>
      ))}
      {canManage && org.lifecycle_stage !== 'suspended' && (
        <button type="button" onClick={() => { setOpen(false); onSuspend(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <Ban className="w-3.5 h-3.5" /> Suspend
        </button>
      )}
      {canManage && org.lifecycle_stage === 'suspended' && (
        <button type="button" onClick={() => { setOpen(false); onActivate(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
        </button>
      )}
      {canManage && org.lifecycle_stage !== 'archived' && (
        <button type="button" onClick={() => { setOpen(false); onArchive(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <Archive className="w-3.5 h-3.5" /> Archive
        </button>
      )}
      {canManage && (
        <button type="button" onClick={() => { setOpen(false); onChangeOwner(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <UserCog className="w-3.5 h-3.5" /> Change Owner
        </button>
      )}
      {canManage && (
        <button type="button" onClick={() => { setOpen(false); onResetAdminPassword(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <KeyRound className="w-3.5 h-3.5" /> Reset Admin Password
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (!open) positionMenu();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {menu}
    </div>
  );
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numericOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function addressHasValue(address: OrgFormValues['registered_address']) {
  return Object.values(address).some((part) => part.trim());
}

function cleanAddress(address: OrgFormValues['registered_address']) {
  if (!addressHasValue(address)) return null;
  return {
    line1: emptyToNull(address.line1),
    line2: emptyToNull(address.line2),
    city: emptyToNull(address.city),
    state: emptyToNull(address.state),
    country: emptyToNull(address.country),
    postal_code: emptyToNull(address.postal_code),
  };
}

function buildOrganizationUpdatePayload(values: OrgFormValues) {
  return {
    name: values.name.trim(),
    legal_name: values.legal_name.trim(),
    trade_name: emptyToNull(values.trade_name),
    company_code: values.company_code.trim(),
    company_type: emptyToNull(values.company_type),
    company_size: emptyToNull(values.company_size),
    registration_number: emptyToNull(values.registration_number),
    gstin: emptyToNull(values.gstin),
    pan_number: emptyToNull(values.pan_number),
    cin_number: emptyToNull(values.cin_number),
    industry: emptyToNull(values.industry),
    estimated_employee_count: numericOrNull(values.estimated_employee_count),
    estimated_branch_count: numericOrNull(values.estimated_branch_count),
    primary_email: values.primary_email.trim(),
    support_email: emptyToNull(values.support_email),
    phone_number: values.phone_number.trim(),
    alternate_phone: emptyToNull(values.alternate_phone),
    website_url: emptyToNull(values.website_url),
    contact_person_name: emptyToNull(values.contact_person_name),
    contact_designation: emptyToNull(values.contact_designation),
    contact_person_mobile: emptyToNull(values.contact_person_mobile),
    contact_person_email: emptyToNull(values.contact_person_email),
    fiscal_year_start: numericOrNull(values.fiscal_year_start) || 4,
    timezone: values.timezone.trim() || 'Asia/Kolkata',
    currency: values.currency.trim() || 'INR',
    date_format: values.date_format.trim() || 'DD/MM/YYYY',
    emp_code_prefix: emptyToNull(values.emp_code_prefix),
    emp_code_digits: numericOrNull(values.emp_code_digits) || 4,
    max_failed_login_attempts: numericOrNull(values.max_failed_login_attempts) || 5,
    business_category: emptyToNull(values.business_category),
    current_hr_system: emptyToNull(values.current_hr_system),
    registered_address: cleanAddress(values.registered_address),
    operational_address: values.same_as_registered ? null : cleanAddress(values.operational_address),
  };
}

function displayCandidateName(candidate: OpsOwnershipCandidate) {
  const employeeName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim();
  return candidate.full_name || employeeName || candidate.email;
}

function extractActionError(err: any, fallback: string) {
  const message = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message;
  if (Array.isArray(message)) return message[0] || fallback;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function ResetAdminPasswordDialog({
  organization,
  onClose,
  onSaved,
}: {
  organization: OpsOrganization | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState<OpsOwnershipCandidate | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!organization) {
      setPassword('');
      setConfirm('');
      setShowPassword(false);
      setShowConfirm(false);
      setSubmitting(false);
      setLoadingAdmin(false);
      setAdminUser(null);
      setError('');
      return;
    }

    let active = true;
    setLoadingAdmin(true);
    setAdminUser(null);
    setError('');

    listOpsOwnershipCandidates(organization.id)
      .then((candidates) => {
        if (!active) return;
        setAdminUser(candidates.find((candidate) => candidate.is_current_admin) || null);
      })
      .catch((err: any) => {
        if (active) setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to load current organization admin');
      })
      .finally(() => {
        if (active) setLoadingAdmin(false);
      });

    return () => {
      active = false;
    };
  }, [organization]);

  const validate = () => {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password needs at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password needs at least one lowercase letter';
    if (!/\d/.test(password)) return 'Password needs at least one number';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password needs at least one special character';
    if (password !== confirm) return 'Passwords do not match';
    return '';
  };

  const submit = async () => {
    if (!organization) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await resetOpsOrganizationAdminPassword(organization.id, password);
      onClose();
      await onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const passwordInput = (
    value: string,
    onChange: (value: string) => void,
    show: boolean,
    toggle: () => void,
    placeholder: string,
  ) => (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        className="pr-10"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <Dialog open={!!organization} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Org Admin Password</DialogTitle>
          <DialogDescription>
            {organization ? `Set a temporary password for ${organization.name}'s assigned organization admin.` : ''}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</div>
        )}

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Current Org Admin</p>
            {loadingAdmin && <p className="mt-1 text-sm text-muted-foreground">Loading admin user...</p>}
            {!loadingAdmin && adminUser && (
              <div className="mt-1">
                <p className="text-sm font-semibold text-foreground">{displayCandidateName(adminUser)}</p>
                <p className="text-xs text-muted-foreground">{adminUser.email}</p>
                <p className="text-xs text-muted-foreground">
                  {[adminUser.employee_code, adminUser.department, adminUser.user_type].filter(Boolean).join(' · ') || 'Organization admin'}
                </p>
              </div>
            )}
            {!loadingAdmin && !adminUser && (
              <p className="mt-1 text-sm text-destructive">No assigned organization admin found.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New Password</label>
            {passwordInput(password, setPassword, showPassword, () => setShowPassword((v) => !v), 'Min. 8 characters')}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirm Password</label>
            {passwordInput(confirm, setConfirm, showConfirm, () => setShowConfirm((v) => !v), 'Re-enter password')}
          </div>
          <p className="text-xs text-muted-foreground">
            Existing admin sessions will be signed out, and the admin must change this password on next login.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || loadingAdmin || !adminUser}>
            {submitting ? 'Resetting...' : 'Reset Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeOwnerDialog({
  organization,
  onClose,
  onSaved,
}: {
  organization: OpsOrganization | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [candidates, setCandidates] = useState<OpsOwnershipCandidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedUserId) || null;

  useEffect(() => {
    if (!organization) {
      setCandidates([]);
      setSelectedUserId('');
      setSearchText('');
      setLoading(false);
      setSubmitting(false);
      setError('');
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await listOpsOwnershipCandidates(organization.id, searchText.trim());
        if (!active) return;
        setCandidates(data);
        const currentAdmin = data.find((candidate) => candidate.is_current_admin);
        setSelectedUserId((current) => current || currentAdmin?.id || '');
      } catch (err: any) {
        if (active) setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to load users');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [organization, searchText]);

  const submit = async () => {
    if (!organization) return;
    if (!selectedUserId) {
      setError('Select a user to make organization admin');
      return;
    }
    if (selectedCandidate?.is_current_admin) {
      setError('Selected user is already the organization admin');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await changeOpsOrganizationOwnership(organization.id, selectedUserId);
      onClose();
      await onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to change owner');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!organization} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change Organization Owner</DialogTitle>
          <DialogDescription>
            {organization ? `Choose the user who should become the organization admin for ${organization.name}.` : ''}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</div>
        )}

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setSelectedUserId('');
              }}
              placeholder="Search users by name, email, username, or employee code"
              className="pl-9"
            />
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            {loading && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading users...</div>
            )}
            {!loading && candidates.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No users found in this organization.</div>
            )}
            {!loading && candidates.map((candidate) => {
              const selected = selectedUserId === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedUserId(candidate.id)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left border-b border-border last:border-b-0 hover:bg-muted transition-colors ${selected ? 'bg-muted' : 'bg-white'}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-foreground truncate">{displayCandidateName(candidate)}</p>
                      {candidate.is_current_admin && (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Current admin</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{candidate.email}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[candidate.employee_code, candidate.department, candidate.user_type].filter(Boolean).join(' · ') || 'Organization member'}
                    </p>
                  </div>
                  <div className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300'}`}>
                    {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCandidate && !selectedCandidate.is_current_admin && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {displayCandidateName(selectedCandidate)} will become the organization admin. The previous admin will be demoted to employee for this organization.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !selectedUserId || selectedCandidate?.is_current_admin}>
            {submitting ? 'Changing...' : 'Confirm Change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OperationsOrganizationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stage = searchParams?.get('stage') || '';
  const { internalRole } = useAuthStore();

  const [orgs, setOrgs] = useState<OpsOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingOrg, setEditingOrg] = useState<OpsOrganization | null>(null);
  const [resettingOrg, setResettingOrg] = useState<OpsOrganization | null>(null);
  const [changingOwnerOrg, setChangingOwnerOrg] = useState<OpsOrganization | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const canCreate = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_CREATE);
  const canEdit = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_EDIT);
  const canDelete = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_DELETE);
  const canManage = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE);
  const showCreateButton = canCreate && !['pending_approval', 'suspended', 'archived'].includes(stage);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listOpsOrganizations({ stage: stage || undefined, search: search || undefined, limit: 50 });
      setOrgs(data);
    } finally {
      setLoading(false);
    }
  }, [stage, search]);

  useEffect(() => { load(); }, [load]);

  const handleEditSubmit = async (values: OrgFormValues) => {
    if (!editingOrg) return;
    setSubmitting(true);
    try {
      await updateOpsOrganization(editingOrg.id, buildOrganizationUpdatePayload(values));
      setEditingOrg(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = async (org: OpsOrganization) => {
    setLoadingEditId(org.id);
    try {
      const fullOrg = await getOpsOrganization(org.id);
      setEditingOrg(fullOrg);
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleDelete = async (org: OpsOrganization) => {
    if (!confirm(`Delete "${org.name}"? This cannot be undone from the Operations Portal.`)) return;
    setActionError('');
    try {
      await deleteOpsOrganization(org.id);
      await load();
    } catch (err: any) {
      setActionError(extractActionError(err, `Failed to delete ${org.name}`));
    }
  };

  const handleTransition = async (org: OpsOrganization, toStage: OrgLifecycleStage) => {
    setActionError('');
    try {
      await transitionOpsOrganization(org.id, toStage);
      await load();
    } catch (err: any) {
      setActionError(extractActionError(err, `Failed to move ${org.name} to ${ORG_LIFECYCLE_LABELS[toStage]}`));
    }
  };

  const handleSuspend = async (org: OpsOrganization) => {
    setActionError('');
    try {
      await suspendOpsOrganization(org.id);
      await load();
    } catch (err: any) {
      setActionError(extractActionError(err, `Failed to suspend ${org.name}`));
    }
  };
  const handleActivate = async (org: OpsOrganization) => {
    setActionError('');
    try {
      await activateOpsOrganization(org.id);
      await load();
    } catch (err: any) {
      setActionError(extractActionError(err, `Failed to reactivate ${org.name}`));
    }
  };
  const handleArchive = async (org: OpsOrganization) => {
    setActionError('');
    try {
      await archiveOpsOrganization(org.id);
      await load();
    } catch (err: any) {
      setActionError(extractActionError(err, `Failed to archive ${org.name}`));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
          <p className="text-muted-foreground">
            {stage ? `Filtered: ${ORG_LIFECYCLE_LABELS[stage as OrgLifecycleStage] || stage}` : 'Full customer pipeline'}
          </p>
        </div>
        {showCreateButton && (
          <Link href="/operations/organizations/new">
            <Button className="gap-1.5">
              <Plus className="w-4 h-4" /> New Organization
            </Button>
          </Link>
        )}
      </div>

      <div className="ops-panel p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 ml-1" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, slug, or email…" className="border-0 focus-visible:ring-0" />
        {stage && (
          <Button variant="ghost" size="sm" onClick={() => router.push('/operations/organizations')}>Clear filter</Button>
        )}
      </div>

      {actionError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-3">
            <p>{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError('')}
              className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="ops-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400">Loading…</TableCell></TableRow>
            )}
            {!loading && orgs.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400">No organizations found.</TableCell></TableRow>
            )}
            {!loading && orgs.map((org) => (
              <TableRow
                key={org.id}
                onClick={() => router.push(`/operations/organizations/${org.id}`)}
                className="cursor-pointer hover:bg-muted/40"
              >
                <TableCell>
                  <Link href={`/operations/organizations/${org.id}`} className="font-medium text-slate-800 hover:text-violet-600">
                    {org.name}
                  </Link>
                  <p className="text-xs text-slate-400">{org.slug}</p>
                </TableCell>
                <TableCell><StageBadge stage={org.lifecycle_stage} /></TableCell>
                <TableCell className="text-slate-600 capitalize">{org.status}</TableCell>
                <TableCell className="text-slate-600">{org.primary_email || '—'}</TableCell>
                <TableCell className="text-slate-500">{new Date(org.updated_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                  <RowActions
                    org={org}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canManage={canManage}
                    onEdit={() => handleOpenEdit(org)}
                    onDelete={() => handleDelete(org)}
                    onTransition={(s) => handleTransition(org, s)}
                    onSuspend={() => handleSuspend(org)}
                    onActivate={() => handleActivate(org)}
                    onArchive={() => handleArchive(org)}
                    onChangeOwner={() => setChangingOwnerOrg(org)}
                    onResetAdminPassword={() => setResettingOrg(org)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <OrgFormDialog open={!!editingOrg} onClose={() => setEditingOrg(null)} onSubmit={handleEditSubmit} organization={editingOrg} submitting={submitting} />
      {loadingEditId && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-white px-3 py-2 text-sm text-muted-foreground shadow-lg">
          Loading organization details...
        </div>
      )}
      <ChangeOwnerDialog organization={changingOwnerOrg} onClose={() => setChangingOwnerOrg(null)} onSaved={load} />
      <ResetAdminPasswordDialog organization={resettingOrg} onClose={() => setResettingOrg(null)} onSaved={load} />
    </div>
  );
}
