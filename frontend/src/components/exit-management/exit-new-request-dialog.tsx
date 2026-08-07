'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exitApi } from '@/lib/exit-api';
import { EXIT_REQUEST_TYPE_LABELS } from '@/types/exit';

export function ExitNewRequestDialog({ open, employees, onClose, onCreated }: {
  open: boolean;
  employees: Array<{ id: string; first_name: string; last_name: string; employee_code: string; status: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    employee_id: '', request_type: 'resignation', reason: '',
    notice_period_days: 30, requested_date: '', last_working_date: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await exitApi.createRequest(form);
      onCreated();
      onClose();
      setForm({ employee_id: '', request_type: 'resignation', reason: '', notice_period_days: 30, requested_date: '', last_working_date: '' });
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.response?.data?.error || 'Failed to create exit request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Exit Request</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <select
            required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select Employee</option>
            {employees.filter((e) => e.status === 'active').map((e) => (
              <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</option>
            ))}
          </select>
          <select
            value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            {Object.entries(EXIT_REQUEST_TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <Input placeholder="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
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
            <label className="text-xs text-muted-foreground">Last Working Date (optional — auto-calculated from notice period if left blank)</label>
            <Input type="date" value={form.last_working_date} onChange={(e) => setForm({ ...form, last_working_date: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit Request'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
