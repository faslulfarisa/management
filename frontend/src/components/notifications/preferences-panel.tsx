'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { notificationsApi, NotificationPreference } from '@/lib/notifications-api';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const MODULE_LABELS: Record<string, string> = {
  attendance: 'Attendance',
  payroll: 'Payroll',
  leave: 'Leave',
  approvals: 'Approvals',
  documents: 'Documents & Compliance',
  employee_events: 'Employee Events',
  system_alerts: 'System Alerts',
};

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        disabled ? 'bg-muted cursor-not-allowed opacity-50' : checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function PreferencesPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-preferences'],
    queryFn: () => notificationsApi.getPreferences(),
  });

  const handleToggle = async (pref: NotificationPreference, channel: 'in_app' | 'email' | 'sms', value: boolean) => {
    queryClient.setQueryData<NotificationPreference[]>(['notifications-preferences'], (old) =>
      (old ?? []).map((p) => (p.module === pref.module ? { ...p, [channel]: value } : p)),
    );
    try {
      await notificationsApi.updatePreferences(pref.module, { [channel]: value });
    } finally {
      queryClient.invalidateQueries({ queryKey: ['notifications-preferences'] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const prefs = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Notification Channel Preferences</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Choose how you want to be notified for each module.</p>
      </div>
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="px-5">Module</TableHead>
            <TableHead className="text-center">In-App</TableHead>
            <TableHead className="text-center">Email</TableHead>
            <TableHead className="text-center">SMS</TableHead>
            <TableHead className="text-center">
              WhatsApp <span className="text-[10px] text-muted-foreground/60">(soon)</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prefs.map((pref) => (
            <TableRow key={pref.module}>
              <TableCell className="px-5 font-medium text-foreground">{MODULE_LABELS[pref.module] ?? pref.module}</TableCell>
              <TableCell className="text-center">
                <Toggle checked={pref.in_app} onChange={(v) => handleToggle(pref, 'in_app', v)} />
              </TableCell>
              <TableCell className="text-center">
                <Toggle checked={pref.email} onChange={(v) => handleToggle(pref, 'email', v)} />
              </TableCell>
              <TableCell className="text-center">
                <Toggle checked={pref.sms} onChange={(v) => handleToggle(pref, 'sms', v)} />
              </TableCell>
              <TableCell className="text-center">
                <Toggle checked={false} disabled onChange={() => {}} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
