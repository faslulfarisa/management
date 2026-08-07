'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  IndianRupee,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthStore } from '@/store/auth.store';
import { canOps, OPS_PERMISSIONS } from '@/lib/internal-roles';
import { listOpsSubscriptions, type OpsSubscriptionRow } from '@/lib/operations-subscriptions-api';
import {
  createOpsSubscriptionInvoice,
  getOpsSubscriptionInvoiceSummary,
  listOpsSubscriptionInvoices,
  markOpsSubscriptionInvoicePaid,
  updateOpsSubscriptionInvoice,
  voidOpsSubscriptionInvoice,
  type OpsSubscriptionInvoiceRow,
  type OpsSubscriptionInvoiceSummary,
  type SubscriptionInvoiceStatus,
} from '@/lib/operations-subscription-invoices-api';

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `INR ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function dateInput(value: string | null | undefined) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function documentDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function defaultDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 15);
  return due.toISOString().slice(0, 10);
}

function statusBadge(status: SubscriptionInvoiceStatus) {
  const classes: Record<SubscriptionInvoiceStatus, string> = {
    pending: 'bg-blue-50 text-blue-700 border-blue-200',
    overdue: 'bg-amber-50 text-amber-700 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    void: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const labels: Record<SubscriptionInvoiceStatus, string> = {
    pending: 'Pending',
    overdue: 'Overdue',
    paid: 'Paid',
    void: 'Void',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof ReceiptText; label: string; value: string | number }) {
  return (
    <div className="ops-panel p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-foreground truncate">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function getErrorMessage(err: any, fallback: string) {
  const message = err.response?.data?.error?.message ?? err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message[0] : message;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function generateInvoiceDocument(invoice: OpsSubscriptionInvoiceRow) {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=920,height=1120');
  if (!win) return;

  const statusLabel = invoice.effective_status.charAt(0).toUpperCase() + invoice.effective_status.slice(1);
  const subscriptionPeriod =
    invoice.current_period_start || invoice.current_period_end
      ? `${documentDate(invoice.current_period_start)} to ${documentDate(invoice.current_period_end)}`
      : '-';
  const planName = invoice.plan_name || 'Subscription plan';
  const billingCycle = invoice.billing_cycle ? `${invoice.billing_cycle.charAt(0).toUpperCase()}${invoice.billing_cycle.slice(1)} billing` : 'Subscription billing';
  const notes = invoice.notes?.trim();

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.invoice_number)} - Invoice</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f7fb;
      color: #0f172a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .toolbar {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px;
      background: rgba(244, 247, 251, 0.92);
      border-bottom: 1px solid #dbe3ef;
      backdrop-filter: blur(12px);
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      background: #1d4ed8;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      background: white;
      padding: 18mm;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14);
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 32px;
      padding-bottom: 28px;
      border-bottom: 3px solid #0f172a;
    }
    .brand-mark {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: #0f172a;
      color: white;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0;
    }
    .brand {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    h1, h2, h3, p { margin: 0; }
    h1 {
      font-size: 34px;
      line-height: 1;
      letter-spacing: 0;
    }
    .company-name {
      font-size: 18px;
      font-weight: 800;
    }
    .muted {
      color: #64748b;
      font-size: 12px;
      line-height: 1.65;
    }
    .meta {
      text-align: right;
      display: grid;
      gap: 8px;
      font-size: 13px;
    }
    .status {
      justify-self: end;
      display: inline-flex;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      margin-top: 30px;
    }
    .label {
      color: #64748b;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .box {
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      padding: 16px;
      min-height: 126px;
    }
    .entity {
      font-size: 17px;
      font-weight: 800;
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 32px;
      font-size: 13px;
    }
    th {
      background: #f8fafc;
      color: #475569;
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-align: left;
      padding: 12px;
      border-top: 1px solid #dbe3ef;
      border-bottom: 1px solid #dbe3ef;
    }
    td {
      padding: 16px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .right { text-align: right; }
    .item-title {
      font-weight: 800;
      margin-bottom: 4px;
    }
    .totals {
      margin-top: 24px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-card {
      width: 300px;
      display: grid;
      gap: 10px;
      font-size: 13px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      gap: 18px;
    }
    .grand-total {
      margin-top: 8px;
      padding-top: 14px;
      border-top: 2px solid #0f172a;
      font-size: 20px;
      font-weight: 900;
    }
    .notes {
      margin-top: 36px;
      padding-top: 20px;
      border-top: 1px solid #dbe3ef;
    }
    .footer {
      margin-top: 54px;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      color: #64748b;
      font-size: 11px;
      line-height: 1.6;
    }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      .sheet {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 16mm;
        box-shadow: none;
      }
      @page { size: A4; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print / Save PDF</button>
  </div>
  <main class="sheet">
    <section class="top">
      <div class="brand">
        <div class="brand-mark">H</div>
        <div>
          <p class="company-name">AI-HRMS Platform</p>
          <p class="muted">Platform subscription billing<br />India</p>
        </div>
      </div>
      <div class="meta">
        <h1>Invoice</h1>
        <span class="status">${escapeHtml(statusLabel)}</span>
        <p><strong>${escapeHtml(invoice.invoice_number)}</strong></p>
        <p class="muted">Issued ${documentDate(invoice.created_at)}<br />Due ${documentDate(invoice.due_date)}</p>
      </div>
    </section>

    <section class="grid">
      <div>
        <p class="label">Bill From</p>
        <div class="box">
          <p class="entity">AI-HRMS Platform</p>
          <p class="muted">Platform subscription billing<br />India</p>
        </div>
      </div>
      <div>
        <p class="label">Bill To</p>
        <div class="box">
          <p class="entity">${escapeHtml(invoice.organization_name)}</p>
          <p class="muted">${escapeHtml(invoice.organization_email || invoice.organization_slug)}<br />Organization ID: ${escapeHtml(invoice.organization_slug)}</p>
        </div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Period</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <p class="item-title">${escapeHtml(planName)}</p>
            <p class="muted">${escapeHtml(billingCycle)}</p>
          </td>
          <td>${escapeHtml(subscriptionPeriod)}</td>
          <td class="right">${escapeHtml(money(invoice.amount))}</td>
        </tr>
      </tbody>
    </table>

    <section class="totals">
      <div class="totals-card">
        <div class="total-row"><span>Subtotal</span><strong>${escapeHtml(money(invoice.amount))}</strong></div>
        <div class="total-row"><span>Tax</span><strong>${escapeHtml(money(invoice.tax_amount))}</strong></div>
        <div class="total-row grand-total"><span>Total</span><span>${escapeHtml(money(invoice.total_amount))}</span></div>
      </div>
    </section>

    ${notes ? `<section class="notes"><p class="label">Notes</p><p class="muted">${escapeHtml(notes).replaceAll('\n', '<br />')}</p></section>` : ''}

    <section class="footer">
      <p>This invoice was generated for platform subscription services.</p>
      <p>Payment status: ${escapeHtml(statusLabel)}</p>
    </section>
  </main>
</body>
</html>`);
  win.document.close();
  win.focus();
}

