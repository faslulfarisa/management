'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';
import { TabBar } from '@/components/notifications/shared';
import { OverviewCards } from '@/components/notifications/overview-cards';
import { AllNotificationsTab } from '@/components/notifications/all-notifications-tab';
import { ActionRequiredTab } from '@/components/notifications/action-required-tab';
import { AttendanceAlertsTab } from '@/components/notifications/attendance-alerts-tab';
import { PayrollAlertsTab } from '@/components/notifications/payroll-alerts-tab';
import { EmployeeEventsTab } from '@/components/notifications/employee-events-tab';
import { DocumentsComplianceTab } from '@/components/notifications/documents-compliance-tab';
import { SystemAlertsTab } from '@/components/notifications/system-alerts-tab';
import { PreferencesPanel } from '@/components/notifications/preferences-panel';

const VALID_TABS = [
  'all', 'action-required', 'attendance-alerts', 'payroll-alerts',
  'employee-events', 'documents-compliance', 'system-alerts', 'preferences',
];

export default function NotificationCenterPage() {
  return (
    <Suspense fallback={null}>
      <NotificationCenterContent />
    </Suspense>
  );
}

function NotificationCenterContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = searchParams?.get('tab') ?? '';
  const [activeTab, setActiveTab] = useState(VALID_TABS.includes(initialTab) ? initialTab : 'all');

  const { data: overview } = useQuery({
    queryKey: ['notifications-overview'],
    queryFn: () => notificationsApi.getOverview(),
    refetchInterval: 60_000,
  });

  const { data: unread } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 60_000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-overview'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-attendance-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-payroll-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-employee-events'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-documents-compliance'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-system-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-preferences'] });
    queryClient.invalidateQueries({ queryKey: ['approvals-inbox'] });
    queryClient.invalidateQueries({ queryKey: ['approvals-count'] });
  };

  const tabs = [
    { key: 'all', label: 'All Notifications', badge: unread?.count },
    { key: 'action-required', label: 'Action Required', badge: overview?.pending_approvals },
    { key: 'attendance-alerts', label: 'Attendance Alerts' },
    { key: 'payroll-alerts', label: 'Payroll Alerts' },
    { key: 'employee-events', label: 'Employee Events' },
    { key: 'documents-compliance', label: 'Documents & Compliance' },
    { key: 'system-alerts', label: 'System Alerts' },
    { key: 'preferences', label: 'Preferences' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Notification Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Notifications & Workflows</p>
        </div>
        <button onClick={handleRefresh} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <OverviewCards />

      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'all' && <AllNotificationsTab />}
      {activeTab === 'action-required' && <ActionRequiredTab />}
      {activeTab === 'attendance-alerts' && <AttendanceAlertsTab />}
      {activeTab === 'payroll-alerts' && <PayrollAlertsTab />}
      {activeTab === 'employee-events' && <EmployeeEventsTab />}
      {activeTab === 'documents-compliance' && <DocumentsComplianceTab />}
      {activeTab === 'system-alerts' && <SystemAlertsTab />}
      {activeTab === 'preferences' && <PreferencesPanel />}
    </div>
  );
}
