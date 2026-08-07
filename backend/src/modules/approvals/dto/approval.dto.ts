export interface SubmitApprovalDto {
  tenantId: string;
  workflowType: string;
  entityId: string;
  entityTable: string;
  submittedBy: string;
  branchId?: string | null;
  departmentId?: string | null;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
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

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  workflow_type: string;
  entity_id: string;
  entity_table: string;
  submitted_by: string;
  branch_id: string | null;
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

export interface ApprovalResult {
  fullyApproved: boolean;
  request: ApprovalRequest;
  entity: any;
}

export interface InboxFilters {
  page?: number;
  limit?: number;
  workflowType?: string;
  branchId?: string;
  priority?: string;
  status?: string;
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
  by_workflow_type: Array<{ workflow_type: string; total: number; approved: number; rejected: number; avg_hours: number | null }>;
  by_step_bottleneck: Array<{ step: number; avg_hours: number | null; count: number }>;
}
