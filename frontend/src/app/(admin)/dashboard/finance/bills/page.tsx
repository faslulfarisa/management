'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { extractInvoiceData } from '@/lib/ocr';
import {
  Plus, RefreshCw, Receipt, CheckCircle2, XCircle,
  Loader2, Search, X, Trash2, ScanLine, Eye, Upload,
} from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const fmt = (n: any) => `₹${(parseFloat(String(n)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border border-blue-200',
  paid:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled:'bg-red-50 text-red-600 border border-red-200',
};

const EMPTY_LINE = () => ({ description: '', hsn_sac: '', quantity: 1, unit: 'nos', unit_price: 0, tax_rate: 18, amount: 0 });
const EMPTY_FORM = () => ({
  vendor_name: '', vendor_email: '', vendor_gstin: '',
  bill_date: new Date().toISOString().split('T')[0], due_date: '',
  notes: '', status: 'pending', source: 'manual', ocr_raw_text: '',
  line_items: [EMPTY_LINE()],
});

function computeLine(line: any) {
  const base = parseFloat(line.unit_price) * parseFloat(line.quantity);
  const tax = base * (parseFloat(line.tax_rate || 0) / 100);
  return { ...line, amount: base + tax };
}
function computeTotals(lines: any[]) {
  let subtotal = 0; let taxAmount = 0;
  for (const l of lines) {
    const base = parseFloat(l.unit_price) * parseFloat(l.quantity);
    subtotal += base; taxAmount += base * (parseFloat(l.tax_rate || 0) / 100);
  }
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

/* ── OCR Modal ────────────────────────────────────────────────────────── */
function OcrModal({ onClose, onExtracted }: { onClose: () => void; onExtracted: (d: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const runOcr = async () => {
    if (!file) return;
    setRunning(true);
    try { const r = await extractInvoiceData(file, setProgress); onExtracted(r); onClose(); }
    catch (e: any) { setError(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">Import Bill via OCR</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div onClick={() => document.getElementById('bill-ocr-file')?.click()} onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && setFile(e.dataTransfer.files[0]); }} onDragOver={(e) => e.preventDefault()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'}`}>
          <input id="bill-ocr-file" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
          <ScanLine className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">{file ? file.name : 'Drop bill image here'}</p>
        </div>
        {running && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Processing…</span><span>{progress}%</span></div>
            <div className="h-2 bg-muted rounded-full"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={runOcr} disabled={!file || running} className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} Extract
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bill Drawer ──────────────────────────────────────────────────────── */
function BillDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [showOcr, setShowOcr] = useState(false);

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setLine = (i: number, k: string, v: any) => setForm((f: any) => {
    const lines = [...f.line_items]; lines[i] = computeLine({ ...lines[i], [k]: v }); return { ...f, line_items: lines };
  });
  const addLine = () => setForm((f: any) => ({ ...f, line_items: [...f.line_items, EMPTY_LINE()] }));
  const removeLine = (i: number) => setForm((f: any) => ({ ...f, line_items: f.line_items.filter((_: any, j: number) => j !== i) }));

  const { subtotal, taxAmount, total } = computeTotals(form.line_items);

  const handleOcr = (data: any) => {
    setForm((f: any) => ({
      ...f, vendor_name: data.vendor_name || f.vendor_name, vendor_email: data.customer_email || f.vendor_email,
      bill_date: data.issue_date || f.bill_date, due_date: data.due_date || f.due_date,
      source: 'ocr', ocr_raw_text: data.rawText,
      line_items: data.line_items?.length ? data.line_items.map((l: any) => computeLine(l)) : f.line_items,
    }));
  };

  const save = async () => {
    if (!form.vendor_name) { alert('Vendor name is required'); return; }
    setSaving(true);
    try { await api.post('/finance/bills', form); onSaved(); onClose(); }
    catch (e: any) { alert(e.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <>
      {showOcr && <OcrModal onClose={() => setShowOcr(false)} onExtracted={handleOcr} />}
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div>
              <h2 className="text-base font-bold">New Vendor Bill</h2>
              <p className="text-xs text-muted-foreground">Record a supplier bill for payment</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowOcr(true)} className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/5 rounded-xl px-3 py-2 hover:bg-primary/10">
                <ScanLine className="w-3.5 h-3.5" /> Import OCR
              </button>
              <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Vendor */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Vendor Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Vendor Name *</label>
                  <input value={form.vendor_name} onChange={(e) => setField('vendor_name', e.target.value)} placeholder="e.g. ABC Supplies Pvt Ltd" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Email</label>
                  <input type="email" value={form.vendor_email} onChange={(e) => setField('vendor_email', e.target.value)} placeholder="vendor@example.com" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">GSTIN</label>
                  <input value={form.vendor_gstin} onChange={(e) => setField('vendor_gstin', e.target.value.toUpperCase())} placeholder="29AABCT1332L1ZD" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Bill Date *</label>
                <input type="date" value={form.bill_date} onChange={(e) => setField('bill_date', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Line Items</h3>
                <button onClick={addLine} className="flex items-center gap-1 text-xs font-medium text-primary"><Plus className="w-3.5 h-3.5" /> Add</button>
              </div>
              <div className="space-y-2">
                {form.line_items.map((line: any, i: number) => (
                  <div key={i} className="p-3 bg-muted/30 rounded-xl border border-border/60 space-y-2">
                    <div className="flex gap-2">
                      <input value={line.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="Description" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-sm focus:outline-none bg-white" />
                      <button onClick={() => removeLine(i)} disabled={form.line_items.length === 1} className="w-8 flex items-center justify-center text-muted-foreground hover:text-red-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="text-[10px] text-muted-foreground block mb-0.5">Qty</label><input type="number" min="0" value={line.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none bg-white" /></div>
                      <div><label className="text-[10px] text-muted-foreground block mb-0.5">Unit Price (₹)</label><input type="number" min="0" value={line.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none bg-white" /></div>
                      <div><label className="text-[10px] text-muted-foreground block mb-0.5">GST %</label>
                        <select value={line.tax_rate} onChange={(e) => setLine(i, 'tax_rate', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none bg-white">
                          {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end"><span className="text-sm font-semibold">{fmt(line.amount)}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST / Tax</span><span>{fmt(taxAmount)}</span></div>
              <div className="flex justify-between text-base font-bold border-t border-border pt-2"><span>Total</span><span className="text-primary">{fmt(total)}</span></div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border flex items-center gap-2 shrink-0 bg-muted/20">
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button onClick={save} disabled={saving || !form.vendor_name} className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Save Bill
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function BillsPage() {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);

  const BILL_BULK_COLUMNS = [
    { key: 'vendor_name', label: 'Vendor Name', required: true, width: '150px' },
    { key: 'vendor_email', label: 'Vendor Email', type: 'email' as const, width: '160px' },
    { key: 'vendor_gstin', label: 'Vendor GSTIN', placeholder: '29ABCDE1234F1Z5', width: '150px' },
    { key: 'bill_date', label: 'Bill Date', required: true, type: 'date' as const, defaultValue: new Date().toISOString().split('T')[0], width: '130px' },
    { key: 'due_date', label: 'Due Date', type: 'date' as const, width: '130px' },
    { key: 'amount', label: 'Total Amount (₹)', required: true, type: 'number' as const, placeholder: '0', width: '130px' },
    { key: 'notes', label: 'Notes', placeholder: 'Optional', width: '150px' },
  ];

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (activeStatus !== 'all') params.status = activeStatus;
      if (search) params.search = search;
      const res = await api.get('/finance/bills', { params });
      setBills(res.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeStatus, search]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const approveBill = async (id: string) => {
    try { await api.post(`/finance/bills/${id}/approve`); fetchBills(); }
    catch { alert('Failed to approve'); }
  };
  const payBill = async (id: string) => {
    if (!confirm('Mark this bill as paid?')) return;
    try { await api.post(`/finance/bills/${id}/pay`, {}); fetchBills(); }
    catch { alert('Failed to pay'); }
  };

  return (
    <>
      {showDrawer && <BillDrawer onClose={() => setShowDrawer(false)} onSaved={fetchBills} />}
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Vendor Bills"
          subtitle="Import multiple bills at once (simple bills without line items)"
          columns={BILL_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/finance/bills', {
            ...row,
            status: 'pending',
            source: 'bulk_import',
            line_items: [{ description: 'Import', quantity: 1, unit_price: parseFloat(row.amount) || 0, tax_rate: 0, amount: parseFloat(row.amount) || 0 }],
          })}
          onAllDone={fetchBills}
        />
      )}
      <div className="space-y-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Vendor Bills</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage payables and supplier invoices</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchBills} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={() => setShowBulkDrawer(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button onClick={() => setShowDrawer(true)} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 shadow-lg shadow-primary/30">
              <Plus className="w-4 h-4" /> Add Bill
            </button>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
            {['all', 'pending', 'approved', 'paid'].map(s => (
              <button key={s} onClick={() => setActiveStatus(s)} className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize transition-all ${activeStatus === s ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor or bill #…" className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Receipt className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No bills found</p>
              <button onClick={() => setShowDrawer(true)} className="mt-4 text-xs text-primary hover:underline font-medium">Add your first bill →</button>
            </div>
          ) : (
            <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Bill #</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Vendor</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Bill Date</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Due Date</TableHead>
                    <TableHead className="text-right p-3 font-medium text-muted-foreground">Amount</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="p-3 font-mono text-xs font-semibold text-primary">{b.bill_number}</TableCell>
                      <TableCell className="p-3">
                        <p className="font-medium text-foreground">{b.vendor_name}</p>
                        {b.vendor_email && <p className="text-xs text-muted-foreground">{b.vendor_email}</p>}
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground">{b.bill_date ? new Date(b.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</TableCell>
                      <TableCell className="p-3 text-muted-foreground">{b.due_date ? new Date(b.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</TableCell>
                      <TableCell className="p-3 text-right font-semibold">{fmt(b.total_amount)}</TableCell>
                      <TableCell className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[b.status] || ''}`}>{b.status}</span>
                        {b.source === 'ocr' && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">OCR</span>}
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="flex items-center gap-1">
                          {b.status === 'pending' && (
                            <button onClick={() => approveBill(b.id)} className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-2 py-1 hover:bg-blue-100">
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </button>
                          )}
                          {b.status === 'approved' && (
                            <button onClick={() => payBill(b.id)} className="flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg px-2 py-1 hover:bg-emerald-100">
                              <CheckCircle2 className="w-3 h-3" /> Pay
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </div>
      </div>
    </>
  );
}
