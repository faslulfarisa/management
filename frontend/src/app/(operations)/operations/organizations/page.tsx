'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, Search, MoreVertical, Pencil, Trash2, ArrowRightCircle, Ban, CheckCircle2, Archive, UserCog,
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
  changeOpsOrganizationOwnership, type OpsOrganization,
} from '@/lib/operations-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { OrgFormDialog, type OrgFormValues } from '@/components/operations/org-form-dialog';

function StageBadge({ stage }: { stage: OrgLifecycleStage }) {
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${ORG_LIFECYCLE_BADGE_CLASSES[stage]}`}>
      {ORG_LIFECYCLE_LABELS[stage]}
    </span>
  );
}

function RowActions({
  org, canEdit, canDelete, canManage, onEdit, onDelete, onTransition, onSuspend, onActivate, onArchive, onChangeOwner,
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
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!canEdit && !canDelete && !canManage) return null;

  const nextStages = ORG_LIFECYCLE_STAGES.filter((s) => canTransitionLifecycleStage(org.lifecycle_stage, s) && s !== 'suspended' && s !== 'archived');

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden py-1">
          {canEdit && (
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {canManage && nextStages.map((s) => (
            <button key={s} onClick={() => { setOpen(false); onTransition(s); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
              <ArrowRightCircle className="w-3.5 h-3.5" /> Move to {ORG_LIFECYCLE_LABELS[s]}
            </button>
          ))}
          {canManage && org.lifecycle_stage !== 'suspended' && (
            <button onClick={() => { setOpen(false); onSuspend(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
              <Ban className="w-3.5 h-3.5" /> Suspend
            </button>
          )}
          {canManage && org.lifecycle_stage === 'suspended' && (
            <button onClick={() => { setOpen(false); onActivate(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
            </button>
          )}
          {canManage && org.lifecycle_stage !== 'archived' && (
            <button onClick={() => { setOpen(false); onArchive(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          )}
          {canManage && (
            <button onClick={() => { setOpen(false); onChangeOwner(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
              <UserCog className="w-3.5 h-3.5" /> Change Owner
            </button>
          )}
          {canDelete && (
            <button onClick={() => { setOpen(false); onDelete(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
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
  const [submitting, setSubmitting] = useState(false);

  const canCreate = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_CREATE);
  const canEdit = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_EDIT);
  const canDelete = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_DELETE);
  const canManage = canOps(internalRole, OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE);

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
      const { lifecycleStage, ...rest } = values;
      await updateOpsOrganization(editingOrg.id, rest);
      setEditingOrg(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (org: OpsOrganization) => {
    if (!confirm(`Delete "${org.name}"? This cannot be undone from the Operations Portal.`)) return;
    await deleteOpsOrganization(org.id);
    await load();
  };

  const handleTransition = async (org: OpsOrganization, toStage: OrgLifecycleStage) => {
    await transitionOpsOrganization(org.id, toStage);
    await load();
  };

  const handleSuspend = async (org: OpsOrganization) => { await suspendOpsOrganization(org.id); await load(); };
  const handleActivate = async (org: OpsOrganization) => { await activateOpsOrganization(org.id); await load(); };
  const handleArchive = async (org: OpsOrganization) => { await archiveOpsOrganization(org.id); await load(); };
  const handleChangeOwner = async (org: OpsOrganization) => {
    const newOwnerUserId = prompt(`User ID to make Org Admin for "${org.name}":`);
    if (!newOwnerUserId) return;
    await changeOpsOrganizationOwnership(org.id, newOwnerUserId.trim());
    await load();
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
        {canCreate && (
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
              <TableRow key={org.id}>
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
                <TableCell className="text-right">
                  <RowActions
                    org={org}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canManage={canManage}
                    onEdit={() => setEditingOrg(org)}
                    onDelete={() => handleDelete(org)}
                    onTransition={(s) => handleTransition(org, s)}
                    onSuspend={() => handleSuspend(org)}
                    onActivate={() => handleActivate(org)}
                    onArchive={() => handleArchive(org)}
                    onChangeOwner={() => handleChangeOwner(org)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <OrgFormDialog open={!!editingOrg} onClose={() => setEditingOrg(null)} onSubmit={handleEditSubmit} organization={editingOrg} submitting={submitting} />
    </div>
  );
}
