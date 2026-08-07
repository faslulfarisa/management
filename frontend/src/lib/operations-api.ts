import api from '@/lib/api';
import type { OrgLifecycleStage } from '@/lib/organization-lifecycle';
import type { InternalRole } from '@/lib/internal-roles';

export interface OpsOrganization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
  lifecycle_stage: OrgLifecycleStage;
  approval_status: string;
  primary_email: string | null;
  phone_number: string | null;
  industry: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpsDashboardStats {
  totalOrganizations: number;
  newRegistrations: number;
  pendingReview: number;
  pendingApproval: number;
  onboarding: number;
  activeCustomers: number;
  suspendedCustomers: number;
  archivedOrganizations: number;
  openSupportTickets: number | null;
}

export async function getOpsDashboardStats(): Promise<OpsDashboardStats> {
  const { data } = await api.get('/operations/dashboard');
  return data.data;
}

export interface OpsAnalytics {
  byStage: Record<OrgLifecycleStage, number>;
  monthlyRegistrations: { month: string; count: number }[];
}

export async function getOpsAnalytics(): Promise<OpsAnalytics> {
  const { data } = await api.get('/operations/reports/analytics');
  return data.data;
}

export interface OpsActivityEntry {
  id: string;
  tenant_id: string;
  organization_name: string | null;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values: any;
  new_values: any;
  created_at: string;
}

export async function getOpsActivityLog(params?: { page?: number; limit?: number }) {
  const { data } = await api.get('/operations/reports/activity', { params });
  return { data: data.data as OpsActivityEntry[], meta: data.meta };
}

export async function listOpsOrganizations(params: { stage?: string; search?: string; page?: number; limit?: number }) {
  const { data } = await api.get('/operations/organizations', { params });
  return { data: data.data as OpsOrganization[], meta: data.meta };
}

export async function getOpsOrganization(id: string): Promise<OpsOrganization> {
  const { data } = await api.get(`/operations/organizations/${id}`);
  return data.data;
}

export async function getOpsOrganizationActivity(id: string, params?: { page?: number; limit?: number }) {
  const { data } = await api.get(`/operations/organizations/${id}/activity`, { params });
  return { data: data.data, meta: data.meta };
}

export async function createOpsOrganization(payload: Record<string, any>): Promise<OpsOrganization> {
  const { data } = await api.post('/operations/organizations', payload);
  return data.data;
}

export async function updateOpsOrganization(id: string, payload: Record<string, any>): Promise<OpsOrganization> {
  const { data } = await api.put(`/operations/organizations/${id}`, payload);
  return data.data;
}

export async function deleteOpsOrganization(id: string): Promise<void> {
  await api.delete(`/operations/organizations/${id}`);
}

export async function transitionOpsOrganization(id: string, stage: OrgLifecycleStage, reason?: string): Promise<OpsOrganization> {
  const { data } = await api.post(`/operations/organizations/${id}/transition`, { stage, reason });
  return data.data;
}

export async function suspendOpsOrganization(id: string, reason?: string): Promise<OpsOrganization> {
  const { data } = await api.post(`/operations/organizations/${id}/suspend`, { reason });
  return data.data;
}

export async function activateOpsOrganization(id: string, reason?: string): Promise<OpsOrganization> {
  const { data } = await api.post(`/operations/organizations/${id}/activate`, { reason });
  return data.data;
}

export async function archiveOpsOrganization(id: string, reason?: string): Promise<OpsOrganization> {
  const { data } = await api.post(`/operations/organizations/${id}/archive`, { reason });
  return data.data;
}

export async function changeOpsOrganizationOwnership(id: string, newOwnerUserId: string): Promise<void> {
  await api.post(`/operations/organizations/${id}/ownership`, { newOwnerUserId });
}

// ── Internal staff directory (platform admin only) ──────────────────────

export interface InternalStaffMember {
  id: string;
  email: string;
  full_name: string | null;
  internal_role: InternalRole;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export async function listInternalStaff(): Promise<InternalStaffMember[]> {
  const { data } = await api.get('/operations/staff');
  return data.data;
}

export async function createInternalStaff(payload: { email: string; password: string; fullName?: string; internalRole: InternalRole }): Promise<InternalStaffMember> {
  const { data } = await api.post('/operations/staff', payload);
  return data.data;
}

export async function updateInternalStaff(id: string, payload: { internalRole?: InternalRole; fullName?: string }): Promise<InternalStaffMember> {
  const { data } = await api.put(`/operations/staff/${id}`, payload);
  return data.data;
}

export async function deactivateInternalStaff(id: string): Promise<void> {
  await api.post(`/operations/staff/${id}/deactivate`);
}

export async function reactivateInternalStaff(id: string): Promise<void> {
  await api.post(`/operations/staff/${id}/reactivate`);
}

export async function resetInternalStaffPassword(id: string, password: string): Promise<void> {
  await api.post(`/operations/staff/${id}/reset-password`, { password });
}

export async function deleteInternalStaff(id: string): Promise<void> {
  await api.delete(`/operations/staff/${id}`);
}
