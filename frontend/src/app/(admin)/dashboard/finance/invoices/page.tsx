'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import { extractInvoiceData } from '@/lib/ocr';
import {
  Plus, Search, RefreshCw, FileText, Send, CheckCircle2,
  XCircle, Download, Eye, Upload, X, Loader2, Trash2,
  ChevronDown, Printer, ScanLine, Edit,
} from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import Link from 'next/link';

/* ── Helpers ──────────────────────────────────────────────────────────── */
const fmt = (n: any) => {
  const v = parseFloat(String(n)) || 0;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-700 border border-slate-200',
  sent:      'bg-blue-50 text-blue-700 border border-blue-200',
  paid:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
  overdue:   'bg-red-50 text-red-700 border border-red-200',
  cancelled: 'bg-red-50 text-red-600 border border-red-200',
};

const STATUS_TABS = ['all', 'draft', 'sent', 'paid', 'overdue'];

const EMPTY_LINE = () => ({ description: '', hsn_sac: '', quantity: 1, unit: 'nos', unit_price: 0, discount_pct: 0, tax_rate: 18, amount: 0 });
const EMPTY_FORM = () => ({
  customer_name: '', customer_email: '', customer_phone: '',
  customer_address: '', customer_gstin: '', issue_date: new Date().toISOString().split('T')[0],
  due_date: '', notes: '', terms: 'Payment due within 30 days.',
  discount_amount: 0, status: 'draft', source: 'manual', ocr_raw_text: '',
  line_items: [EMPTY_LINE()],
});

/* ── Line item helpers ────────────────────────────────────────────────── */
function computeLine(line: any) {
  const base = parseFloat(line.unit_price) * parseFloat(line.quantity) * (1 - parseFloat(line.discount_pct || 0) / 100);
  const tax = base * (parseFloat(line.tax_rate || 0) / 100);
  return { ...line, amount: base + tax };
}

function computeTotals(lines: any[], discountAmount: number) {
  let subtotal = 0; let taxAmount = 0;
  const items = Array.isArray(lines) ? lines : [];
  for (const l of items) {
    const base = parseFloat(l.unit_price) * parseFloat(l.quantity) * (1 - parseFloat(l.discount_pct || 0) / 100);
    subtotal += base;
    taxAmount += base * (parseFloat(l.tax_rate || 0) / 100);
  }
  return { subtotal, taxAmount, total: subtotal + taxAmount - (parseFloat(String(discountAmount)) || 0) };
}

