'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Loader2, TrendingUp, Plus } from 'lucide-react';

const commonMetrics = [
  'headcount', 'attendance_rate', 'leave_utilization', 'turnover_rate',
  'revenue_per_employee', 'expense_ratio', 'guest_satisfaction',
  'occupancy_rate', 'avg_room_rate', 'revpar',
];

/* ── Record KPI Drawer ────────────────────────────────────────────────── */
function RecordKpiDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ metric: '', value: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.metric) e.metric = 'Please select a metric';
    if (!form.value || isNaN(parseFloat(form.value))) e.value = 'Enter a valid numeric value';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/dashboard/kpi', { metric: form.metric, value: parseFloat(form.value) });
      onSaved(); onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to record KPI' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div><h2 className="text-base font-bold text-foreground">Record KPI Value</h2><p className="text-xs text-muted-foreground">Log a key performance indicator reading</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Metric <span className="text-red-500">*</span></label>
            <select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.metric ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select metric…</option>
              {commonMetrics.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
            {errors.metric && <p className="text-xs text-red-500 mt-1">{errors.metric}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Value <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="Enter numeric value" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.value ? 'border-red-400' : 'border-border'}`} />
            {errors.value && <p className="text-xs text-red-500 mt-1">{errors.value}</p>}
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} Record KPI
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KpiPage() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('');

  const fetchKpis = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        commonMetrics.map(m => api.get(`/dashboard/kpi/${m}`, { params: { days: 30 } }).catch(() => ({ data: { data: [] } })))
      );
      const data = commonMetrics.map((m, i) => ({
        metric: m,
        history: results[i].data.data || [],
        latest: results[i].data.data?.[0]?.value || 0,
      }));
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch KPIs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKpis(); }, []);

  const viewHistory = async (metric: string) => {
    setSelectedMetric(metric);
    try {
      const { data } = await api.get(`/dashboard/kpi/${metric}`, { params: { days: 30 } });
      setHistory(data.data || []);
    } catch (err) {
      setHistory([]);
    }
  };

  return (
    <>
      {showForm && <RecordKpiDrawer onClose={() => setShowForm(false)} onSaved={fetchKpis} />}
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">KPI Tracking</h1>
          <p className="text-muted-foreground">Record and monitor key performance indicators</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 shadow-lg shadow-primary/30">
          <Plus className="w-4 h-4" /> Record KPI
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.filter(m => m.latest !== 0).map((m) => (
          <Card key={m.metric} className="cursor-pointer hover:shadow-md" onClick={() => viewHistory(m.metric)}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground capitalize">{m.metric.replace(/_/g, ' ')}</p>
              <p className="text-3xl font-bold mt-1">{m.latest}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {m.history.length} records in last 30 days
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedMetric && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="capitalize">{selectedMetric.replace(/_/g, ' ')} — History</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedMetric('')}>Close</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No history</p>
            ) : (
              <div className="space-y-2">
                {history.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                    <span className="text-lg font-medium">{h.value}</span>
                    <span className="text-sm text-muted-foreground">{new Date(h.recorded_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-center py-8">Loading KPIs...</p>}
    </div>
    </>
  );
}
