import api from '@/lib/api';
import type {
  EmployeeProfile,
  EmployeeTodayAttendance,
  EmployeeAttendanceRecord,
  AttendanceMonthlySummary,
  EmployeeLeaveBalance,
  EmployeeLeaveRequest,
  EmployeePayslip,
  EnrichedPayslipDetail,
  EmployeeBankAccount,
  MyOvertimeRequest,
  TodayShift,
  EmployeeShift,
  EmployeeDocument,
  BreakSessionSummary,
} from '@/types/employee';
import type {
  ExitRequest, ExitTimelineEvent, ExitChecklistItem, ExitClearance,
  ExitKnowledgeTransfer, ExitInterview, ExitInterviewQuestion, FinalSettlement,
} from '@/types/exit';
import type { AssetAssignment } from '@/types/exit';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AttendanceHistoryParams {
  month?: number;
  year?: number;
  page?: number;
  limit?: number;
}

export interface ShiftScheduleParams {
  from?: string;
  to?: string;
}

export interface LeaveApplyPayload {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
}

export interface CorrectionRequestPayload {
  attendance_date: string;
  requested_clock_in?: string;
  requested_clock_out?: string;
  reason: string;
}

export interface ShiftChangeRequestPayload {
  date: string;
  requested_shift: string;
  reason: string;
}

export interface OvertimeRequestPayload {
  date: string;
  hours: number;
  reason: string;
}

export interface ExpenseRequestPayload {
  category: string;
  amount: number;
  date: string;
  description: string;
}

export interface FineAppealRequestPayload {
  date: string;
  reason: string;
}

export interface NotificationsResponse {
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    time: string;
    read: boolean;
    href?: string;
  }>;
  unread_count: number;
}

