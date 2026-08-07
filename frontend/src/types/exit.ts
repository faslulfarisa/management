export type ExitRequestStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'withdrawn'
  | 'notice_period' | 'clearance_in_progress' | 'pending_settlement'
  | 'settled' | 'completed' | 'cancelled';

export type ExitRequestType =
  | 'resignation' | 'retirement' | 'termination'
  | 'contract_completion' | 'mutual_separation' | 'absconding';

export interface ExitRequest {
  id: string;
  tenant_id: string;
  employee_id: string;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  request_type: ExitRequestType;
  reason: string;
  remarks?: string | null;
  notice_period_days: number;
  requested_date: string;
  last_working_date: string;
  notice_start_date?: string | null;
  notice_end_date?: string | null;
  status: ExitRequestStatus;
  approved_by?: string | null;
  approved_by_email?: string | null;
  approval_date?: string | null;
  rejection_reason?: string | null;
  withdrawn_at?: string | null;
  withdrawn_reason?: string | null;
  branch_id?: string | null;
  attendance_frozen_at?: string | null;
  account_deactivated_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExitTimelineEvent {
  id: string;
  stage: string;
  label: string;
  description?: string | null;
  actor_id?: string | null;
  actor_email?: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ExitChecklistItem {
  id: string;
  exit_request_id: string;
  item: string;
  department: string;
  assigned_to?: string | null;
  assigned_to_email?: string | null;
  status: 'pending' | 'completed';
  is_mandatory: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string | null;
  remarks?: string | null;
  completed_at?: string | null;
  sort_order: number;
}

export type ExitClearanceStatus = 'pending' | 'in_review' | 'cleared' | 'rejected' | 'returned' | 'blocked';

export interface ExitClearance {
  id: string;
  exit_request_id: string;
  department: string;
  cleared_by?: string | null;
  cleared_by_email?: string | null;
  status: ExitClearanceStatus;
  is_mandatory: boolean;
  remarks?: string | null;
  cleared_at?: string | null;
  due_date?: string | null;
}

export interface ExitKnowledgeTransfer {
  id: string;
  exit_request_id: string;
  handover_to?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  responsibilities?: string | null;
  current_projects?: string | null;
  pending_tasks?: string | null;
  client_information?: string | null;
  system_access?: string | null;
  status: 'pending' | 'submitted' | 'reviewed' | 'approved';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_remarks?: string | null;
  submitted_at?: string | null;
}

export interface ExitInterviewQuestion {
  key: string;
  label: string;
  type: 'choice' | 'rating' | 'boolean' | 'text';
  options?: string[];
}

export interface ExitInterview {
  id: string;
  exit_request_id: string;
  scheduled_at?: string | null;
  conducted_by?: string | null;
  status: 'pending' | 'scheduled' | 'completed' | 'skipped';
  overall_rating?: number | null;
  reason_for_leaving?: string | null;
  responses: Record<string, any>;
  would_recommend?: boolean | null;
  suggestions?: string | null;
  manager_feedback?: string | null;
  hr_feedback?: string | null;
  completed_at?: string | null;
}

export type SettlementPaymentStatus = 'pending' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'on_hold';

export interface FinalSettlement {
  id: string;
  exit_request_id: string;
  employee_id: string;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  basic_salary: number;
  allowances: number;
  gratuity: number;
  leave_encashment: number;
  bonus: number;
  deductions: number;
  notice_pay_recovery: number;
  asset_recovery: number;
  tax_deduction: number;
  loan_recovery: number;
  total_payable: number;
  total_deductions: number;
  net_payable: number;
  payment_status: SettlementPaymentStatus;
  payment_date?: string | null;
  calc_breakdown?: Record<string, any>;
  is_auto_calculated: boolean;
  manual_adjustment_reason?: string | null;
  remarks?: string | null;
}

export interface ExitStats {
  pending_requests: number;
  approvals_pending: number;
  notice_period: number;
  clearances_pending: number;
  assets_pending: number;
  fnf_pending: number;
  interviews_pending: number;
  completed_exits: number;
}

export interface AssetAssignment {
  id: string;
  asset_item_id: string;
  employee_id: string;
  asset_name: string;
  asset_code: string;
  asset_type_name: string;
  assigned_at: string;
  expected_return_date?: string | null;
  returned_at?: string | null;
  return_condition?: 'good' | 'damaged' | 'lost' | null;
  recovery_amount: number;
  exit_request_id?: string | null;
  status: 'active' | 'returned' | 'recovery_pending' | 'written_off';
  notes?: string | null;
}

export const EXIT_REQUEST_TYPE_LABELS: Record<ExitRequestType, string> = {
  resignation: 'Resignation',
  retirement: 'Retirement',
  termination: 'Termination',
  contract_completion: 'Contract Completion',
  mutual_separation: 'Mutual Separation',
  absconding: 'Absconding',
};

export const EXIT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-100 text-gray-700',
  notice_period: 'bg-purple-100 text-purple-800',
  clearance_in_progress: 'bg-indigo-100 text-indigo-800',
  pending_settlement: 'bg-orange-100 text-orange-800',
  settled: 'bg-teal-100 text-teal-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-800',
  in_review: 'bg-indigo-100 text-indigo-800',
  cleared: 'bg-green-100 text-green-800',
  blocked: 'bg-red-100 text-red-800',
  returned: 'bg-teal-100 text-teal-800',
  paid: 'bg-green-100 text-green-800',
  pending_approval_settlement: 'bg-yellow-100 text-yellow-800',
  on_hold: 'bg-gray-100 text-gray-700',
  recovery_pending: 'bg-orange-100 text-orange-800',
  active: 'bg-blue-100 text-blue-800',
  written_off: 'bg-red-100 text-red-800',
};
