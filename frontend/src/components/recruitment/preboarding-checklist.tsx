'use client';

import { useState } from 'react';
import {
  BadgeCheck,
  Banknote,
  Calendar,
  CheckCircle2,
  Circle,
  FileCheck2,
  FileText,
  Laptop,
  Loader2,
  Mail,
  MinusCircle,
  Phone,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { preboardingApi, PreboardingChecklist as PreboardingChecklistType } from '@/lib/onboarding-api';

const STATUS_ICON: Record<string, any> = {
  completed: CheckCircle2,
  pending: Circle,
  not_applicable: MinusCircle,
};

const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-600',
  pending: 'text-muted-foreground',
  not_applicable: 'text-gray-400',
};

const WORKSPACE_ITEMS: Record<string, { title: string; description: string; icon: any }> = {
  welcome_communication: { title: 'Joining Checklist', description: 'Welcome note and first-day instructions', icon: BadgeCheck },
  document_collection: { title: 'Document Collection', description: 'Identity, education, experience, and onboarding documents', icon: FileCheck2 },
  bank_details: { title: 'Bank Details', description: 'Payroll account details submitted by candidate', icon: Banknote },
  emergency_contact: { title: 'Emergency Contact', description: 'Primary emergency contact for the employee record', icon: Phone },
  nda_policy_acceptance: { title: 'NDA and Policy Acceptance', description: 'NDA and company policies accepted by candidate', icon: ShieldCheck },
  asset_request: { title: 'Asset Requests', description: 'Laptop, ID card, uniform, access card, or role-specific assets', icon: Laptop },
  account_creation_request: { title: 'Account Creation', description: 'System login and access setup for joining', icon: UserCog },
  joining_schedule: { title: 'Joining Schedule', description: 'Joining date and first-day plan confirmed', icon: Calendar },
};

function progressOf(checklist: PreboardingChecklistType) {
  const total = checklist.items.length || 1;
  const completed = checklist.items.filter((item) => item.status === 'completed' || item.status === 'not_applicable').length;
  return { completed, total, percent: Math.round((completed / total) * 100) };
}

function nextTaskOf(checklist: PreboardingChecklistType) {
  return checklist.items.find((item) => item.status === 'pending') ?? null;
}

export function PreboardingChecklistCard({
  applicationId,
  checklist,
  onSaved,
}: {
  applicationId: string;
  checklist: PreboardingChecklistType;
  onSaved: () => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [joiningDate, setJoiningDate] = useState(checklist.joining_date ? checklist.joining_date.slice(0, 10) : '');
  const [showWelcome, setShowWelcome] = useState(false);
  const [subject, setSubject] = useState('Welcome to the team!');
  const [body, setBody] = useState('We are excited to have you on board. Please complete the preboarding steps shared with you, and let us know if you have any questions ahead of your joining date.');
  const [sending, setSending] = useState(false);

  const progress = progressOf(checklist);
  const nextTask = nextTaskOf(checklist);
  const bankDetails = checklist.bank_details || {};
  const emergencyContact = checklist.emergency_contact || {};

  const cycleStatus = async (key: string, current: string) => {
    const next = current === 'pending' ? 'completed' : current === 'completed' ? 'not_applicable' : 'pending';
    setBusyKey(key);
    try {
      await preboardingApi.updateItem(applicationId, key, { status: next });
      onSaved();
    } finally {
      setBusyKey(null);
    }
  };

  const saveJoiningDate = async () => {
    if (!joiningDate) return;
    setBusyKey('joining_schedule');
    try {
      await preboardingApi.updateJoiningDate(applicationId, joiningDate);
      onSaved();
    } finally {
      setBusyKey(null);
    }
  };

  const sendWelcome = async () => {
    setSending(true);
    try {
      await preboardingApi.sendWelcomeEmail(applicationId, subject, body);
      setShowWelcome(false);
      onSaved();
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">Unified Preboarding Workspace</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {nextTask ? `Next task: ${WORKSPACE_ITEMS[nextTask.key]?.title || nextTask.label}` : 'All required joining tasks are complete.'}
            </p>
          </div>
          <div className="w-full rounded-lg border border-border p-3 lg:w-72">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">Completion Progress</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${checklist.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {progress.percent}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{progress.completed}/{progress.total} tasks complete</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {checklist.items.map((item) => {
            const StatusIcon = STATUS_ICON[item.status] || Circle;
            const config = WORKSPACE_ITEMS[item.key] || { title: item.label, description: item.category, icon: FileText };
            const TileIcon = config.icon;
            return (
              <div key={item.key} className={`rounded-lg border p-3 ${nextTask?.key === item.key ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary">
                      <TileIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{config.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{config.description}</p>
                      {item.completed_at && <p className="mt-1 text-xs text-muted-foreground">Completed {new Date(item.completed_at).toLocaleDateString()}</p>}
                    </div>
                  </div>
                  <StatusIcon className={`mt-1 h-4 w-4 shrink-0 ${STATUS_COLOR[item.status]}`} />
                </div>
                <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                  <button
                    onClick={() => cycleStatus(item.key, item.status)}
                    disabled={busyKey === item.key}
                    className="mt-3 text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted capitalize disabled:opacity-50"
                  >
                    {busyKey === item.key ? <Loader2 className="h-3 w-3 animate-spin" /> : item.status.replace('_', ' ')}
                  </button>
                </Can>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 md:grid-cols-3">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Bank Details</p>
            <p className="mt-1 text-sm text-foreground">{bankDetails.bank_name || '-'} {bankDetails.bank_account_number ? `- ${bankDetails.bank_account_number}` : ''}</p>
            {bankDetails.ifsc_code && <p className="text-xs text-muted-foreground">IFSC: {bankDetails.ifsc_code}</p>}
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Emergency Contact</p>
            <p className="mt-1 text-sm text-foreground">{emergencyContact.name || '-'} {emergencyContact.relationship ? `(${emergencyContact.relationship})` : ''}</p>
            {emergencyContact.phone && <p className="text-xs text-muted-foreground">{emergencyContact.phone}</p>}
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">NDA and Policies</p>
            {checklist.nda_accepted_at ? (
              <p className="mt-1 text-sm text-foreground">Accepted {new Date(checklist.nda_accepted_at).toLocaleDateString()}</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Waiting for candidate acceptance</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Joining Date</label>
            <input type="date" value={joiningDate} onChange={(event) => setJoiningDate(event.target.value)} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
          </div>
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            <button onClick={saveJoiningDate} disabled={busyKey === 'joining_schedule' || !joiningDate} className="border border-border rounded-lg px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">Save Joining Schedule</button>
          </Can>
        </div>

        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          {!showWelcome ? (
            <button onClick={() => setShowWelcome(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
              <Mail className="w-3.5 h-3.5" /> Send Welcome Email
            </button>
          ) : (
            <div className="space-y-2 rounded-lg bg-muted/30 p-3">
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} placeholder="Message" className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
              <div className="flex gap-2">
                <button onClick={sendWelcome} disabled={sending || !subject.trim() || !body.trim()} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
                  {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Send
                </button>
                <button onClick={() => setShowWelcome(false)} className="border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
              </div>
            </div>
          )}
        </Can>
      </CardContent>
    </Card>
  );
}
