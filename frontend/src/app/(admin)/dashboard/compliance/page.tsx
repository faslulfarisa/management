'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Building2, FolderLock, Clock3, CalendarClock, AlertTriangle, RefreshCw, Percent, ShieldAlert, Inbox, FileBadge, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth.store';
import { isAtLeast } from '@/lib/hierarchy';
import { complianceDashboardApi } from '@/lib/compliance-api';

const CARD_DEFS = [
  { key: 'company_docs', label: 'Company Documents', icon: Building2, href: '/dashboard/compliance/company-documents', color: 'text-blue-600 bg-blue-50' },
  { key: 'employee_docs', label: 'Employee Documents', icon: FolderLock, href: '/dashboard/compliance/employee-documents', color: 'text-purple-600 bg-purple-50' },
  { key: 'pending_approvals', label: 'Pending Approvals', icon: Inbox, href: '/dashboard/approvals', color: 'text-amber-600 bg-amber-50' },
  { key: 'expiring', label: 'Expiring (90d)', icon: CalendarClock, href: '/dashboard/compliance/expiring', color: 'text-orange-600 bg-orange-50' },
  { key: 'expired', label: 'Expired Documents', icon: AlertTriangle, href: '/dashboard/compliance/expiring', color: 'text-red-600 bg-red-50' },
  { key: 'renewals', label: 'Renewals', icon: RefreshCw, href: '/dashboard/compliance/renewals', color: 'text-orange-600 bg-orange-50' },
  { key: 'compliance_percent', label: 'Compliance %', icon: Percent, href: '/dashboard/compliance/tracker', color: 'text-green-600 bg-green-50', suffix: '%' },
  { key: 'open_audits', label: 'Open Audits', icon: ShieldAlert, href: '/dashboard/compliance/tracker', color: 'text-red-600 bg-red-50' },
  { key: 'pending_employee_uploads', label: 'Pending Employee Uploads', icon: Clock3, href: '/dashboard/compliance/employee-documents', color: 'text-amber-600 bg-amber-50' },
  { key: 'certs_expiring', label: 'Certificates Expiring', icon: FileBadge, href: '/dashboard/compliance/licenses-certifications', color: 'text-blue-600 bg-blue-50' },
];

export default function ComplianceDashboardPage() {
  const { userType } = useAuthStore();
  const isAdmin = isAtLeast(userType, 'admin');
  const [cards, setCards] = useState<Record<string, number>>({});
  const [timeline, setTimeline] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      complianceDashboardApi.getCards(),
      complianceDashboardApi.getExpiryTimeline(),
      isAdmin ? complianceDashboardApi.getAuditActivity(10) : Promise.resolve([]),
    ]).then(([c, t, a]) => { setCards(c); setTimeline(t.slice(0, 8)); setActivity(a); })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compliance Dashboard</h1>
        <p className="text-muted-foreground">Company and employee documents, compliance tracking, and expiry/renewal status at a glance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {CARD_DEFS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.key} href={c.href}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="p-4 space-y-2">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${c.color}`}><Icon className="w-4 h-4" /></span>
                  <p className="text-2xl font-bold">{cards[c.key] ?? 0}{c.suffix || ''}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Expiry Timeline</h3>
              <Link href="/dashboard/compliance/expiring" className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
            </div>
            {timeline.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No documents with an upcoming expiry.</p> : (
              <div className="space-y-2">
                {timeline.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                    <span className="truncate">{d.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{new Date(d.expiry_date).toLocaleDateString('en-IN')}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Recent Audit Activity</h3>
                <Link href="/dashboard/platform/audit-logs" className="text-xs text-primary hover:underline flex items-center gap-1">Full log <ArrowRight className="w-3 h-3" /></Link>
              </div>
              {activity.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No recent activity.</p> : (
                <div className="space-y-2">
                  {activity.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                      <span className="capitalize">{a.action.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground">{a.actor_email || '—'} · {new Date(a.created_at).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
