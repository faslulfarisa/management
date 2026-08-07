'use client';

import { useEffect, useState } from 'react';
import {
  Building2, Sparkles, FileQuestion, Hourglass, Rocket, BadgeCheck, ShieldOff, Archive, LifeBuoy,
} from 'lucide-react';
import { OpStatCard } from '@/components/biometrics/ui/op-stat-card';
import { getOpsDashboardStats, type OpsDashboardStats } from '@/lib/operations-api';

export default function OperationsDashboardPage() {
  const [stats, setStats] = useState<OpsDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOpsDashboardStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Dashboard</h1>
        <p className="text-muted-foreground">Customer organization management at a glance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <OpStatCard title="Total Organizations" value={loading ? '—' : stats?.totalOrganizations ?? 0} icon={Building2} variant="blue" />
        <OpStatCard title="New Registrations (30d)" value={loading ? '—' : stats?.newRegistrations ?? 0} icon={Sparkles} variant="purple" />
        <OpStatCard title="Pending Review" value={loading ? '—' : stats?.pendingReview ?? 0} icon={FileQuestion} variant="warn" />
        <OpStatCard title="Pending Approval" value={loading ? '—' : stats?.pendingApproval ?? 0} icon={Hourglass} variant="warn" />
        <OpStatCard title="Onboarding" value={loading ? '—' : stats?.onboarding ?? 0} icon={Rocket} variant="blue" />
        <OpStatCard title="Active Customers" value={loading ? '—' : stats?.activeCustomers ?? 0} icon={BadgeCheck} variant="ok" />
        <OpStatCard title="Suspended" value={loading ? '—' : stats?.suspendedCustomers ?? 0} icon={ShieldOff} variant="danger" />
        <OpStatCard title="Archived" value={loading ? '—' : stats?.archivedOrganizations ?? 0} icon={Archive} variant="default" />
        <OpStatCard
          title="Open Support Tickets"
          value={stats?.openSupportTickets ?? 'Coming soon'}
          sub={stats?.openSupportTickets === null ? 'No ticketing system yet' : undefined}
          icon={LifeBuoy}
          variant="default"
        />
      </div>
    </div>
  );
}
