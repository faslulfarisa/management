'use client';

import { useState, useEffect } from 'react';
import { profileApi } from '@/lib/company-profile-api';
import type { UpdateOperationalConfigPayload, UpdateSecurityConfigPayload } from '@/lib/company-profile-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, RefreshCw, ShieldAlert } from 'lucide-react';

const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MMM DD, YYYY'];

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

type DayKey = typeof DAYS[number]['key'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface WorkWeek {
  [key: string]: boolean;
}

interface LeaveYear {
  start_month: number;
}

export default function OperationsPage() {
  const [timezone,   setTimezone]   = useState('Asia/Kolkata');
  const [currency,   setCurrency]   = useState('INR');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [workWeek,   setWorkWeek]   = useState<WorkWeek>({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
  });
  const [leaveStartMonth, setLeaveStartMonth] = useState(4);
  const [maxFailedLoginAttempts, setMaxFailedLoginAttempts] = useState(5);

  const [loading, setLoading]  = useState(true);
  const [saving,  setSaving]   = useState(false);
  const [saved,   setSaved]    = useState(false);
  const [error,   setError]    = useState<string | null>(null);

  const [securitySaving, setSecuritySaving] = useState(false);
  const [securitySaved,  setSecuritySaved]  = useState(false);
  const [securityError,  setSecurityError]  = useState<string | null>(null);

  useEffect(() => {
    profileApi.get().then((p) => {
      setTimezone(p.timezone ?? 'Asia/Kolkata');
      setCurrency(p.currency ?? 'INR');
      setDateFormat(p.date_format ?? 'DD/MM/YYYY');
      if (p.work_week_config && typeof p.work_week_config === 'object') {
        setWorkWeek(p.work_week_config as WorkWeek);
      }
      if (p.leave_year_config && typeof p.leave_year_config === 'object') {
        const ly = p.leave_year_config as unknown as LeaveYear;
        if (ly.start_month) setLeaveStartMonth(ly.start_month);
      }
      setMaxFailedLoginAttempts(p.max_failed_login_attempts ?? 5);
    }).catch(() => setError('Failed to load profile.')).finally(() => setLoading(false));
  }, []);

  const toggleDay = (key: DayKey) =>
    setWorkWeek((w) => ({ ...w, [key]: !w[key] }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const payload: UpdateOperationalConfigPayload = {
      timezone,
      currency,
      dateFormat,
      workWeekConfig: workWeek,
      leaveYearConfig: { start_month: leaveStartMonth },
    };
    try {
      await profileApi.updateOperations(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecurity = async () => {
    setSecuritySaving(true);
    setSecurityError(null);
    setSecuritySaved(false);
    const payload: UpdateSecurityConfigPayload = {
      maxFailedLoginAttempts,
    };
    try {
      await profileApi.updateSecurity(payload);
      setSecuritySaved(true);
      setTimeout(() => setSecuritySaved(false), 3000);
    } catch {
      setSecurityError('Save failed. Please try again.');
    } finally {
      setSecuritySaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Locale */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Locale &amp; Formatting</h2>

          <Field label="Timezone">
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Asia/Kolkata"
            />
            <p className="text-xs text-muted-foreground mt-1">Use IANA timezone name, e.g. Asia/Kolkata, America/New_York</p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Default Currency">
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="INR"
                maxLength={3}
              />
            </Field>
            <Field label="Date Format">
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Work week */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Work Week</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select the working days for your organisation</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all duration-150 ${
                  workWeek[key]
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leave year */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Leave Year</h2>
            <p className="text-xs text-muted-foreground mt-0.5">The month the leave balance year starts</p>
          </div>
          <Field label="Leave Year Start Month" className="max-w-xs">
            <select
              value={leaveStartMonth}
              onChange={(e) => setLeaveStartMonth(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved successfully</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {/* Account security */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Account Security</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure when user accounts are automatically locked after repeated failed login attempts
              </p>
            </div>
          </div>

          <Field label="Max Failed Login Attempts Before Lockout" className="max-w-xs">
            <Input
              type="number"
              min={3}
              max={10}
              value={maxFailedLoginAttempts}
              onChange={(e) => setMaxFailedLoginAttempts(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be between 3 and 10. After this many consecutive failed login attempts, an account
              is locked and must be reactivated by an administrator. Organization Admin
              accounts are exempt and are never auto-locked.
            </p>
          </Field>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveSecurity} disabled={securitySaving}>
              {securitySaving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {securitySaving ? 'Saving…' : 'Save Changes'}
            </Button>
            {securitySaved && <span className="text-sm text-emerald-600 font-medium">Saved successfully</span>}
            {securityError && <span className="text-sm text-destructive">{securityError}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}
