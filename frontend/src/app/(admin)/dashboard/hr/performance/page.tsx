'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TrendChart } from '@/components/reports/TrendChart';
import { X, Loader2, Target, TrendingUp, RefreshCw, Settings, History, Award, AlertTriangle } from 'lucide-react';

const CYCLE_TYPES = ['quarterly', 'annual', 'probation', 'mid-year'];
const KPI_UNIT_TYPES = ['number', 'percentage', 'currency'];
const RATINGS = ['outstanding', 'exceeds_expectations', 'meets_expectations', 'needs_improvement', 'unsatisfactory'];

/* ── Cycle Drawer ──────────────────────────────────────────────────────── */
function CycleDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', type: 'quarterly', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Cycle name is required';
    if (!form.start_date) e.start_date = 'Start date is required';
    if (!form.end_date) e.end_date = 'End date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/performance/cycles', form);
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to create cycle' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Create Review Cycle</h2>
            <p className="text-xs text-muted-foreground">Define a new performance review period</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Cycle Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Q1 2026" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-red-400' : 'border-border'}`} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border">
              {CYCLE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Start Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.start_date ? 'border-red-400' : 'border-border'}`} />
              {errors.start_date && <p className="text-xs text-red-500 mt-1">{errors.start_date}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">End Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.end_date ? 'border-red-400' : 'border-border'}`} />
              {errors.end_date && <p className="text-xs text-red-500 mt-1">{errors.end_date}</p>}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />} Create Cycle
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── KRA Drawer ────────────────────────────────────────────────────────── */
function KRADrawer({ employees, cycles, onClose, onSaved }: { employees: any[]; cycles: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ employee_id: '', cycle_id: '', title: '', weightage: '', target: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.employee_id) e.employee_id = 'Employee is required';
    if (!form.cycle_id) e.cycle_id = 'Review cycle is required';
    if (!form.title.trim()) e.title = 'Title is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/performance/kras', { ...form, weightage: parseFloat(form.weightage) || 0 });
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to create KRA' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Add KRA</h2>
            <p className="text-xs text-muted-foreground">Define a Key Result Area for an employee</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Employee <span className="text-red-500">*</span></label>
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.employee_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
            {errors.employee_id && <p className="text-xs text-red-500 mt-1">{errors.employee_id}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Review Cycle <span className="text-red-500">*</span></label>
            <select value={form.cycle_id} onChange={e => setForm(f => ({ ...f, cycle_id: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.cycle_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select cycle…</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.cycle_id && <p className="text-xs text-red-500 mt-1">{errors.cycle_id}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Title <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Revenue Growth" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.title ? 'border-red-400' : 'border-border'}`} />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Weightage (%)</label>
              <input type="number" min="0" max="100" value={form.weightage} onChange={e => setForm(f => ({ ...f, weightage: e.target.value }))} placeholder="0" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Target</label>
              <input type="text" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="e.g. ₹50L" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border" />
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />} Add KRA
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── KPI Drawer ────────────────────────────────────────────────────────── */
function KPIDrawer({ employees, cycles, onClose, onSaved }: { employees: any[]; cycles: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ employee_id: '', cycle_id: '', title: '', unit_type: 'number', target_value: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.employee_id) e.employee_id = 'Employee is required';
    if (!form.cycle_id) e.cycle_id = 'Review cycle is required';
    if (!form.title.trim()) e.title = 'Title is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/performance/kpis', { ...form, target_value: parseFloat(form.target_value) || 0 });
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to create KPI' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Add KPI</h2>
            <p className="text-xs text-muted-foreground">Define a Key Performance Indicator</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Employee <span className="text-red-500">*</span></label>
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.employee_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
            {errors.employee_id && <p className="text-xs text-red-500 mt-1">{errors.employee_id}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Review Cycle <span className="text-red-500">*</span></label>
            <select value={form.cycle_id} onChange={e => setForm(f => ({ ...f, cycle_id: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.cycle_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select cycle…</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.cycle_id && <p className="text-xs text-red-500 mt-1">{errors.cycle_id}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Title <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Sales Calls per Month" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.title ? 'border-red-400' : 'border-border'}`} />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Unit Type</label>
              <select value={form.unit_type} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))} className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border">
                {KPI_UNIT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Target Value</label>
              <input type="number" min="0" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} placeholder="0" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border" />
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} Add KPI
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Review Drawer ─────────────────────────────────────────────────────── */
function ReviewDrawer({ employees, cycles, onClose, onSaved }: { employees: any[]; cycles: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ employee_id: '', cycle_id: '', overall_score: '', rating: '', reviewer_comments: '', status: 'submitted' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  useEffect(() => {
    if (!form.employee_id || !form.cycle_id) { setSnapshot(null); return; }
    setLoadingSnapshot(true);
    api.get('/performance/attendance-behaviour/snapshots', { params: { employee_id: form.employee_id, cycle_id: form.cycle_id } })
      .then(res => setSnapshot((res.data.data || [])[0] || null))
      .catch(() => setSnapshot(null))
      .finally(() => setLoadingSnapshot(false));
  }, [form.employee_id, form.cycle_id]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.employee_id) e.employee_id = 'Employee is required';
    if (!form.cycle_id) e.cycle_id = 'Review cycle is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/performance/reviews', { ...form, overall_score: parseFloat(form.overall_score) || null });
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to submit review' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Submit Performance Review</h2>
            <p className="text-xs text-muted-foreground">Record employee review for a cycle</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Employee <span className="text-red-500">*</span></label>
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.employee_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
            {errors.employee_id && <p className="text-xs text-red-500 mt-1">{errors.employee_id}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Review Cycle <span className="text-red-500">*</span></label>
            <select value={form.cycle_id} onChange={e => setForm(f => ({ ...f, cycle_id: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.cycle_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select cycle…</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.cycle_id && <p className="text-xs text-red-500 mt-1">{errors.cycle_id}</p>}
          </div>

          {(loadingSnapshot || snapshot) && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Award className="w-3.5 h-3.5" /> Attendance Behaviour Summary</p>
              {loadingSnapshot ? (
                <p className="text-xs text-muted-foreground">Loading attendance data…</p>
              ) : snapshot ? (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Behaviour Score</p><p className="font-semibold">{snapshot.behaviour_score}</p></div>
                  <div><p className="text-muted-foreground">Attendance %</p><p className="font-semibold">{snapshot.attendance_percentage}%</p></div>
                  <div><p className="text-muted-foreground">Rating</p><p className="font-semibold">{snapshot.behaviour_rating}</p></div>
                  <div><p className="text-muted-foreground">Late Count</p><p className="font-semibold">{snapshot.late_count}</p></div>
                  <div><p className="text-muted-foreground">Unapproved Absence</p><p className="font-semibold">{snapshot.unapproved_absence_days}</p></div>
                  <div><p className="text-muted-foreground">Corrections</p><p className="font-semibold">{snapshot.corrections_count}</p></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No attendance behaviour snapshot yet for this employee/cycle. Calculate attendance for this cycle first.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Overall Score (0–100)</label>
              <input type="number" min="0" max="100" value={form.overall_score} onChange={e => setForm(f => ({ ...f, overall_score: e.target.value }))} placeholder="Auto-computed if left blank" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Rating</label>
              <select value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))} className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border">
                <option value="">Auto-computed…</option>
                {RATINGS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Comments</label>
            <textarea value={form.reviewer_comments} onChange={e => setForm(f => ({ ...f, reviewer_comments: e.target.value }))} rows={3} placeholder="Reviewer comments…" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border resize-none" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} Submit Review
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Override Drawer ──────────────────────────────────────────────────── */
function OverrideDrawer({ review, onClose, onSaved }: { review: any; onClose: () => void; onSaved: () => void }) {
  const [score, setScore] = useState(String(review.attendance_score ?? ''));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!reason.trim()) { setError('An override reason is required'); return; }
    const value = parseFloat(score);
    if (Number.isNaN(value) || value < 0 || value > 100) { setError('Score must be between 0 and 100'); return; }
    setSaving(true);
    try {
      await api.post(`/performance/reviews/${review.id}/override-attendance-score`, { score: value, reason });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to override attendance score');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Override Attendance Score</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Current attendance score: <span className="font-semibold text-foreground">{review.attendance_score ?? '—'}</span>
            {review.attendance_score_overridden && <span> (original: {review.attendance_score_original})</span>}
          </p>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Adjusted Score (0–100) <span className="text-red-500">*</span></label>
            <input type="number" min="0" max="100" value={score} onChange={e => setScore(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Reason <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why is this score being adjusted? (audited)" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>
        <div className="border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Override
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Timeline Drawer ───────────────────────────────────────────────────── */
function TimelineDrawer({ employeeId, cycleId, onClose }: { employeeId: string; cycleId: string; onClose: () => void }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/performance/timeline', { params: { employee_id: employeeId, cycle_id: cycleId } })
      .then(res => setEvents(res.data.data || []))
      .finally(() => setLoading(false));
  }, [employeeId, cycleId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2"><History className="w-4 h-4" /> Performance Timeline</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? <p className="text-sm text-center text-muted-foreground">Loading…</p> : events.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground">No events recorded yet</p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-5">
              {events.map((e, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-primary" />
                  <p className="text-sm font-medium text-foreground">{e.label}</p>
                  <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString('en-IN')}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Configuration Tab ─────────────────────────────────────────────────── */
function ConfigurationTab() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canConfigure = useCan(PERMISSIONS.PERFORMANCE_BEHAVIOUR_CONFIGURE);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/performance/attendance-behaviour/config')
      .then(res => setConfig(res.data.data.config))
      .catch(() => setError('Failed to load configuration'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.put('/performance/attendance-behaviour/config', config);
      setConfig(res.data.data.config);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) return <p className="text-center py-8 text-muted-foreground">Loading configuration…</p>;
  if (!canConfigure) return <p className="text-center py-8 text-muted-foreground">You don't have permission to view this configuration.</p>;

  const weightFields: { key: string; label: string }[] = [
    { key: 'attendancePercentage', label: 'Attendance Percentage' },
    { key: 'punctuality', label: 'Punctuality (Late Count)' },
    { key: 'consistency', label: 'Attendance Consistency' },
    { key: 'halfDayBehaviour', label: 'Half-Day Behaviour' },
    { key: 'unapprovedAbsence', label: 'Unapproved Absence' },
    { key: 'approvedOvertime', label: 'Approved Overtime' },
    { key: 'attendanceCorrections', label: 'Attendance Corrections' },
  ];
  const weightSum = weightFields.reduce((sum, f) => sum + (Number(config.weights[f.key]) || 0), 0);
  const overallSum = ['kra', 'kpi', 'attendanceBehaviour'].reduce((sum, k) => sum + (Number(config.overallWeights[k]) || 0), 0);

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <Card>
        <CardHeader><CardTitle>Attendance Behaviour Weightage</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {weightFields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{f.label} (%)</label>
              <input type="number" min="0" max="100" value={config.weights[f.key]}
                onChange={e => setConfig((c: any) => ({ ...c, weights: { ...c.weights, [f.key]: parseFloat(e.target.value) || 0 } }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          ))}
          <p className={`col-span-full text-xs ${Math.abs(weightSum - 100) > 0.5 ? 'text-red-600' : 'text-muted-foreground'}`}>Total: {weightSum.toFixed(1)}% (must equal 100%)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Overall Performance Weighting</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          {(['kra', 'kpi', 'attendanceBehaviour'] as const).map(k => (
            <div key={k}>
              <label className="text-xs font-medium text-muted-foreground block mb-1 capitalize">{k === 'attendanceBehaviour' ? 'Attendance Behaviour' : k.toUpperCase()} (%)</label>
              <input type="number" min="0" max="100" value={config.overallWeights[k]}
                onChange={e => setConfig((c: any) => ({ ...c, overallWeights: { ...c.overallWeights, [k]: parseFloat(e.target.value) || 0 } }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          ))}
          <p className={`col-span-full text-xs ${Math.abs(overallSum - 100) > 0.5 ? 'text-red-600' : 'text-muted-foreground'}`}>Total: {overallSum.toFixed(1)}% (must equal 100%)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Penalties, Bonuses &amp; Thresholds</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ['latePenaltyPoints', 'Late Penalty (pts/occurrence)'],
            ['lateGraceThreshold', 'Late Grace Count'],
            ['halfDayPenaltyPoints', 'Half-Day Penalty (pts)'],
            ['unapprovedAbsencePenaltyPoints', 'Unapproved Absence Penalty (pts)'],
            ['consistencyPenaltyMultiplier', 'Consistency Penalty Multiplier'],
            ['otCapHours', 'OT Bonus Cap (hrs)'],
            ['correctionPenaltyPoints', 'Correction Penalty (pts)'],
            ['correctionGraceCount', 'Correction Grace Count'],
            ['complianceThresholdPct', 'Compliance Threshold (%)'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
              <input type="number" value={config[key]} onChange={e => setConfig((c: any) => ({ ...c, [key]: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Performance Ratings</CardTitle></CardHeader>
        <CardContent>
          <Table className="text-sm">
            <TableHeader><TableRow>
              <TableHead className="normal-case">Label</TableHead>
              <TableHead className="normal-case">Min</TableHead>
              <TableHead className="normal-case">Max</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {config.ratingBuckets.map((b: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>
                    <input value={b.label} onChange={e => setConfig((c: any) => {
                      const buckets = [...c.ratingBuckets]; buckets[i] = { ...buckets[i], label: e.target.value }; return { ...c, ratingBuckets: buckets };
                    })} className="border border-border rounded-lg px-2 py-1 text-sm w-40" />
                  </TableCell>
                  <TableCell>
                    <input type="number" value={b.min} onChange={e => setConfig((c: any) => {
                      const buckets = [...c.ratingBuckets]; buckets[i] = { ...buckets[i], min: parseFloat(e.target.value) || 0 }; return { ...c, ratingBuckets: buckets };
                    })} className="border border-border rounded-lg px-2 py-1 text-sm w-20" />
                  </TableCell>
                  <TableCell>
                    <input type="number" value={b.max} onChange={e => setConfig((c: any) => {
                      const buckets = [...c.ratingBuckets]; buckets[i] = { ...buckets[i], max: parseFloat(e.target.value) || 0 }; return { ...c, ratingBuckets: buckets };
                    })} className="border border-border rounded-lg px-2 py-1 text-sm w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Settings className="w-4 h-4 mr-2" />}Save Configuration</Button>
      </div>
    </div>
  );
}

/* ── Attendance Behaviour Tab ──────────────────────────────────────────── */
function AttendanceBehaviourTab({ cycles }: { cycles: any[] }) {
  const [cycleId, setCycleId] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cycleId && cycles.length) setCycleId(cycles[0].id);
  }, [cycles, cycleId]);

  useEffect(() => {
    if (!cycleId) return;
    setLoading(true);
    api.get('/performance/attendance-behaviour/summary', { params: { cycle_id: cycleId } })
      .then(res => setSummary(res.data.data))
      .finally(() => setLoading(false));
  }, [cycleId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Review Cycle:</label>
        <select value={cycleId} onChange={e => setCycleId(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm">
          {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading || !summary ? <p className="text-center py-8 text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Average Behaviour Score</p>
              <p className="text-2xl font-bold">{summary.averageScore.toFixed(1)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Average Attendance %</p>
              <p className="text-2xl font-bold">{summary.averageAttendancePct.toFixed(1)}%</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Average Compliance %</p>
              <p className="text-2xl font-bold">{summary.averageCompliancePct.toFixed(1)}%</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Employees Scored</p>
              <p className="text-2xl font-bold">{summary.totalEmployees}</p>
            </CardContent></Card>
          </div>

          {summary.departmentRanking.length > 0 && (
            <TrendChart
              title="Department Ranking — Average Behaviour Score"
              type="bar" xKey="name"
              data={summary.departmentRanking.map((d: any) => ({ name: d.name || 'Unassigned', avg_score: parseFloat(d.avg_score) || 0 }))}
              series={[{ key: 'avg_score', label: 'Avg Score' }]}
            />
          )}
          {summary.branchRanking.length > 0 && (
            <TrendChart
              title="Branch Ranking — Average Behaviour Score"
              type="bar" xKey="name"
              data={summary.branchRanking.map((b: any) => ({ name: b.name || 'Unassigned', avg_score: parseFloat(b.avg_score) || 0 }))}
              series={[{ key: 'avg_score', label: 'Avg Score' }]}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Award className="w-4 h-4 text-green-600" /> Top Performers</CardTitle></CardHeader>
              <CardContent>
                {summary.topPerformers.length === 0 ? <p className="text-sm text-muted-foreground">No data yet</p> : (
                  <ul className="space-y-2">
                    {summary.topPerformers.map((e: any) => (
                      <li key={e.id} className="flex items-center justify-between text-sm">
                        <span>{e.first_name} {e.last_name}</span>
                        <span className="font-semibold">{e.behaviour_score}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="w-4 h-4 text-red-600" /> Needs Attention</CardTitle></CardHeader>
              <CardContent>
                {summary.needsAttention.length === 0 ? <p className="text-sm text-muted-foreground">No data yet</p> : (
                  <ul className="space-y-2">
                    {summary.needsAttention.map((e: any) => (
                      <li key={e.id} className="flex items-center justify-between text-sm">
                        <span>{e.first_name} {e.last_name}</span>
                        <span className="font-semibold text-red-600">{e.behaviour_score}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {summary.mostImproved.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Most Improved Employees</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {summary.mostImproved.map((e: any) => (
                    <li key={e.id} className="flex items-center justify-between text-sm">
                      <span>{e.first_name} {e.last_name}</span>
                      <span className="font-semibold text-green-600">+{parseFloat(e.improvement).toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────── */
export default function PerformancePage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [kras, setKRAs] = useState<any[]>([]);
  const [kpis, setKPIs] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cycles');
  const [showCycleDrawer, setShowCycleDrawer] = useState(false);
  const [showKRADrawer, setShowKRADrawer] = useState(false);
  const [showKPIDrawer, setShowKPIDrawer] = useState(false);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);
  const [overrideReview, setOverrideReview] = useState<any>(null);
  const [timelineTarget, setTimelineTarget] = useState<{ employeeId: string; cycleId: string } | null>(null);
  const [calculating, setCalculating] = useState<string | null>(null);

  const canRecalculate = useCan(PERMISSIONS.PERFORMANCE_BEHAVIOUR_RECALCULATE);
  const canOverride = useCan(PERMISSIONS.PERFORMANCE_BEHAVIOUR_OVERRIDE);
  const canConfigure = useCan(PERMISSIONS.PERFORMANCE_BEHAVIOUR_CONFIGURE);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cyclesRes, krasRes, kpisRes, reviewsRes, employeesRes] = await Promise.all([
        api.get('/performance/cycles'),
        api.get('/performance/kras'),
        api.get('/performance/kpis'),
        api.get('/performance/reviews'),
        api.get('/employees?limit=1000'),
      ]);
      setCycles(cyclesRes.data.data || []);
      setKRAs(krasRes.data.data || []);
      setKPIs(kpisRes.data.data || []);
      setReviews(reviewsRes.data.data || []);
      setEmployees(employeesRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch performance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleUpdateCycle = async (id: string, status: string) => {
    try { await api.put(`/performance/cycles/${id}`, { status }); fetchData(); }
    catch { alert('Failed to update cycle'); }
  };

  const handleCalculateAttendance = async (id: string, recalculate: boolean) => {
    setCalculating(id);
    try {
      await api.post(`/performance/cycles/${id}/${recalculate ? 'recalculate-attendance' : 'calculate-attendance'}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to calculate attendance');
    } finally {
      setCalculating(null);
    }
  };

  const handleApproveReview = async (id: string) => {
    try { await api.put(`/performance/reviews/${id}`, { status: 'approved' }); fetchData(); }
    catch { alert('Failed to approve review'); }
  };

  const handleDeleteKPI = async (id: string) => {
    if (!confirm('Delete this KPI?')) return;
    try { await api.delete(`/performance/kpis/${id}`); fetchData(); }
    catch { alert('Failed to delete KPI'); }
  };

  const activeCycles = cycles.filter(c => c.status === 'active').length;
  const kpisOnTrack = kpis.filter(k => k.status === 'on_track' || k.status === 'achieved').length;
  const reviewsPending = reviews.filter(r => r.status === 'submitted').length;
  const avgScore = reviews.filter(r => r.overall_score).length
    ? reviews.filter(r => r.overall_score).reduce((sum, r) => sum + parseFloat(r.overall_score), 0) / reviews.filter(r => r.overall_score).length
    : 0;

  const cycleStatusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    active: 'bg-green-100 text-green-800',
    approved: 'bg-blue-100 text-blue-800',
    locked: 'bg-purple-100 text-purple-800',
    closed: 'bg-blue-100 text-blue-800',
  };
  const kpiStatusColors: Record<string, string> = {
    on_track: 'bg-green-100 text-green-800',
    achieved: 'bg-blue-100 text-blue-800',
    at_risk: 'bg-yellow-100 text-yellow-800',
    behind: 'bg-red-100 text-red-800',
  };
  const reviewStatusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
  };

  const tabs = [
    { key: 'cycles', label: 'Review Cycles' },
    { key: 'kras', label: 'KRAs' },
    { key: 'kpis', label: 'KPIs' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'attendance-behaviour', label: 'Attendance Behaviour' },
    ...(canConfigure ? [{ key: 'configuration', label: 'Configuration' }] : []),
  ];

  return (
    <>
      {showCycleDrawer && <CycleDrawer onClose={() => setShowCycleDrawer(false)} onSaved={fetchData} />}
      {showKRADrawer && <KRADrawer employees={employees} cycles={cycles} onClose={() => setShowKRADrawer(false)} onSaved={fetchData} />}
      {showKPIDrawer && <KPIDrawer employees={employees} cycles={cycles} onClose={() => setShowKPIDrawer(false)} onSaved={fetchData} />}
      {showReviewDrawer && <ReviewDrawer employees={employees} cycles={cycles} onClose={() => setShowReviewDrawer(false)} onSaved={fetchData} />}
      {overrideReview && <OverrideDrawer review={overrideReview} onClose={() => setOverrideReview(null)} onSaved={fetchData} />}
      {timelineTarget && <TimelineDrawer employeeId={timelineTarget.employeeId} cycleId={timelineTarget.cycleId} onClose={() => setTimelineTarget(null)} />}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Performance</h1>
            <p className="text-muted-foreground">Review cycles, KRAs, KPIs, appraisals, and attendance behaviour</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active Cycles</p>
            <p className="text-2xl font-bold">{activeCycles}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">KPIs On Track</p>
            <p className="text-2xl font-bold text-green-600">{kpisOnTrack}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Reviews Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{reviewsPending}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Average Score</p>
            <p className="text-2xl font-bold">{avgScore.toFixed(1)}</p>
          </CardContent></Card>
        </div>

        <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit flex-wrap">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'cycles' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Review Cycles</CardTitle>
              <Button onClick={() => setShowCycleDrawer(true)}>Create Cycle</Button>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-center py-8">Loading...</p> : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left p-4 font-medium normal-case">Name</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Type</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Start Date</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">End Date</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Status</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Attendance</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cycles.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="p-8 text-center text-muted-foreground">No review cycles created</TableCell></TableRow>
                    ) : cycles.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="p-4 font-medium">{c.name}</TableCell>
                        <TableCell className="p-4 capitalize">{c.type}</TableCell>
                        <TableCell className="p-4">{new Date(c.start_date).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell className="p-4">{new Date(c.end_date).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell className="p-4"><span className={`px-2 py-1 rounded-full text-xs ${cycleStatusColors[c.status] || 'bg-gray-100 text-gray-800'}`}>{c.status}</span></TableCell>
                        <TableCell className="p-4 text-xs text-muted-foreground">
                          {c.attendance_last_calculated_at ? new Date(c.attendance_last_calculated_at).toLocaleString('en-IN') : 'Not calculated'}
                        </TableCell>
                        <TableCell className="p-4 flex gap-2 flex-wrap">
                          {c.status === 'draft' && <Button size="sm" variant="outline" onClick={() => handleUpdateCycle(c.id, 'active')}>Activate</Button>}
                          {c.status === 'active' && <Button size="sm" variant="outline" onClick={() => handleUpdateCycle(c.id, 'approved')}>Approve</Button>}
                          {c.status === 'approved' && <Button size="sm" variant="outline" onClick={() => handleUpdateCycle(c.id, 'locked')}>Lock</Button>}
                          {canRecalculate && c.status === 'active' && (
                            <Button size="sm" variant="outline" disabled={calculating === c.id}
                              onClick={() => handleCalculateAttendance(c.id, !!c.attendance_last_calculated_at)}>
                              {calculating === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              {c.attendance_last_calculated_at ? ' Recalculate' : ' Calculate'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'kras' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Key Result Areas</CardTitle>
              <Button onClick={() => setShowKRADrawer(true)}>Add KRA</Button>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-center py-8">Loading...</p> : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left p-4 font-medium normal-case">Employee</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Cycle</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Title</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">Weightage</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Target</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Achievement</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">Self Score</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">Mgr Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kras.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="p-8 text-center text-muted-foreground">No KRAs defined</TableCell></TableRow>
                    ) : kras.map(k => (
                      <TableRow key={k.id}>
                        <TableCell className="p-4">{k.first_name} {k.last_name}</TableCell>
                        <TableCell className="p-4 text-muted-foreground">{k.cycle_name}</TableCell>
                        <TableCell className="p-4 font-medium">{k.title}</TableCell>
                        <TableCell className="p-4 text-right">{k.weightage}%</TableCell>
                        <TableCell className="p-4 text-muted-foreground">{k.target || '—'}</TableCell>
                        <TableCell className="p-4 text-muted-foreground">{k.achievement || '—'}</TableCell>
                        <TableCell className="p-4 text-right">{k.self_score ?? '—'}</TableCell>
                        <TableCell className="p-4 text-right">{k.manager_score ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'kpis' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Key Performance Indicators</CardTitle>
              <Button onClick={() => setShowKPIDrawer(true)}>Add KPI</Button>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-center py-8">Loading...</p> : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left p-4 font-medium normal-case">Employee</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Cycle</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Title</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Unit</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">Target</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">Actual</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Progress</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Status</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpis.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="p-8 text-center text-muted-foreground">No KPIs defined</TableCell></TableRow>
                    ) : kpis.map(k => {
                      const progress = parseFloat(k.target_value) > 0
                        ? Math.min(100, (parseFloat(k.actual_value || 0) / parseFloat(k.target_value)) * 100)
                        : 0;
                      return (
                        <TableRow key={k.id}>
                          <TableCell className="p-4">{k.first_name} {k.last_name}</TableCell>
                          <TableCell className="p-4 text-muted-foreground">{k.cycle_name}</TableCell>
                          <TableCell className="p-4 font-medium">{k.title}</TableCell>
                          <TableCell className="p-4 capitalize">{k.unit_type}</TableCell>
                          <TableCell className="p-4 text-right">{parseFloat(k.target_value).toLocaleString()}</TableCell>
                          <TableCell className="p-4 text-right">{parseFloat(k.actual_value || 0).toLocaleString()}</TableCell>
                          <TableCell className="p-4">
                            <div className="w-20 h-2 bg-muted rounded-full mb-1">
                              <div className="h-2 bg-primary rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{progress.toFixed(0)}%</span>
                          </TableCell>
                          <TableCell className="p-4"><span className={`px-2 py-1 rounded-full text-xs ${kpiStatusColors[k.status] || 'bg-gray-100 text-gray-800'}`}>{k.status?.replace(/_/g, ' ')}</span></TableCell>
                          <TableCell className="p-4">
                            <Button size="sm" variant="outline" onClick={() => handleDeleteKPI(k.id)}>Delete</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'reviews' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Performance Reviews</CardTitle>
              <Button onClick={() => setShowReviewDrawer(true)}>Submit Review</Button>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-center py-8">Loading...</p> : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left p-4 font-medium normal-case">Employee</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Cycle</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">KRA</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">KPI</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">Attendance</TableHead>
                      <TableHead className="text-right p-4 font-medium normal-case">Overall</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Rating</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Status</TableHead>
                      <TableHead className="text-left p-4 font-medium normal-case">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="p-8 text-center text-muted-foreground">No reviews submitted</TableCell></TableRow>
                    ) : reviews.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="p-4">{r.first_name} {r.last_name}</TableCell>
                        <TableCell className="p-4 text-muted-foreground">{r.cycle_name}</TableCell>
                        <TableCell className="p-4 text-right">{r.kra_score ?? '—'}</TableCell>
                        <TableCell className="p-4 text-right">{r.kpi_score ?? '—'}</TableCell>
                        <TableCell className="p-4 text-right">
                          {r.attendance_score ?? '—'}
                          {r.attendance_score_overridden && <span title="Overridden" className="ml-1 text-amber-600">*</span>}
                        </TableCell>
                        <TableCell className="p-4 text-right font-medium">{r.overall_score ?? '—'}</TableCell>
                        <TableCell className="p-4 capitalize">{r.rating?.replace(/_/g, ' ') || '—'}</TableCell>
                        <TableCell className="p-4"><span className={`px-2 py-1 rounded-full text-xs ${reviewStatusColors[r.status] || 'bg-gray-100 text-gray-800'}`}>{r.status}</span></TableCell>
                        <TableCell className="p-4 flex gap-2 flex-wrap">
                          {r.status === 'submitted' && <Button size="sm" variant="outline" onClick={() => handleApproveReview(r.id)}>Approve</Button>}
                          {canOverride && !r.locked_at && (
                            <Button size="sm" variant="outline" onClick={() => setOverrideReview(r)}>Override</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setTimelineTarget({ employeeId: r.employee_id, cycleId: r.cycle_id })}>
                            <History className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'attendance-behaviour' && <AttendanceBehaviourTab cycles={cycles} />}
        {activeTab === 'configuration' && canConfigure && <ConfigurationTab />}
      </div>
    </>
  );
}
