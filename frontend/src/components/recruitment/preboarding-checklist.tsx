'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, MinusCircle, Loader2, Mail, FileText } from 'lucide-react';
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

export function PreboardingChecklistCard({
  applicationId, checklist, onSaved,
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

  const cycleStatus = async (key: string, current: string) => {
    const next = current === 'pending' ? 'completed' : current === 'completed' ? 'not_applicable' : 'pending';
    setBusyKey(key);
    try { await preboardingApi.updateItem(applicationId, key, { status: next }); onSaved(); } finally { setBusyKey(null); }
  };

  const saveJoiningDate = async () => {
    if (!joiningDate) return;
    setBusyKey('joining_schedule');
    try { await preboardingApi.updateJoiningDate(applicationId, joiningDate); onSaved(); } finally { setBusyKey(null); }
  };

  const sendWelcome = async () => {
    setSending(true);
    try { await preboardingApi.sendWelcomeEmail(applicationId, subject, body); setShowWelcome(false); onSaved(); } finally { setSending(false); }
  };

  const bd = checklist.bank_details || {};
  const ec = checklist.emergency_contact || {};

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Preboarding Checklist</h3>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${checklist.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {checklist.status.replace('_', ' ')}
          </span>
        </div>

        <div className="space-y-1.5">
          {checklist.items.map((item) => {
            const Icon = STATUS_ICON[item.status] || Circle;
            return (
              <div key={item.key} className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 shrink-0 ${STATUS_COLOR[item.status]}`} />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    {item.completed_at && <p className="text-xs text-muted-foreground">Completed {new Date(item.completed_at).toLocaleDateString()}</p>}
                  </div>
                </div>
                <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                  <button
                    onClick={() => cycleStatus(item.key, item.status)}
                    disabled={busyKey === item.key}
                    className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted capitalize disabled:opacity-50"
                  >
                    {busyKey === item.key ? <Loader2 className="w-3 h-3 animate-spin" /> : item.status.replace('_', ' ')}
                  </button>
                </Can>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Bank Details</p>
            <p className="text-sm">{bd.bank_name || '—'} {bd.bank_account_number ? `• ${bd.bank_account_number}` : ''}</p>
            {bd.ifsc_code && <p className="text-xs text-muted-foreground">IFSC: {bd.ifsc_code}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Emergency Contact</p>
            <p className="text-sm">{ec.name || '—'} {ec.relationship ? `(${ec.relationship})` : ''}</p>
            {ec.phone && <p className="text-xs text-muted-foreground">{ec.phone}</p>}
          </div>
        </div>

        {checklist.nda_accepted_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> NDA & policies accepted {new Date(checklist.nda_accepted_at).toLocaleString()}</p>
        )}

        <div className="flex items-end gap-2 pt-2 border-t border-border">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Joining Date</label>
            <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
          </div>
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            <button onClick={saveJoiningDate} disabled={busyKey === 'joining_schedule' || !joiningDate} className="border border-border rounded-lg px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">Save</button>
          </Can>
        </div>

        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          {!showWelcome ? (
            <button onClick={() => setShowWelcome(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
              <Mail className="w-3.5 h-3.5" /> Send Welcome Email
            </button>
          ) : (
            <div className="space-y-2 bg-muted/30 rounded-xl p-3">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Message" className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
              <div className="flex gap-2">
                <button onClick={sendWelcome} disabled={sending || !subject.trim() || !body.trim()} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
                  {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Send
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