function InvoiceFormModal({
  invoice,
  organizations,
  onClose,
  onSaved,
}: {
  invoice: OpsSubscriptionInvoiceRow | null;
  organizations: OpsSubscriptionRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = Boolean(invoice);
  const [form, setForm] = useState({
    tenantId: invoice?.tenant_id || '',
    invoiceNumber: invoice?.invoice_number || '',
    amount: invoice ? String(invoice.amount) : '',
    taxAmount: invoice ? String(invoice.tax_amount) : '',
    dueDate: dateInput(invoice?.due_date) || defaultDueDate(),
    notes: invoice?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedOrganization = organizations.find((org) => org.tenant_id === form.tenantId);

  const submit = async () => {
    if (!isEdit && !form.tenantId) { setError('Choose an organization'); return; }
    if (!form.dueDate) { setError('Due date is required'); return; }
    if (form.amount !== '' && Number(form.amount) < 0) { setError('Amount cannot be negative'); return; }
    if (form.taxAmount !== '' && Number(form.taxAmount) < 0) { setError('Tax cannot be negative'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        amount: form.amount === '' ? undefined : Number(form.amount),
        taxAmount: form.taxAmount === '' ? undefined : Number(form.taxAmount),
        dueDate: new Date(form.dueDate).toISOString(),
        notes: form.notes.trim() || undefined,
      };
      if (invoice) {
        await updateOpsSubscriptionInvoice(invoice.id, payload);
      } else {
        await createOpsSubscriptionInvoice({ tenantId: form.tenantId, ...payload });
      }
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to save invoice'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{isEdit ? 'Edit Invoice' : 'Create Invoice'}</h2>
            <p className="text-sm text-muted-foreground">{isEdit ? invoice?.organization_name : 'Subscription invoice for an organization'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          {!isEdit && (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Organization</label>
              <select
                value={form.tenantId}
                onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value, amount: '' }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select organization</option>
                {organizations.map((org) => (
                  <option key={org.tenant_id} value={org.tenant_id}>
                    {org.organization_name} {org.plan_name || org.custom_plan_name ? `- ${org.plan_name || org.custom_plan_name}` : ''}
                  </option>
                ))}
              </select>
              {selectedOrganization && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Active amount defaults to {money(selectedOrganization.amount)} if amount is left blank.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Invoice Number</label>
              <Input value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} placeholder="Auto generated" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Amount</label>
              <Input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Default from subscription" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Tax Amount</label>
              <Input type="number" min={0} value={form.taxAmount} onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))} placeholder="Default 18%" className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function MarkPaidDialog({ invoice, onClose, onSaved }: { invoice: OpsSubscriptionInvoiceRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ paymentMethod: 'manual', paymentReference: '', gateway: 'manual' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!invoice) return null;

  const submit = async () => {
    if (!form.paymentMethod.trim()) { setError('Payment method is required'); return; }
    setSaving(true);
    setError('');
    try {
      await markOpsSubscriptionInvoicePaid(invoice.id, {
        paymentMethod: form.paymentMethod.trim(),
        paymentReference: form.paymentReference.trim() || undefined,
        gateway: form.gateway.trim() || undefined,
      });
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to mark invoice paid'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Mark Paid</h3>
            <p className="text-sm text-muted-foreground">{invoice.invoice_number} - {money(invoice.total_amount)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {error && <p className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="space-y-3">
          <Input value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} placeholder="Payment method" />
          <Input value={form.paymentReference} onChange={(e) => setForm((f) => ({ ...f, paymentReference: e.target.value }))} placeholder="Reference number" />
          <Input value={form.gateway} onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))} placeholder="Gateway" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Mark Paid'}</Button>
        </div>
      </div>
    </div>
  );
}

function VoidDialog({ invoice, onClose, onSaved }: { invoice: OpsSubscriptionInvoiceRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!invoice) return null;

  const submit = async () => {
    if (!reason.trim()) { setError('Void reason is required'); return; }
    setSaving(true);
    setError('');
    try {
      await voidOpsSubscriptionInvoice(invoice.id, reason.trim());
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to void invoice'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Void Invoice</h3>
            <p className="text-sm text-muted-foreground">{invoice.invoice_number} - {invoice.organization_name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {error && <p className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="Reason"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>{saving ? 'Voiding...' : 'Void'}</Button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDetailDrawer({
  invoice,
  onClose,
  onGenerate,
}: {
  invoice: OpsSubscriptionInvoiceRow | null;
  onClose: () => void;
  onGenerate: (invoice: OpsSubscriptionInvoiceRow) => void;
}) {
  if (!invoice) return null;
  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <p className="font-mono text-sm font-semibold text-primary">{invoice.invoice_number}</p>
            <h2 className="text-lg font-bold text-foreground">{invoice.organization_name}</h2>
            <p className="text-sm text-muted-foreground">{invoice.organization_email || invoice.organization_slug}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onGenerate(invoice)} className="rounded-lg p-2 hover:bg-muted" aria-label="Generate invoice" title="Generate invoice"><Download className="h-4 w-4" /></button>
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <section className="rounded-lg border border-border p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Subscription</p>
                <p className="font-semibold text-foreground">{invoice.plan_name || 'Custom plan'}</p>
              </div>
              {statusBadge(invoice.effective_status)}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Amount</p><p className="font-medium">{money(invoice.amount)}</p></div>
              <div><p className="text-muted-foreground">Tax</p><p className="font-medium">{money(invoice.tax_amount)}</p></div>
              <div><p className="text-muted-foreground">Total</p><p className="font-medium">{money(invoice.total_amount)}</p></div>
              <div><p className="text-muted-foreground">Due</p><p className="font-medium">{dateLabel(invoice.due_date)}</p></div>
              <div><p className="text-muted-foreground">Billing</p><p className="font-medium capitalize">{invoice.billing_cycle || '-'}</p></div>
              <div><p className="text-muted-foreground">Paid At</p><p className="font-medium">{dateLabel(invoice.paid_at)}</p></div>
            </div>
          </section>
          {(invoice.payment_method || invoice.payment_reference) && (
            <section className="rounded-lg border border-border p-4 text-sm">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Payment</p>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-muted-foreground">Method</p><p className="font-medium">{invoice.payment_method || '-'}</p></div>
                <div><p className="text-muted-foreground">Reference</p><p className="font-medium">{invoice.payment_reference || '-'}</p></div>
              </div>
            </section>
          )}
          {invoice.notes && (
            <section className="rounded-lg border border-border p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
            </section>
          )}
          {invoice.void_reason && (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-600">Void Reason</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{invoice.void_reason}</p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function InvoicesTab() {
  const { internalRole } = useAuthStore();
  const canManage = canOps(internalRole, OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS);
  const [summary, setSummary] = useState<OpsSubscriptionInvoiceSummary | null>(null);
  const [rows, setRows] = useState<OpsSubscriptionInvoiceRow[]>([]);
  const [organizations, setOrganizations] = useState<OpsSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: '', dueWindow: '' });
  const [formInvoice, setFormInvoice] = useState<OpsSubscriptionInvoiceRow | null | undefined>(undefined);
  const [paidInvoice, setPaidInvoice] = useState<OpsSubscriptionInvoiceRow | null>(null);
  const [voidInvoice, setVoidInvoice] = useState<OpsSubscriptionInvoiceRow | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<OpsSubscriptionInvoiceRow | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const [invoiceData, summaryData, subscriptionData] = await Promise.all([
        listOpsSubscriptionInvoices({
          search: filters.search || undefined,
          status: filters.status || undefined,
          dueWindow: filters.dueWindow || undefined,
          limit: 100,
        }),
        getOpsSubscriptionInvoiceSummary(),
        listOpsSubscriptions({ limit: 100 }),
      ]);
      setRows(invoiceData.data);
      setSummary(summaryData);
      setOrganizations(subscriptionData.data.filter((row) => row.subscription_id));
    } catch (err: any) {
      setRows([]);
      setActionError(getErrorMessage(err, 'Failed to load subscription invoices'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const statValues = useMemo(() => ({
    pending: summary?.pending || 0,
    overdue: summary?.overdue || 0,
    paid: summary?.paid || 0,
    voided: summary?.voided || 0,
    outstanding: money(summary?.outstanding_amount),
    collected: money(summary?.collected_amount),
  }), [summary]);

  const reload = async () => {
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Subscription Invoices</h2>
          <p className="text-sm text-muted-foreground">Create and reconcile subscription invoices across organizations</p>
        </div>
        {canManage && (
          <Button onClick={() => setFormInvoice(null)} className="gap-2">
            <Plus className="h-4 w-4" /> Create Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
        <StatCard icon={ReceiptText} label="Pending" value={statValues.pending} />
        <StatCard icon={AlertTriangle} label="Overdue" value={statValues.overdue} />
        <StatCard icon={CheckCircle2} label="Paid" value={statValues.paid} />
        <StatCard icon={Ban} label="Voided" value={statValues.voided} />
        <StatCard icon={IndianRupee} label="Outstanding" value={statValues.outstanding} />
        <StatCard icon={Wallet} label="Collected" value={statValues.collected} />
      </div>

      <div className="ops-panel p-3 grid grid-cols-1 md:grid-cols-[1fr_170px_170px] gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search invoice or organization..." className="pl-9" />
        </div>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, dueWindow: '' }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <select value={filters.dueWindow} onChange={(e) => setFilters((f) => ({ ...f, dueWindow: e.target.value, status: '' }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">All due dates</option>
          <option value="overdue">Overdue</option>
          <option value="due_7">Due in 7 days</option>
          <option value="due_30">Due in 30 days</option>
        </select>
      </div>

      {actionError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{actionError}</div>}

      <div className="ops-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">Loading invoices...</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">No subscription invoices match the current filters.</TableCell></TableRow>}
            {!loading && rows.map((invoice) => {
              const canChange = canManage && invoice.status === 'pending';
              return (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <p className="font-mono text-xs font-semibold text-primary">{invoice.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">{dateLabel(invoice.created_at)}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-foreground">{invoice.organization_name}</p>
                    <p className="text-xs text-muted-foreground">{invoice.organization_email || invoice.organization_slug}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{invoice.plan_name || 'Custom plan'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{invoice.billing_cycle || '-'}</p>
                  </TableCell>
                  <TableCell>{money(invoice.amount)}</TableCell>
                  <TableCell>{money(invoice.tax_amount)}</TableCell>
                  <TableCell className="font-semibold">{money(invoice.total_amount)}</TableCell>
                  <TableCell>{dateLabel(invoice.due_date)}</TableCell>
                  <TableCell>{statusBadge(invoice.effective_status)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setDetailInvoice(invoice)} className="rounded-lg p-1.5 hover:bg-muted" title="View details"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => generateInvoiceDocument(invoice)} className="rounded-lg p-1.5 hover:bg-muted" title="Generate invoice"><Download className="h-4 w-4" /></button>
                      {canChange && (
                        <>
                          <button onClick={() => setFormInvoice(invoice)} className="rounded-lg p-1.5 hover:bg-muted" title="Edit"><Edit3 className="h-4 w-4" /></button>
                          <button onClick={() => setPaidInvoice(invoice)} className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50" title="Mark paid"><CheckCircle2 className="h-4 w-4" /></button>
                          <button onClick={() => setVoidInvoice(invoice)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10" title="Void"><Ban className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {formInvoice !== undefined && <InvoiceFormModal invoice={formInvoice} organizations={organizations} onClose={() => setFormInvoice(undefined)} onSaved={reload} />}
      <MarkPaidDialog invoice={paidInvoice} onClose={() => setPaidInvoice(null)} onSaved={reload} />
      <VoidDialog invoice={voidInvoice} onClose={() => setVoidInvoice(null)} onSaved={reload} />
      <InvoiceDetailDrawer invoice={detailInvoice} onClose={() => setDetailInvoice(null)} onGenerate={generateInvoiceDocument} />
    </div>
  );
}
