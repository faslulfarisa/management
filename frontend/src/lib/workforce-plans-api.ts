import api from './api';

export type WorkforcePlanStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'active' | 'closed' | 'cancelled';

export interface WorkforcePlanBreakdownItem {
  department_id?: string | null;
  position_id?: string | null;
  current_headcount?: number;
  budgeted_headcount?: number;
  planned_hires?: number;
  budget_amount?: number;
  justification?: string;
}

export interface WorkforcePlan {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  branch_name?: string | null;
  year: number;
  title: string;
  notes: string | null;
  breakdown: WorkforcePlanBreakdownItem[];
  total_budget_amount?: number;
  total_planned_hires?: number;
  total_budgeted_headcount?: number;
  status: WorkforcePlanStatus;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_reason: string | null;
  rejection_reason: string | null;
  approval_step: number;
  approval_log: any[];
  created_by_email?: string | null;
  created_at: string;
  updated_at: string;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const workforcePlansApi = {
  list: (filters: { status?: string; branch_id?: string; year?: number; page?: number; limit?: number } = {}): Promise<{ data: WorkforcePlan[]; total: number }> =>
    api.get(`/recruitment/workforce-plans${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<WorkforcePlan> => api.get(`/recruitment/workforce-plans/${id}`).then((r) => r.data.data),
  create: (data: Partial<WorkforcePlan>) => api.post('/recruitment/workforce-plans', data).then((r) => r.data.data),
  update: (id: string, data: Partial<WorkforcePlan>) => api.put(`/recruitment/workforce-plans/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/workforce-plans/${id}`).then((r) => r.data.data),
  submit: (id: string) => api.post(`/recruitment/workforce-plans/${id}/submit`).then((r) => r.data.data),
  approve: (id: string, reason: string, remarks?: string) =>
    api.post(`/recruitment/workforce-plans/${id}/approve`, { reason, remarks }).then((r) => r.data.data),
  reject: (id: string, reason: string) => api.post(`/recruitment/workforce-plans/${id}/reject`, { reason }).then((r) => r.data.data),
  close: (id: string) => api.post(`/recruitment/workforce-plans/${id}/close`).then((r) => r.data.data),
};
