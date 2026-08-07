'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  IndianRupee, FileText, RefreshCw, Receipt, Plus, X, Loader2,
} from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

/* ── GST Invoice Drawer ───────────────────────────────────────────────── */
function GstInvoiceDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
    customer_gstin: '', customer_name: '', place_of_supply: '', taxable_value: '', gst_rate: '18', is_reverse_charge: false,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.invoice_number.trim()) e.invoice_number = 'Invoice number is required';
    if (!form.invoice_date) e.invoice_date = 'Invoice date is required';
    if (!form.customer_name.trim()) e.customer_name = 'Customer name is required';
    if (!form.taxable_value || parseFloat(form.taxable_value) <= 0) e.taxable_value = 'Enter a valid taxable value greater than zero';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/gst/invoices', { ...form, taxable_value: parseFloat(form.taxable_value), gst_rate: parseFloat(form.gst_rate) });
      onSaved(); onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to create GST invoice' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div><h2 className="text-base font-bold text-foreground">New GST Invoice</h2><p className="text-xs text-muted-foreground">Create a GST-compliant invoice</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Invoice # <span className="text-red-500">*</span></label>
              <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-001" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.invoice_number ? 'border-red-400' : 'border-border'}`} />
              {errors.invoice_number && <p className="text-xs text-red-500 mt-1">{errors.invoice_number}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Invoice Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.invoice_date ? 'border-red-400' : 'border-border'}`} />
              {errors.invoice_date && <p className="text-xs text-red-500 mt-1">{errors.invoice_date}</p>}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Customer Name <span className="text-red-500">*</span></label>
            <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Customer or company name" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.customer_name ? 'border-red-400' : 'border-border'}`} />
            {errors.customer_name && <p className="text-xs text-red-500 mt-1">{errors.customer_name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Customer GSTIN</label>
              <input value={form.customer_gstin} onChange={e => setForm(f => ({ ...f, customer_gstin: e.target.value.toUpperCase() }))} placeholder="29AABCT1332L1ZD" maxLength={15} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Place of Supply</label>
              <input value={form.place_of_supply} onChange={e => setForm(f => ({ ...f, place_of_supply: e.target.value }))} placeholder="e.g. Karnataka" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Taxable Value (₹) <span className="text-red-500">*</span></label>
              <input type="number" min="0" value={form.taxable_value} onChange={e => setForm(f => ({ ...f, taxable_value: e.target.value }))} placeholder="0.00" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.taxable_value ? 'border-red-400' : 'border-border'}`} />
              {errors.taxable_value && <p className="text-xs text-red-500 mt-1">{errors.taxable_value}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">GST Rate (%)</label>
              <select value={form.gst_rate} onChange={e => setForm(f => ({ ...f, gst_rate: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="reverse_charge" checked={form.is_reverse_charge} onChange={e => setForm(f => ({ ...f, is_reverse_charge: e.target.checked }))} className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30" />
            <label htmlFor="reverse_charge" className="text-sm font-medium text-foreground">Reverse Charge Applicable</label>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Create Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Shared helpers ──────────────────────────────────────────────── */

function StatCard({ label, value, sub, gradient, icon: Icon }: {
  label: string; value: string | number; sub?: string; gradient: string; icon: React.ElementType;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg animate-slide-up ${gradient}`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="relative z-10">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-3xl font-bold tracking-tight mb-0.5">{value}</p>
        <p className="text-sm font-medium opacity-90">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function Spinner({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
      <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <p className="text-sm text-muted-foreground font-medium">{message}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Icon className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
            active === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const fmt = (n: number) =>
  n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/* ── Page ─────────────────────────────────────────────────────────── */

export default function GstPage() {
  const [summary, setSummary] = useState<any>({ total_outward: 0, total_tax: 0 });
  const [invoices, setInvoices] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('invoices');
  const [showForm, setShowForm] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, invoicesRes, returnsRes, settingsRes] = await Promise.all([
        api.get('/gst/summary'),
        api.get('/gst/invoices'),
        api.get('/gst/returns'),
        api.get('/gst/settings'),
      ]);
      setSummary(summaryRes.data.data);
      setInvoices(invoicesRes.data.data);
      setReturns(returnsRes.data.data);
      setSettings(settingsRes.data.data);
    } catch (err) {
      console.error('Failed to fetch GST:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleGenerateReturn = async (returnType: string, month: number, year: number) => {
    try {
      await api.post('/gst/returns/generate', { return_type: returnType, month, year });
      fetchData();
    } catch { alert('Failed to generate return'); }
  };

  if (loading) return <Spinner message="Loading GST…" />;

  return (
    <>
      {showForm && <GstInvoiceDrawer onClose={() => setShowForm(false)} onSaved={fetchData} />}
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">GST Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage GST invoices, returns, and compliance</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Outward"   value={fmt(parseFloat(summary.total_outward))} gradient="card-gradient-blue"    icon={IndianRupee} sub="Outward supplies" />
        <StatCard label="Total GST"       value={fmt(parseFloat(summary.total_tax))}     gradient="card-gradient-amber"   icon={Receipt}     sub="Tax collected" />
        <StatCard label="GSTIN"           value={settings?.gstin || '—'}                 gradient="card-gradient-emerald"  icon={FileText}    sub={settings?.gstin ? 'Configured' : 'Not configured'} />
      </div>

      {/* Tabs */}
      <TabBar tabs={[{ key: 'invoices', label: 'Invoices' }, { key: 'returns', label: 'Returns' }]} active={activeTab} onChange={setActiveTab} />

      {/* Invoices tab */}
      {activeTab === 'invoices' && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              GST Invoices
              <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
                <Plus className="w-3.5 h-3.5" /> New Invoice
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <EmptyState icon={FileText} message="No GST invoices" />
            ) : (
              <Table className="w-full text-sm" containerClassName="rounded-xl border border-border">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left p-3 font-medium text-muted-foreground">Invoice #</TableHead>
                      <TableHead className="text-left p-3 font-medium text-muted-foreground">Date</TableHead>
                      <TableHead className="text-left p-3 font-medium text-muted-foreground">Customer</TableHead>
                      <TableHead className="text-left p-3 font-medium text-muted-foreground">GSTIN</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">Taxable</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">CGST</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">SGST</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">IGST</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="p-3 font-mono text-foreground">{inv.invoice_number}</TableCell>
                        <TableCell className="p-3 text-muted-foreground">{new Date(inv.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell className="p-3">{inv.customer_name}</TableCell>
                        <TableCell className="p-3 font-mono text-xs text-muted-foreground">{inv.customer_gstin || '—'}</TableCell>
                        <TableCell className="p-3 text-right">₹{parseFloat(inv.taxable_value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">₹{parseFloat(inv.cgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">₹{parseFloat(inv.sgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">₹{parseFloat(inv.igst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right font-medium">₹{parseFloat(inv.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Returns tab */}
      {activeTab === 'returns' && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              GST Returns
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleGenerateReturn('GSTR-1', new Date().getMonth() + 1, new Date().getFullYear())}>Generate GSTR-1</Button>
                <Button size="sm" variant="outline" onClick={() => handleGenerateReturn('GSTR-3B', new Date().getMonth() + 1, new Date().getFullYear())}>Generate GSTR-3B</Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {returns.length === 0 ? (
              <EmptyState icon={Receipt} message="No returns generated" />
            ) : (
              <Table className="w-full text-sm" containerClassName="rounded-xl border border-border">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left p-3 font-medium text-muted-foreground">Type</TableHead>
                      <TableHead className="text-left p-3 font-medium text-muted-foreground">Period</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">Outward</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">IGST</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">CGST</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">SGST</TableHead>
                      <TableHead className="text-right p-3 font-medium text-muted-foreground">Total Tax</TableHead>
                      <TableHead className="text-left p-3 font-medium text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="p-3 font-medium">{r.return_type}</TableCell>
                        <TableCell className="p-3 text-muted-foreground">{new Date(0, r.period_month - 1).toLocaleString('default', { month: 'short' })} {r.period_year}</TableCell>
                        <TableCell className="p-3 text-right">₹{parseFloat(r.total_outward).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">₹{parseFloat(r.total_igst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">₹{parseFloat(r.total_cgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">₹{parseFloat(r.total_sgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3 text-right font-medium">₹{parseFloat(r.total_tax).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'filed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {r.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
