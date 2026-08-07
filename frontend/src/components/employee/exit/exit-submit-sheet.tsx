'use client';

import { useState } from 'react';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { employeeApi } from '@/lib/employee-api';
import { EXIT_REQUEST_TYPE_LABELS } from '@/types/exit';

export function ExitSubmitSheet({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const [form, setForm] = useState({ request_type: 'resignation', reason: '', notice_period_days: 30, requested_date: '', last_working_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await employeeApi.submitExitRequest({
        request_type: form.request_type,
        reason: form.reason,
        notice_period_days: form.notice_period_days,
        requested_date: form.requested_date,
        last_working_date: form.last_working_date || undefined,
      });
      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to submit resignation request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()}>
      <BottomSheetContent title="Submit Resignation">
        <form onSubmit={submit} className="px-5 pb-6 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {Object.entries(EXIT_REQUEST_TYPE_LABELS)
                .filter(([v]) => v !== 'absconding' && v !== 'termination')
                .map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Reason</label>
            <Input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Notice Period (days)</label>
              <Input type="number" value={form.notice_period_days} onChange={(e) => setForm({ ...form, notice_period_days: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Requested Date</label>
              <Input type="date" required value={form.requested_date} onChange={(e) => setForm({ ...form, requested_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Preferred Last Working Date (optional)</label>
            <Input type="date" value={form.last_working_date} onChange={(e) => setForm({ ...form, last_working_date: e.target.value })} />
          </div>
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Submitting...' : 'Submit Resignation'}</Button>
        </form>
      </BottomSheetContent>
    </BottomSheet>
  );
}
