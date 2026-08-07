import api from '@/lib/api';

export type SubscriptionSource = 'catalog' | 'custom' | 'signup_offer' | 'free_trial' | 'free_plan' | 'manual';
export type SubscriptionMode = 'catalog' | 'custom';
export type BillingCycle = 'monthly' | 'yearly';

export interface OpsSubscriptionSummary {
  active_paid: number;
  free_plan: number;
  free_trial: number;
  signup_offer: number;
  custom: number;
  expiring_soon: number;
  expired: number;
}

export interface OpsSubscriptionRow {
  tenant_id: string;
  organization_name: string;
  slug: string;
  organization_status: string;
  lifecycle_stage: string;
  primary_email: string | null;
  trial_ends_at: string | null;
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_slug: string | null;
  custom_plan_name: string | null;
  subscription_source: SubscriptionSource | null;
  effective_source: SubscriptionSource;
  subscription_status: string | null;
  billing_cycle: BillingCycle | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
  amount: string | number | null;
  base_price: string | number | null;
  is_custom_pricing: boolean | null;
  internal_notes: string | null;
  offer_redemption_id: string | null;
  offer_name: string | null;
  offer_code: string | null;
  offer_type: string | null;
  redeemed_at: string | null;
}

export interface SubscriptionCatalog {
  plans: any[];
  modules: any[];
  features: any[];
  resources: any[];
}

export interface OpsSubscriptionDetail {
  tenant: any;
  current: any | null;
  history: any[];
  offerRedemption: any | null;
  invoices: any[];
  transactions: any[];
  activity: any[];
}

export interface AssignSubscriptionPayload {
  mode: SubscriptionMode;
  planId?: string;
  customPlanName?: string;
  billingCycle: BillingCycle;
  subscriptionSource: SubscriptionSource;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  amount?: number;
  basePrice?: number;
  selectedModules?: string[];
  selectedFeatures?: string[];
  resourceQuantities?: Record<string, number>;
  internalNotes?: string;
  signupOfferRedemptionId?: string;
}

export type UpdateSubscriptionPayload = Partial<AssignSubscriptionPayload>;

export async function listOpsSubscriptions(params?: Record<string, any>) {
  const { data } = await api.get('/operations/subscriptions', { params });
  return { data: data.data as OpsSubscriptionRow[], meta: data.meta };
}

export async function getOpsSubscriptionSummary(): Promise<OpsSubscriptionSummary> {
  const { data } = await api.get('/operations/subscriptions/summary');
  return data.data;
}

export async function getOpsSubscriptionCatalog(): Promise<SubscriptionCatalog> {
  const { data } = await api.get('/operations/subscriptions/catalog');
  return data.data;
}

export async function getOpsSubscriptionDetail(tenantId: string): Promise<OpsSubscriptionDetail> {
  const { data } = await api.get(`/operations/subscriptions/${tenantId}`);
  return data.data;
}

export async function assignOpsSubscription(tenantId: string, payload: AssignSubscriptionPayload) {
  const { data } = await api.post(`/operations/subscriptions/${tenantId}/assign`, payload);
  return data.data;
}

export async function updateCurrentOpsSubscription(tenantId: string, payload: UpdateSubscriptionPayload) {
  const { data } = await api.put(`/operations/subscriptions/${tenantId}/current`, payload);
  return data.data;
}

export async function renewOpsSubscription(tenantId: string, payload: { currentPeriodStart: string; currentPeriodEnd: string; nextBillingDate: string; amount?: number; internalNotes?: string }) {
  const { data } = await api.post(`/operations/subscriptions/${tenantId}/renew`, payload);
  return data.data;
}

export async function cancelOpsSubscription(tenantId: string, reason?: string) {
  const { data } = await api.post(`/operations/subscriptions/${tenantId}/cancel`, { reason });
  return data.data;
}
