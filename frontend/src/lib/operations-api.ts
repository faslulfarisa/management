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
  legal_name?: string | null;
  trade_name?: string | null;
  company_code?: string | null;
  registration_number?: string | null;
  gstin?: string | null;
  pan_number?: string | null;
  cin_number?: string | null;
  company_type?: string | null;
  company_size?: string | null;
  primary_email: string | null;
  support_email?: string | null;
  phone_number: string | null;
  alternate_phone?: string | null;
  website_url?: string | null;
  industry: string | null;
  registered_address?: Record<string, string> | null;
  operational_address?: Record<string, string> | null;
  emp_code_prefix?: string | null;
  emp_code_digits?: number | null;
  fiscal_year_start?: number | null;
  timezone?: string | null;
  currency?: string | null;
  currency_symbol?: string | null;
  currency_metadata?: Record<string, unknown> | null;
  date_format?: string | null;
  max_failed_login_attempts?: number | null;
  contact_person_name?: string | null;
  contact_designation?: string | null;
  contact_person_mobile?: string | null;
  contact_person_email?: string | null;
  estimated_employee_count?: number | null;
  estimated_branch_count?: number | null;
  business_category?: string | null;
  current_hr_system?: string | null;
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

export interface OpsOwnershipCandidate {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  employee_code: string | null;
  department: string | null;
  user_type: string | null;
  is_org_admin: boolean;
  is_current_admin: boolean;
  is_active: boolean;
}

export interface OpsOrganizationMember {
  id: string;
  email: string;
  phone: string | null;
  username: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  employee_code: string | null;
  position_name: string | null;
  department: string | null;
  user_type: string | null;
  is_org_admin: boolean;
  is_current_admin: boolean;
  is_active: boolean;
  membership_created_at: string;
}

export async function listOpsOwnershipCandidates(id: string, search?: string): Promise<OpsOwnershipCandidate[]> {
  const { data } = await api.get(`/operations/organizations/${id}/ownership-candidates`, { params: search ? { search } : undefined });
  return data.data;
}

export async function listOpsOrganizationMembers(id: string): Promise<OpsOrganizationMember[]> {
  const { data } = await api.get(`/operations/organizations/${id}/members`);
  return data.data;
}

export interface OpsClientUserCandidate {
  id: string;
  email: string;
  phone: string | null;
  username: string | null;
  full_name: string | null;
  display_name: string;
  employee_code: string | null;
  user_type: string | null;
  is_active: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_legal_name: string | null;
  created_at: string;
}

export async function searchOpsClientUsers(search?: string): Promise<OpsClientUserCandidate[]> {
  const { data } = await api.get('/operations/client-users', { params: { q: search || '', limit: 20 } });
  return data.data;
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

export async function resetOpsOrganizationAdminPassword(id: string, password: string): Promise<void> {
  await api.post(`/operations/organizations/${id}/admin/reset-password`, { password });
}

// ── Internal staff directory (platform admin only) ──────────────────────

export interface InternalStaffMember {
  id: string;
  email: string;
  username: string | null;
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

export async function createInternalStaff(payload: { email: string; password: string; username?: string | null; fullName?: string; internalRole: InternalRole }): Promise<InternalStaffMember> {
  const { data } = await api.post('/operations/staff', payload);
  return data.data;
}

export async function updateInternalStaff(id: string, payload: { internalRole?: InternalRole; fullName?: string; username?: string | null }): Promise<InternalStaffMember> {
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
