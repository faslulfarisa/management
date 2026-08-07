import api from '@/lib/api';

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  workflow_type: string;
  entity_id: string;
  entity_table: string;
  submitted_by: string;
  submitted_by_email?: string;
  branch_id: string | null;
  branch_name?: string;
  department_id: string | null;
  title: string;
  description: string | null;
  current_step: number;
  total_steps: number | null;
  status: 'pending' | 'under_review' | 'approved' | 'partially_approved' | 'rejected' | 'escalated' | 'cancelled' | 'expired';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sla_hours: number | null;
  due_at: string | null;
  approval_log: ApprovalLogEntry[];
  rejection_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ApprovalLogEntry {
  step: number;
  actor_id: string;
  action: 'approved' | 'rejected' | 'escalated' | 'cancelled';
  reason: string;
  remarks?: string;
  timestamp: string;
  role?: string;
  ip_address?: string;
}

export interface ApprovalAnalytics {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  expired: number;
  rejection_rate: number;
  avg_resolution_hours: number | null;
  sla_breach_count: number;
  by_workflow_type: Array<{
    workflow_type: string;
    total: number;
    approved: number;
    rejected: number;
    avg_hours: number | null;
  }>;
}

export interface InboxFilters {
  page?: number;
  limit?: number;
  workflow_type?: string;
  branch_id?: string;
  priority?: string;
  status?: string;
}

export const approvalsApi = {
  getInbox: (filters?: InboxFilters): Promise<{ data: ApprovalRequest[]; total: number }> =>
    api.get('/approvals/inbox', { params: filters }).then((r) => r.data),

  getSubmitted: (filters?: InboxFilters): Promise<{ data: ApprovalRequest[]; total: number }> =>
    api.get('/approvals/submitted', { params: filters }).then((r) => r.data),

  getHistory: (filters?: InboxFilters): Promise<{ data: ApprovalRequest[]; total: number }> =>
    api.get('/approvals/history', { params: filters }).then((r) => r.data),

  getPendingCount: (): Promise<{ count: number }> =>
    api.get('/approvals/pending-count').then((r) => r.data),

  getAnalytics: (filters?: { from?: string; to?: string; workflow_type?: string; branch_id?: string }): Promise<ApprovalAnalytics> =>
    api.get('/approvals/analytics', { params: filters }).then((r) => r.data),

  getOne: (id: string): Promise<ApprovalRequest> =>
    api.get(`/approvals/${id}`).then((r) => r.data),

  approve: (id: string, reason: string, remarks?: string): Promise<any> =>
    api.post(`/approvals/${id}/approve`, { reason, remarks }).then((r) => r.data),

  reject: (id: string, reason: string): Promise<ApprovalRequest> =>
    api.post(`/approvals/${id}/reject`, { reason }).then((r) => r.data),

  cancel: (id: string, reason?: string): Promise<ApprovalRequest> =>
    api.post(`/approvals/${id}/cancel`, { reason }).then((r) => r.data),

  escalate: (id: string): Promise<ApprovalRequest> =>
    api.post(`/approvals/${id}/escalate`).then((r) => r.data),
};