export const employeeApi = {
  getProfile: (): Promise<EmployeeProfile> =>
    api.get('/employees/me').then((r) => r.data.data),

  getTodayAttendance: (): Promise<EmployeeTodayAttendance> =>
    api.get('/employees/me/attendance/today').then((r) => r.data.data),

  getAttendanceHistory: (params?: AttendanceHistoryParams): Promise<PaginatedResponse<EmployeeAttendanceRecord>> =>
    api.get('/employees/me/attendance', { params }).then((r) => ({
      data: r.data.data ?? [],
      total: r.data.meta?.total ?? 0,
      page: r.data.meta?.page ?? 1,
      limit: r.data.meta?.limit ?? params?.limit ?? 15,
    })),

  getAttendanceSummary: (month: number, year: number): Promise<AttendanceMonthlySummary> =>
    api.get('/employees/me/attendance/summary', { params: { month, year } }).then((r) => r.data.data),

  punch: (type: 'in' | 'out', opts?: { reason_code?: string; note?: string }): Promise<EmployeeTodayAttendance> =>
    api.post('/employees/me/attendance/punch', { type, ...opts }).then((r) => r.data.data),

  getTodayBreaks: (): Promise<BreakSessionSummary> =>
    api.get('/employees/me/attendance/breaks/today').then((r) => r.data.data),

  submitCorrectionRequest: (payload: CorrectionRequestPayload): Promise<any> =>
    api.post('/attendance/requests', payload).then((r) => r.data),

  submitShiftChangeRequest: (payload: ShiftChangeRequestPayload): Promise<any> =>
    api.post('/attendance/requests', {
      date: payload.date,
      request_type: 'shift_change',
      reason: `Requested shift: ${payload.requested_shift}. ${payload.reason}`,
    }).then((r) => r.data),

  submitOvertimeRequest: (payload: OvertimeRequestPayload): Promise<any> =>
    api.post('/attendance/requests', {
      date: payload.date,
      request_type: 'overtime',
      reason: `Overtime hours: ${payload.hours}. ${payload.reason}`,
    }).then((r) => r.data),

  submitExpenseRequest: (payload: ExpenseRequestPayload): Promise<any> =>
    api.post('/finance/expenses', payload).then((r) => r.data),

  submitFineAppealRequest: (payload: FineAppealRequestPayload): Promise<any> =>
    api.post('/attendance/requests', {
      date: payload.date,
      request_type: 'fine_appeal',
      reason: payload.reason,
    }).then((r) => r.data),

  getLeaveBalances: (): Promise<EmployeeLeaveBalance[]> =>
    api.get('/employees/me/leaves/balances').then((r) => r.data.data ?? r.data),

  getLeaveHistory: (params?: { page?: number; limit?: number }): Promise<PaginatedResponse<EmployeeLeaveRequest>> =>
    api.get('/employees/me/leaves/requests', { params }).then((r) => ({
      data: r.data.data ?? [],
      total: r.data.meta?.total ?? 0,
      page: r.data.meta?.page ?? 1,
      limit: r.data.meta?.limit ?? params?.limit ?? 10,
    })),

  applyLeave: (payload: LeaveApplyPayload): Promise<EmployeeLeaveRequest> =>
    api.post('/leaves/requests', payload).then((r) => r.data.data),

  getLeaveTypes: (): Promise<Array<{ id: string; name: string; max_days: number }>> =>
    api.get('/leaves/types').then((r) => r.data.data ?? r.data),

  getPayslips: (params?: { page?: number; limit?: number }): Promise<PaginatedResponse<EmployeePayslip>> =>
    api.get('/employees/me/payslips', { params }).then((r) => ({
      data: r.data.data ?? [],
      total: r.data.meta?.total ?? 0,
      page: r.data.meta?.page ?? 1,
      limit: r.data.meta?.limit ?? params?.limit ?? 10,
    })),

  getPayslipDetail: (id: string): Promise<EnrichedPayslipDetail> =>
    api.get(`/employees/me/payslips/${id}`).then((r) => r.data.data),

  getBankAccounts: (): Promise<EmployeeBankAccount[]> =>
    api.get('/employees/me/bank-accounts').then((r) => r.data.data ?? []),

  getMyOvertimeRequests: (params?: { limit?: number }): Promise<{ data: MyOvertimeRequest[]; total: number }> =>
    api.get('/overtime/requests/my', { params }).then((r) => ({
      data: r.data.data ?? [],
      total: r.data.total ?? 0,
    })),

  getTodayShift: (): Promise<TodayShift | null> =>
    api.get('/employees/me/shifts/today').then((r) => r.data.data),

  getShiftSchedule: (params?: ShiftScheduleParams): Promise<EmployeeShift[]> =>
    api.get('/employees/me/shifts/schedule', { params }).then((r) => r.data.data ?? r.data),

  getNotifications: (): Promise<NotificationsResponse> =>
    api.get('/dashboard/notifications').then((r) => r.data),

  markNotificationsRead: (): Promise<void> =>
    api.post('/dashboard/notifications/read').then(() => undefined),

  getDocuments: (): Promise<EmployeeDocument[]> =>
    api.get('/employees/me/documents').then((r) => r.data.data ?? r.data),

  // ── Exit / Offboarding self-service ────────────────────────────────────────
  getMyExitRequest: (): Promise<ExitRequest | null> =>
    api.get('/employees/me/exit').then((r) => r.data.data),

  submitExitRequest: (payload: {
    request_type: string; reason: string; detailed_comments?: string;
    notice_period_days?: number; requested_date: string; last_working_date?: string; attachment_url?: string;
  }): Promise<ExitRequest> =>
    api.post('/employees/me/exit', payload).then((r) => r.data.data),

  withdrawExitRequest: (id: string, reason: string): Promise<ExitRequest> =>
    api.put(`/employees/me/exit/${id}/withdraw`, { reason }).then((r) => r.data.data),

  getExitTimeline: (id: string): Promise<ExitTimelineEvent[]> =>
    api.get(`/employees/me/exit/${id}/timeline`).then((r) => r.data.data),

  getMyExitChecklist: (id: string): Promise<ExitChecklistItem[]> =>
    api.get(`/employees/me/exit/${id}/checklist`).then((r) => r.data.data),

  getMyExitClearances: (id: string): Promise<ExitClearance[]> =>
    api.get(`/employees/me/exit/${id}/clearances`).then((r) => r.data.data),

  getMyKnowledgeTransfer: (id: string): Promise<ExitKnowledgeTransfer | null> =>
    api.get(`/employees/me/exit/${id}/knowledge-transfer`).then((r) => r.data.data),

  submitKnowledgeTransfer: (id: string, payload: {
    handover_to?: string; responsibilities?: string; current_projects?: string;
    pending_tasks?: string; client_information?: string; system_access?: string; finalize?: boolean;
  }): Promise<ExitKnowledgeTransfer> =>
    api.post(`/employees/me/exit/${id}/knowledge-transfer`, payload).then((r) => r.data.data),

  getMyExitAssets: (id: string): Promise<AssetAssignment[]> =>
    api.get(`/employees/me/exit/${id}/assets`).then((r) => r.data.data),

  getMyInterviewQuestionnaire: (id: string): Promise<ExitInterviewQuestion[]> =>
    api.get(`/employees/me/exit/${id}/interview/questionnaire`).then((r) => r.data.data),

  submitExitInterview: (id: string, payload: {
    overall_rating?: number; reason_for_leaving?: string; responses: Record<string, any>;
    would_recommend?: boolean; suggestions?: string;
  }): Promise<ExitInterview> =>
    api.post(`/employees/me/exit/${id}/interview`, payload).then((r) => r.data.data),

  getMySettlement: (id: string): Promise<FinalSettlement | null> =>
    api.get(`/employees/me/exit/${id}/settlement`).then((r) => r.data.data),

  getMyExitDocuments: (id: string): Promise<any[]> =>
    api.get(`/employees/me/exit/${id}/documents`).then((r) => r.data.data),
};
