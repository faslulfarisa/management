'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Globe,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react';
import {
  ORG_LIFECYCLE_LABELS, ORG_LIFECYCLE_BADGE_CLASSES, type OrgLifecycleStage,
} from '@/lib/organization-lifecycle';
import {
  getOpsOrganization,
  getOpsOrganizationActivity,
  listOpsOrganizationMembers,
  type OpsOrganization,
  type OpsOrganizationMember,
} from '@/lib/operations-api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const VISIBLE_STAGES: OrgLifecycleStage[] = ['pending_review', 'pending_approval', 'onboarding', 'active'];

function LifecycleStepper({ current }: { current: OrgLifecycleStage }) {
  if (current === 'suspended' || current === 'archived') {
    return (
      <span className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full border ${ORG_LIFECYCLE_BADGE_CLASSES[current]}`}>
        {ORG_LIFECYCLE_LABELS[current]}
      </span>
    );
  }

  const currentIdx = VISIBLE_STAGES.indexOf(current);

  return (
    <div className="flex items-center overflow-x-auto">
      {VISIBLE_STAGES.map((stage, idx) => {
        const reached = idx <= currentIdx;
        return (
          <div key={stage} className="flex items-center shrink-0">
            <div className={`flex flex-col items-center gap-1 ${idx > 0 ? 'ml-2' : ''}`}>
              <div className={`w-2.5 h-2.5 rounded-full ${reached ? 'ops-accent-bg' : 'bg-slate-200'}`} />
              <span className={`text-[10px] font-medium whitespace-nowrap ${reached ? 'text-slate-700' : 'text-slate-400'}`}>
                {ORG_LIFECYCLE_LABELS[stage]}
              </span>
            </div>
            {idx < VISIBLE_STAGES.length - 1 && (
              <div className={`w-8 h-px mt-[-14px] ${idx < currentIdx ? 'bg-violet-400' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="ops-panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
        {icon && <span className="text-slate-400">{icon}</span>}
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: ReactNode }) {
  const displayValue = value === null || value === undefined || value === '' ? '-' : value;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 text-sm text-slate-700">{displayValue}</div>
    </div>
  );
}

function displayMemberName(member: OpsOrganizationMember) {
  const employeeName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
  return member.full_name || employeeName || member.email;
}

function formatAddress(address?: Record<string, string> | null) {
  if (!address) return '-';
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code || address.pincode,
    address.country,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : '-';
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function UserBadge({ member }: { member: OpsOrganizationMember }) {
  if (member.is_current_admin) {
    return <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">Org Admin</span>;
  }
  if (member.is_org_admin || member.user_type === 'org_admin') {
    return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Admin</span>;
  }
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">Member</span>;
}

export default function OperationsOrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [org, setOrg] = useState<OpsOrganization | null>(null);
  const [members, setMembers] = useState<OpsOrganizationMember[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError('');
    setActivity([]);
    setActivityLoaded(false);
    setActivityError('');
    Promise.all([
      getOpsOrganization(id),
      listOpsOrganizationMembers(id),
    ])
      .then(([orgData, memberData]) => {
        setOrg(orgData);
        setMembers(memberData || []);
      })
      .catch((err: any) => {
        setError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to load organization details');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const orgAdmin = useMemo(() => members.find((member) => member.is_current_admin) || null, [members]);
  const admins = useMemo(
    () => members.filter((member) => member.is_current_admin || member.is_org_admin || member.user_type === 'org_admin'),
    [members],
  );

  const loadActivity = async () => {
    if (!id || activityLoading) return;

    setActivityLoading(true);
    setActivityError('');
    try {
      const activityData = await getOpsOrganizationActivity(id, { limit: 30 });
      setActivity(activityData.data || []);
      setActivityLoaded(true);
    } catch (err: any) {
      setActivityError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to load activity');
    } finally {
      setActivityLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-400">Loading...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/operations/organizations')} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Organizations
        </Button>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (!org) {
    return <div className="text-center py-20 text-slate-400">Organization not found.</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/operations/organizations')} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Organizations
      </Button>

      <div className="ops-panel p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{org.name}</h1>
              <p className="text-sm text-slate-400">{org.legal_name || org.slug}</p>
            </div>
          </div>
          <LifecycleStepper current={org.lifecycle_stage} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Mail className="w-4 h-4 text-slate-400" /> {org.primary_email || '-'}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Phone className="w-4 h-4 text-slate-400" /> {org.phone_number || '-'}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Tag className="w-4 h-4 text-slate-400" /> {org.industry || '-'}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Users className="w-4 h-4 text-slate-400" /> {members.length} user{members.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Panel title="Organization Details" icon={<Building2 className="h-4 w-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Detail label="Display Name" value={org.name} />
              <Detail label="Legal Name" value={org.legal_name} />
              <Detail label="Trade Name" value={org.trade_name} />
              <Detail label="Slug" value={org.slug} />
              <Detail label="Company Code" value={org.company_code} />
              <Detail label="Company Type" value={org.company_type?.replace(/_/g, ' ')} />
              <Detail label="Registration No." value={org.registration_number} />
              <Detail label="GSTIN" value={org.gstin} />
              <Detail label="PAN" value={org.pan_number} />
              <Detail label="CIN" value={org.cin_number} />
              <Detail label="Employees" value={org.estimated_employee_count} />
              <Detail label="Branches" value={org.estimated_branch_count} />
            </div>
          </Panel>

          <Panel title="Contact & Address" icon={<MapPin className="h-4 w-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Detail label="Primary Email" value={org.primary_email} />
              <Detail label="Support Email" value={org.support_email} />
              <Detail label="Primary Phone" value={org.phone_number} />
              <Detail label="Alternate Phone" value={org.alternate_phone} />
              <Detail label="Website" value={org.website_url} />
              <Detail label="Contact Person" value={org.contact_person_name} />
              <Detail label="Designation" value={org.contact_designation} />
              <Detail label="Contact Email" value={org.contact_person_email} />
              <Detail label="Contact Mobile" value={org.contact_person_mobile} />
              <Detail label="Registered Address" value={formatAddress(org.registered_address)} />
              <Detail label="Operational Address" value={formatAddress(org.operational_address)} />
            </div>
          </Panel>

          <Panel title="Admins & Members" icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-md border border-violet-100 bg-violet-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Organization Admin</p>
                {orgAdmin ? (
                  <div className="mt-2">
                    <p className="font-semibold text-slate-800">{displayMemberName(orgAdmin)}</p>
                    <p className="text-sm text-slate-500">{orgAdmin.email}</p>
                    <p className="text-xs text-slate-500">{[orgAdmin.employee_code, orgAdmin.department].filter(Boolean).join(' - ') || 'Assigned admin'}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No assigned organization admin.</p>
                )}
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admins</p>
                <p className="mt-2 text-2xl font-semibold text-slate-800">{admins.length}</p>
                <p className="text-sm text-slate-500">Users with organization admin access</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-slate-400">No members found.</TableCell>
                    </TableRow>
                  )}
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <p className="font-medium text-slate-800">{displayMemberName(member)}</p>
                        <p className="text-xs text-slate-400">{member.email}</p>
                      </TableCell>
                      <TableCell><UserBadge member={member} /></TableCell>
                      <TableCell className="text-slate-600">{[member.position_name, member.department].filter(Boolean).join(' - ') || '-'}</TableCell>
                      <TableCell className={member.is_active ? 'text-emerald-600' : 'text-slate-400'}>{member.is_active ? 'Active' : 'Inactive'}</TableCell>
                      <TableCell className="text-slate-500">{formatDate(member.membership_created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Locale & Settings" icon={<Globe className="h-4 w-4" />}>
            <div className="space-y-4">
              <Detail label="Timezone" value={org.timezone} />
              <Detail label="Currency" value={[org.currency, org.currency_symbol].filter(Boolean).join(' - ')} />
              <Detail label="Fiscal Year Start" value={org.fiscal_year_start ? `Month ${org.fiscal_year_start}` : '-'} />
              <Detail label="Date Format" value={org.date_format} />
              <Detail label="Employee Code" value={[org.emp_code_prefix, org.emp_code_digits ? `${org.emp_code_digits} digits` : null].filter(Boolean).join(' - ')} />
              <Detail label="Failed Login Limit" value={org.max_failed_login_attempts} />
            </div>
          </Panel>

          <Panel title="Lifecycle" icon={<CalendarClock className="h-4 w-4" />}>
            <div className="space-y-4">
              <Detail label="Stage" value={ORG_LIFECYCLE_LABELS[org.lifecycle_stage]} />
              <Detail label="Status" value={<span className="capitalize">{org.status}</span>} />
              <Detail label="Approval Status" value={<span className="capitalize">{org.approval_status?.replace(/_/g, ' ')}</span>} />
              <Detail label="Created" value={formatDate(org.created_at)} />
              <Detail label="Updated" value={formatDate(org.updated_at)} />
            </div>
          </Panel>

        </div>
      </div>

      <Panel title="Activity" icon={<CalendarClock className="h-4 w-4" />}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Organization activity trail</p>
            <p className="text-sm text-slate-400">Load recent audit events only when you need to inspect them.</p>
          </div>
          <Button type="button" variant="outline" onClick={loadActivity} disabled={activityLoading}>
            {activityLoading ? 'Loading...' : activityLoaded ? 'Refresh Activity' : 'Load Activity'}
          </Button>
        </div>

        {activityError && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {activityError}
          </div>
        )}

        {!activityLoaded && !activityLoading && !activityError && (
          <div className="mt-5 rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-400">
            Activity is not loaded yet.
          </div>
        )}

        {activityLoaded && activity.length === 0 && (
          <p className="mt-5 text-sm text-slate-400">No recorded activity yet.</p>
        )}

        {activityLoaded && activity.length > 0 && (
          <ul className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 rounded-md border border-slate-100 bg-white px-3 py-2 text-sm">
                <div className="w-1.5 h-1.5 rounded-full ops-accent-bg mt-1.5 shrink-0" />
                <div>
                  <p className="text-slate-700 font-medium capitalize">{String(entry.action).replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
