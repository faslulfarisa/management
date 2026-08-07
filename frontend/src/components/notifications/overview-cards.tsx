'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckSquare, BellRing, AlertTriangle, Activity, Clock, Banknote, Users } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';
import { StatCard } from './shared';

export function OverviewCards() {
  const { data } = useQuery({
    queryKey: ['notifications-overview'],
    queryFn: () => notificationsApi.getOverview(),
    refetchInterval: 60_000,
  });

  const o = data ?? {
    pending_approvals: 0,
    unread_notifications: 0,
    critical_alerts: 0,
    todays_activities: 0,
    attendance_exceptions: 0,
    payroll_alerts: 0,
    employee_lifecycle_events: 0,
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard label="Pending Approvals" value={o.pending_approvals} gradient="card-gradient-blue" icon={CheckSquare} sub="Awaiting your action" />
      <StatCard label="Unread" value={o.unread_notifications} gradient="card-gradient-purple" icon={BellRing} sub={o.unread_notifications > 0 ? 'Action needed' : 'All caught up'} />
      <StatCard label="Critical Alerts" value={o.critical_alerts} gradient="card-gradient-red" icon={AlertTriangle} sub="Active critical notices" />
      <StatCard label="Today's Activity" value={o.todays_activities} gradient="card-gradient-teal" icon={Activity} sub="New notifications today" />
      <StatCard label="Attendance Exceptions" value={o.attendance_exceptions} gradient="card-gradient-amber" icon={Clock} sub="Late, missing, absent & more" />
      <StatCard label="Payroll Alerts" value={o.payroll_alerts} gradient="card-gradient-emerald" icon={Banknote} sub="Bank details, payslips & more" />
      <StatCard label="Employee Events" value={o.employee_lifecycle_events} gradient="card-gradient-indigo" icon={Users} sub="Joiners, exits & transfers" />
    </div>
  );
}
