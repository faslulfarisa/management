import api from '@/lib/api';

export type SubscriptionInvoiceStatus = 'pending' | 'paid' | 'void' | 'overdue';

export interface OpsSubscriptionInvoiceSummary {
  pending: number;
  overdue: number;
  paid: number;
  voided: number;
  outstanding_amount: string | number;
  collected_amount: string | number;
}

export interface OpsSubscriptionInvoiceRow {
  id: string;
  tenant_id: string;
  subscription_id: string;
  invoice_number: string;
  amount: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  status: string;
  effective_status: SubscriptionInvoiceStatus;
  due_date: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  void_reason: string | null;
  organization_name: string;
  organization_slug: string;
  organization_email: string | null;
  billing_cycle: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  plan_name: string | null;
}

export interface CreateSubscriptionInvoicePayload {
  tenantId: string;
  subscriptionId?: string;
  invoiceNumber?: string;
  amount?: number;
  taxAmount?: number;
  dueDate: string;
  notes?: string;
}

export interface UpdateSubscriptionInvoicePayload {
  invoiceNumber?: string;
  amount?: number;
  taxAmount?: number;
  dueDate?: string;
  notes?: string;
}

export async function listOpsSubscriptionInvoices(params?: Record<string, any>) {
  const { data } = await api.get('/operations/subscription-invoices', { params });
  return { data: data.data as OpsSubscriptionInvoiceRow[], meta: data.meta };
}

export async function getOpsSubscriptionInvoiceSummary(): Promise<OpsSubscriptionInvoiceSummary> {
  const { data } = await api.get('/operations/subscription-invoices/summary');
  return data.data;
}

export async function createOpsSubscriptionInvoice(payload: CreateSubscriptionInvoicePayload) {
  const { data } = await api.post('/operations/subscription-invoices', payload);
  return data.data as OpsSubscriptionInvoiceRow;
}

export async function updateOpsSubscriptionInvoice(id: string, payload: UpdateSubscriptionInvoicePayload) {
  const { data } = await api.put(`/operations/subscription-invoices/${id}`, payload);
  return data.data as OpsSubscriptionInvoiceRow;
}

export async function markOpsSubscriptionInvoicePaid(id: string, payload: { paymentMethod: string; paymentReference?: string; gateway?: string }) {
  const { data } = await api.post(`/operations/subscription-invoices/${id}/mark-paid`, payload);
  return data.data as OpsSubscriptionInvoiceRow;
}

export async function voidOpsSubscriptionInvoice(id: string, reason: string) {
  const { data } = await api.post(`/operations/subscription-invoices/${id}/void`, { reason });
  return data.data as OpsSubscriptionInvoiceRow;
}
