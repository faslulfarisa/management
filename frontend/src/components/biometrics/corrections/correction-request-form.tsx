'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { correctionsApi } from '@/lib/biometrics-api';
import { cn } from '@/lib/utils';
import { Send, ChevronDown, ChevronUp } from 'lucide-react';

const inputClass =
  'w-full bg-white border border-slate-200 text-slate-700 text-xs rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-slate-400';

export function CorrectionRequestForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    attendance_record_id: '',
    correction_type: 'clock_in',
    requested_clock_in: '',
    requested_clock_out: '',
    reason: '',
  });
  const [success, setSuccess] = useState(false);
  const qc = useQueryClient();

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      correctionsApi.create({
        attendance_record_id: form.attendance_record_id,
        correction_type: form.correction_type,
        requested_clock_in: form.requested_clock_in || undefined,
        requested_clock_out: form.requested_clock_out || undefined,
        reason: form.reason,
      }),
    onSuccess: () => {
      setSuccess(true);
      setForm({ attendance_record_id: '', correction_type: 'clock_in', requested_clock_in: '', requested_clock_out: '', reason: '' });
      qc.invalidateQueries({ queryKey: ['biometrics', 'corrections'] });
      onSubmitted?.();
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  return (
    <div className="ops-panel overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors"
      >
        <span>Submit New Correction Request</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="px-4 pb-4 space-y-3 border-t border-slate-100"
        >
          <div className="pt-3 space-y-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest block">Attendance Record ID</label>
            <input
              placeholder="UUID of the attendance record"
              value={form.attendance_record_id}
              onChange={(e) => set('attendance_record_id', e.target.value)}
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest block">Correction Type</label>
            <select
              value={form.correction_type}
              onChange={(e) => set('correction_type', e.target.value)}
              className={cn(inputClass, 'cursor-pointer')}
            >
              <option value="clock_in">Clock In</option>
              <option value="clock_out">Clock Out</option>
              <option value="both">Both</option>
            </select>
          </div>

          {(form.correction_type === 'clock_in' || form.correction_type === 'both') && (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest block">Requested Clock In</label>
              <input
                type="datetime-local"
                value={form.requested_clock_in}
                onChange={(e) => set('requested_clock_in', e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {(form.correction_type === 'clock_out' || form.correction_type === 'both') && (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest block">Requested Clock Out</label>
              <input
                type="datetime-local"
                value={form.requested_clock_out}
                onChange={(e) => set('requested_clock_out', e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest block">Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              rows={3}
              required
              placeholder="Why is this correction needed?"
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-red-600">
              {(mutation.error as any)?.response?.data?.error ?? 'Submission failed'}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-600">Correction submitted successfully.</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            {mutation.isPending ? 'Submitting…' : 'Submit Correction'}
          </button>
        </form>
      )}
    </div>
  );
}
