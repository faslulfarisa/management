'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { interviewsApi, Interview } from '@/lib/interviews-api';

interface UserOption { id: string; first_name?: string; last_name?: string; email: string }

/** Shared schedule/reschedule drawer — used by both the Pipeline application detail page and the standalone Interviews tab. */
export function InterviewDrawer({
  applicationId, rescheduling, onClose, onSaved,
}: {
  applicationId?: string;
  rescheduling?: Interview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [form, setForm] = useState({
    round_type: rescheduling?.round_type || 'technical',
    round_number: String(rescheduling?.round_number || 1),
    interview_type: rescheduling?.interview_type || 'video',
    scheduled_at: rescheduling?.scheduled_at ? rescheduling.scheduled_at.slice(0, 16) : '',
    duration_minutes: String(rescheduling?.duration_minutes || 60),
    location: rescheduling?.location || '',
    meeting_link: rescheduling?.meeting_link || '',
    notes: '',
  });
  const [panelMemberIds, setPanelMemberIds] = useState<string[]>(rescheduling?.panel_member_ids || []);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/users', { params: { limit: 100 } }).then((r) => setUsers(r.data.data)); }, []);

  const togglePanelMember = (id: string) => {
    setPanelMemberIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const save = async () => {
    if (!form.scheduled_at) { setError('Date & time is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (rescheduling) {
        await interviewsApi.reschedule(rescheduling.id, new Date(form.scheduled_at).toISOString(), reason || undefined);
      } else if (applicationId) {
        await interviewsApi.schedule({
          application_id: applicationId,
          round_type: form.round_type, round_number: parseInt(form.round_number, 10) || 1,
          interview_type: form.interview_type, scheduled_at: new Date(form.scheduled_at).toISOString(),
          duration_minutes: parseInt(form.duration_minutes, 10) || 60,
          location: form.location || undefined, meeting_link: form.meeting_link || undefined,
          panel_member_ids: panelMemberIds, notes: form.notes || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save interview');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{rescheduling ? 'Reschedule Interview' : 'Schedule Interview'}</h2>
            <p className="text-xs text-muted-foreground">{rescheduling ? 'Pick a new date & time' : 'Set up a candidate interview round'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          {!rescheduling && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Round Type</label>
                  <select value={form.round_type} onChange={(e) => setForm((f) => ({ ...f, round_type: e.target.value as typeof f.round_type }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
                    {['technical', 'hr', 'managerial', 'final', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Round #</label>
                  <input type="number" min="1" value={form.round_number} onChange={(e) => setForm((f) => ({ ...f, round_number: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Mode</label>
                <select value={form.interview_type} onChange={(e) => setForm((f) => ({ ...f, interview_type: e.target.value as typeof f.interview_type }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
                  <option value="phone">Phone</option>
                  <option value="video">Video</option>
                  <option value="in_person">In Person</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Date & Time <span className="text-red-500">*</span></label>
            <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          {rescheduling ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Reason (optional)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Duration (min)</label>
                  <input type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Location / Link</label>
                  <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Room 3 or meet.google.com/…" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Panel Members</label>
                <div className="border border-border rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded-lg hover:bg-muted cursor-pointer">
                      <input type="checkbox" checked={panelMemberIds.includes(u.id)} onChange={() => togglePanelMember(u.id)} />
                      {u.first_name ? `${u.first_name} ${u.last_name}` : u.email}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-border rounded-xl px-3 py-2 text-sm resize-none" placeholder="Add any instructions or notes for the interviewer(s)…" />
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} {rescheduling ? 'Reschedule' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