/* ── OCR Upload Modal ─────────────────────────────────────────────────── */
function OcrModal({ onClose, onExtracted }: { onClose: () => void; onExtracted: (data: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => { setFile(f); setError(''); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const runOcr = async () => {
    if (!file) return;
    setRunning(true); setError('');
    try {
      const result = await extractInvoiceData(file, setProgress);
      onExtracted(result);
      onClose();
    } catch (e: any) {
      setError('OCR failed: ' + (e.message || 'Unknown error'));
    } finally { setRunning(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-foreground">Import Invoice via OCR</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Upload an image or PDF to auto-fill fields</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        {/* Drop Zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-muted/30'}`}
        >
          <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <ScanLine className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          {file ? (
            <p className="text-sm font-medium text-foreground">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Drop invoice image here</p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG, PDF supported</p>
            </>
          )}
        </div>

        {running && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Processing with OCR…</span><span>{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={runOcr} disabled={!file || running}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {running ? 'Extracting…' : 'Extract Data'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Invoice Drawer ───────────────────────────────────────────────────── */
function InvoiceDrawer({ invoice, onClose, onSaved }: { invoice?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(invoice ? { ...EMPTY_FORM(), ...invoice } : EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const isEdit = !!invoice?.id;

  useEffect(() => {
    if (invoice?.id) {
      const load = async () => {
        setLoading(true);
        try {
          const res = await api.get(`/finance/invoices/${invoice.id}`);
          setForm(res.data.data);
        } catch {
          alert('Failed to load invoice details');
        } finally {
          setLoading(false);
        }
      };
      load();
    } else {
      setForm(EMPTY_FORM());
    }
  }, [invoice]);

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setLine = (i: number, k: string, v: any) => {
    setForm((f: any) => {
      const lines = [...f.line_items];
      lines[i] = computeLine({ ...lines[i], [k]: v });
      return { ...f, line_items: lines };
    });
  };
  const addLine = () => setForm((f: any) => ({ ...f, line_items: [...f.line_items, EMPTY_LINE()] }));
  const removeLine = (i: number) => setForm((f: any) => ({ ...f, line_items: f.line_items.filter((_: any, j: number) => j !== i) }));

  const { subtotal, taxAmount, total } = computeTotals(form?.line_items || [], form?.discount_amount || 0);

  const handleOcrExtract = (data: any) => {
    setForm((f: any) => ({
      ...f,
      customer_name: data.customer_name || f.customer_name,
      customer_email: data.customer_email || f.customer_email,
      issue_date: data.issue_date || f.issue_date,
      due_date: data.due_date || f.due_date,
      source: 'ocr',
      ocr_raw_text: data.rawText,
      line_items: data.line_items?.length ? data.line_items.map((l: any) => computeLine(l)) : f.line_items,
    }));
  };

  const save = async (status = form.status) => {
    setSaving(true);
    try {
      const payload = { ...form, status };
      if (isEdit) await api.put(`/finance/invoices/${invoice.id}`, payload);
      else await api.post('/finance/invoices', payload);
      onSaved(); onClose();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <>
      {showOcr && <OcrModal onClose={() => setShowOcr(false)} onExtracted={handleOcrExtract} />}
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div>
              <h2 className="text-base font-bold text-foreground">{isEdit ? `Edit Invoice ${invoice.invoice_number}` : 'New Invoice'}</h2>
              <p className="text-xs text-muted-foreground">{isEdit ? 'Update invoice details' : 'Create a new customer invoice'}</p>
            </div>
            <div className="flex items-center gap-2">
              {!isEdit && (
                <button onClick={() => setShowOcr(true)} className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/5 rounded-xl px-3 py-2 hover:bg-primary/10 transition-colors">
                  <ScanLine className="w-3.5 h-3.5" /> Import OCR
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                <p className="text-sm">Loading invoice details...</p>
              </div>
            ) : (
              <>
                {/* Customer */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Customer Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Customer Name *</label>
                  <input value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} placeholder="e.g. ABC Hotels Pvt Ltd" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Email</label>
                  <input type="email" value={form.customer_email} onChange={(e) => setField('customer_email', e.target.value)} placeholder="billing@client.com" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Phone</label>
                  <PhoneNumberInput value={form.customer_phone} onChange={(value) => setField('customer_phone', value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Address</label>
                  <input value={form.customer_address} onChange={(e) => setField('customer_address', e.target.value)} placeholder="123 MG Road, Bengaluru" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">GSTIN</label>
                  <input value={form.customer_gstin} onChange={(e) => setField('customer_gstin', e.target.value.toUpperCase())} placeholder="29AABCT1332L1ZD" maxLength={15} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Issue Date *</label>
                <input type="date" value={form.issue_date} onChange={(e) => setField('issue_date', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Line Items</h3>
                <button onClick={addLine} className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"><Plus className="w-3.5 h-3.5" /> Add Line</button>
              </div>
              <div className="space-y-2">
                {form.line_items.map((line: any, i: number) => (
                  <div key={i} className="p-3 bg-muted/30 rounded-xl border border-border/60 space-y-2">
                    <div className="flex gap-2">
                      <input value={line.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="Description of goods/services" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                      <input value={line.hsn_sac} onChange={(e) => setLine(i, 'hsn_sac', e.target.value)} placeholder="HSN" className="w-20 border border-border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                      <button onClick={() => removeLine(i)} disabled={form.line_items.length === 1} className="w-8 h-9 flex items-center justify-center text-muted-foreground hover:text-red-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">Qty</label>
                        <input type="number" min="0" value={line.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">Unit Price (₹)</label>
                        <input type="number" min="0" value={line.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">Disc %</label>
                        <input type="number" min="0" max="100" value={line.discount_pct} onChange={(e) => setLine(i, 'discount_pct', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">GST %</label>
                        <select value={line.tax_rate} onChange={(e) => setLine(i, 'tax_rate', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                          {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <span className="text-sm font-semibold text-foreground">= {fmt(line.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Discount (₹)</span>
                <input type="number" min="0" value={form.discount_amount} onChange={(e) => setField('discount_amount', e.target.value)} className="w-28 border border-border rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST / Tax</span>
                <span className="font-medium">{fmt(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-1">
                <span>Total Amount</span>
                <span className="text-primary">{fmt(total)}</span>
              </div>
            </div>

            {/* Notes & Terms */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} placeholder="Thank you for your business." className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Terms</label>
                <textarea value={form.terms} onChange={(e) => setField('terms', e.target.value)} rows={3} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          </>
        )}
      </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex items-center gap-2 shrink-0 bg-muted/20">
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button onClick={() => save('draft')} disabled={saving} className="flex items-center gap-2 border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save Draft
            </button>
            <button onClick={() => save('sent')} disabled={saving || !form.customer_name} className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <Send className="w-4 h-4" /> {isEdit ? 'Update & Send' : 'Save & Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Mark Paid Modal ──────────────────────────────────────────────────── */
function MarkPaidModal({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().split('T')[0], amount: invoice.total_amount, payment_method: 'bank', reference: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/finance/invoices/${invoice.id}/mark-paid`, form);
      onSaved(); onClose();
    } catch { alert('Failed to record payment'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-bold mb-1">Record Payment</h2>
        <p className="text-xs text-muted-foreground mb-5">{invoice.invoice_number} — {invoice.customer_name}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Date</label>
            <input type="date" value={form.payment_date} onChange={(e) => setForm(f => ({ ...f, payment_date: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Amount (₹)</label>
            <input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: parseFloat(e.target.value) }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Method</label>
            <select value={form.payment_method} onChange={(e) => setForm(f => ({ ...f, payment_method: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="bank">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Reference / UTR</label>
            <input value={form.reference} onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="UTR123456" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editInvoice, setEditInvoice] = useState<any>(null);
  const [markPaidInvoice, setMarkPaidInvoice] = useState<any>(null);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);

  const INVOICE_BULK_COLUMNS = [
    { key: 'customer_name', label: 'Customer Name', required: true, width: '150px' },
    { key: 'customer_email', label: 'Customer Email', type: 'email' as const, width: '160px' },
    { key: 'customer_gstin', label: 'GSTIN', placeholder: '29ABCDE1234F1Z5', width: '150px' },
    { key: 'issue_date', label: 'Issue Date', required: true, type: 'date' as const, defaultValue: new Date().toISOString().split('T')[0], width: '130px' },
    { key: 'due_date', label: 'Due Date', type: 'date' as const, width: '130px' },
    { key: 'amount', label: 'Total Amount (₹)', required: true, type: 'number' as const, placeholder: '0', width: '130px' },
    { key: 'notes', label: 'Notes', placeholder: 'Optional', width: '150px' },
  ];

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (activeStatus !== 'all') params.status = activeStatus;
      if (search) params.search = search;
      const res = await api.get('/finance/invoices', { params });
      const d = res.data.data;
      setInvoices(d.data || d);
      setTotal(d.total || (d.data || d).length);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeStatus, search]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSend = async (id: string) => {
    if (!confirm('Mark this invoice as sent?')) return;
    try { await api.post(`/finance/invoices/${id}/send`); fetchInvoices(); }
    catch { alert('Failed'); }
  };

  const handleEdit = (inv: any) => {
    setEditInvoice(inv);
    setShowDrawer(true);
  };

  return (
    <>
      {showDrawer && <InvoiceDrawer invoice={editInvoice} onClose={() => { setShowDrawer(false); setEditInvoice(null); }} onSaved={fetchInvoices} />}
      {markPaidInvoice && <MarkPaidModal invoice={markPaidInvoice} onClose={() => setMarkPaidInvoice(null)} onSaved={fetchInvoices} />}
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Invoices"
          subtitle="Import multiple invoices at once (simple invoices without line items)"
          columns={INVOICE_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/finance/invoices', {
            ...row,
            status: 'draft',
            source: 'bulk_import',
            line_items: [{ description: 'Import', quantity: 1, unit_price: parseFloat(row.amount) || 0, tax_rate: 0, amount: parseFloat(row.amount) || 0 }],
          })}
          onAllDone={fetchInvoices}
        />
      )}

      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Invoices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{total} invoices total</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchInvoices} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={() => setShowBulkDrawer(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button onClick={() => { setEditInvoice(null); setShowDrawer(true); }} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30">
              <Plus className="w-4 h-4" /> New Invoice
            </button>
          </div>
        </div>

        {/* Status Tabs + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
            {STATUS_TABS.map(s => (
              <button key={s} onClick={() => setActiveStatus(s)} className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize transition-all ${activeStatus === s ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or number…"
              className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileText className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No invoices found</p>
              <button onClick={() => setShowDrawer(true)} className="mt-4 text-xs text-primary hover:underline font-medium">Create your first invoice →</button>
            </div>
          ) : (
            <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Invoice #</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Customer</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Issue Date</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Due Date</TableHead>
                    <TableHead className="text-right p-3 font-medium text-muted-foreground">Amount</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="p-3 font-mono text-xs font-semibold text-primary">{inv.invoice_number}</TableCell>
                      <TableCell className="p-3">
                        <p className="font-medium text-foreground">{inv.customer_name}</p>
                        {inv.customer_email && <p className="text-xs text-muted-foreground">{inv.customer_email}</p>}
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground">{inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</TableCell>
                      <TableCell className="p-3 text-muted-foreground">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</TableCell>
                      <TableCell className="p-3 text-right font-semibold text-foreground">{fmt(inv.total_amount)}</TableCell>
                      <TableCell className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[inv.status] || 'bg-muted text-muted-foreground'}`}>
                          {inv.status}
                        </span>
                        {inv.source === 'ocr' && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">OCR</span>}
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="flex items-center gap-1">
                          <Link href={`/dashboard/finance/invoices/${inv.id}`} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={() => handleEdit(inv)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Edit">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          {inv.status === 'draft' && (
                            <button onClick={() => handleSend(inv.id)} className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors text-blue-600" title="Mark Sent">
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(inv.status === 'sent' || inv.status === 'overdue') && (
                            <button onClick={() => setMarkPaidInvoice(inv)} className="p-1.5 rounded-lg hover:bg-emerald-50 transition-colors text-emerald-600" title="Mark Paid">
                              <CheckCircle2 className="w-3.5 h-3.5" />
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
