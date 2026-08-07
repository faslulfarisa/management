'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { useBranding } from '@/hooks/useBranding';
import { ArrowLeft, Printer, Send, CheckCircle2, Loader2, Clock, XCircle, FileText } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import Link from 'next/link';

const fmt = (n: any) => `₹${(parseFloat(String(n)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-700' },
  sent:      { label: 'Sent',      cls: 'bg-blue-50 text-blue-700' },
  paid:      { label: 'Paid',      cls: 'bg-emerald-50 text-emerald-700' },
  overdue:   { label: 'Overdue',   cls: 'bg-red-50 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { logoUrl, assets } = useBranding();
  const invoiceLogoUrl = assets?.logo_rectangular?.file_url ?? logoUrl;
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await api.get(`/finance/invoices/${id}`);
      setInvoice(res.data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  const act = async (action: string, label: string) => {
    setActing(label);
    try {
      if (action === 'send') await api.post(`/finance/invoices/${id}/send`);
      await fetchInvoice();
    } catch { alert(`Failed to ${label}`); }
    finally { setActing(''); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
  if (!invoice) return <div className="text-center py-20 text-muted-foreground">Invoice not found</div>;

  const statusInfo = STATUS_INFO[invoice.status] || STATUS_INFO.draft;

  return (
    <div className="animate-fade-in">
      {/* Toolbar (hidden in print) */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link href="/dashboard/finance/invoices" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </Link>
        <div className="flex items-center gap-2">
          {invoice.status === 'draft' && (
            <button onClick={() => act('send', 'Send')} disabled={!!acting} className="flex items-center gap-2 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-xl px-4 py-2 hover:bg-blue-100 transition-colors disabled:opacity-50">
              {acting === 'Send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Mark Sent
            </button>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-2 text-sm font-medium border border-border rounded-xl px-4 py-2 hover:bg-muted transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Invoice Document */}
      <div id="invoice-print" className="bg-white rounded-2xl shadow-sm border border-border p-8 max-w-3xl mx-auto print:shadow-none print:border-none print:rounded-none">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b border-border">
          <div>
            {invoiceLogoUrl
              ? <img src={invoiceLogoUrl} alt="logo" className="h-16 object-contain mb-3" />
              : (
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold mb-3" style={{ background: 'linear-gradient(135deg, hsl(43 90% 50%), hsl(35 95% 55%))' }}>
                  H
                </div>
              )
            }
            <p className="text-lg font-bold text-foreground">Ai-HRMS — Hotel Management</p>
            <p className="text-sm text-muted-foreground mt-0.5">Demo Hotel Group</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-foreground">INVOICE</p>
            <p className="font-mono text-lg font-semibold text-primary mt-1">{invoice.invoice_number}</p>
            <span className={`inline-block mt-2 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${statusInfo.cls}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Bill To + Dates */}
        <div className="grid grid-cols-2 gap-8 py-6 border-b border-border">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Bill To</p>
            <p className="font-bold text-foreground text-base">{invoice.customer_name}</p>
            {invoice.customer_email && <p className="text-sm text-muted-foreground">{invoice.customer_email}</p>}
            {invoice.customer_phone && <p className="text-sm text-muted-foreground">{invoice.customer_phone}</p>}
            {invoice.customer_address && <p className="text-sm text-muted-foreground mt-1">{invoice.customer_address}</p>}
            {invoice.customer_gstin && <p className="text-sm font-mono text-muted-foreground mt-1">GSTIN: {invoice.customer_gstin}</p>}
          </div>
          <div className="text-right space-y-3">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Issue Date</p>
              <p className="text-sm font-semibold text-foreground">{fmtDate(invoice.issue_date)}</p>
            </div>
            {invoice.due_date && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Due Date</p>
                <p className="text-sm font-semibold text-foreground">{fmtDate(invoice.due_date)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="py-6 border-b border-border">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="text-left py-2 font-bold text-foreground">#</TableHead>
                <TableHead className="text-left py-2 font-bold text-foreground">Description</TableHead>
                <TableHead className="text-left py-2 font-bold text-foreground">HSN/SAC</TableHead>
                <TableHead className="text-right py-2 font-bold text-foreground">Qty</TableHead>
                <TableHead className="text-right py-2 font-bold text-foreground">Unit Price</TableHead>
                <TableHead className="text-right py-2 font-bold text-foreground">GST%</TableHead>
                <TableHead className="text-right py-2 font-bold text-foreground">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoice.line_items || []).map((l: any, i: number) => (
                <TableRow key={l.id}>
                  <TableCell className="py-3 text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="py-3 font-medium text-foreground">{l.description}</TableCell>
                  <TableCell className="py-3 font-mono text-muted-foreground text-xs">{l.hsn_sac || '—'}</TableCell>
                  <TableCell className="py-3 text-right text-muted-foreground">{l.quantity} {l.unit}</TableCell>
                  <TableCell className="py-3 text-right text-muted-foreground">{fmt(l.unit_price)}</TableCell>
                  <TableCell className="py-3 text-right text-muted-foreground">{l.tax_rate}%</TableCell>
                  <TableCell className="py-3 text-right font-semibold text-foreground">{fmt(l.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="py-6 flex justify-end border-b border-border">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmt(invoice.subtotal)}</span>
            </div>
            {parseFloat(invoice.discount_amount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-rose-600">−{fmt(invoice.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST / Tax</span>
              <span>{fmt(invoice.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t-2 border-border pt-2">
              <span>Total</span>
              <span className="text-primary">{fmt(invoice.total_amount)}</span>
            </div>
            {invoice.status === 'paid' && (
              <div className="flex justify-between text-sm text-emerald-700 font-semibold">
                <span>Amount Paid</span>
                <span>{fmt(invoice.amount_paid)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes & Terms */}
        {(invoice.notes || invoice.terms) && (
          <div className="pt-6 grid grid-cols-2 gap-6">
            {invoice.notes && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Terms & Conditions</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Payment History */}
        {(invoice.payments || []).length > 0 && (
          <div className="mt-6 pt-6 border-t border-border print:hidden">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Payment History</p>
            {invoice.payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-foreground capitalize">{p.payment_method}</span>
                  {p.reference && <span className="text-xs text-muted-foreground">({p.reference})</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">{fmtDate(p.payment_date)}</span>
                  <span className="text-sm font-bold text-emerald-700">{fmt(p.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">Thank you for your business • Ai-HRMS — AI Hotel Workforce Management</p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print, #invoice-print * { visibility: visible; }
          #invoice-print { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
