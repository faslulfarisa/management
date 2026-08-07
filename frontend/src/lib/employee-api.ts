import api from '@/lib/api';
import type {
  EmployeeProfile,
  EmployeeHoliday,
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
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface HolidayCalendarParams {
  date_from?: string;
  date_to?: string;
  upcoming?: boolean;
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
  duration?: 'full_day' | 'half_day';
  priority?: 'low' | 'normal' | 'high';
}

export interface CorrectionRequestPayload {
  attendance_date: string;
  requested_clock_in?: string;
  requested_clock_out?: string;
  reason: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface ShiftChangeRequestPayload {
  date: string;
  requested_shift: string;
  reason: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface OvertimeRequestPayload {
  date: string;
  hours: number;
  reason: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface ExpenseRequestPayload {
  category: string;
  amount: number;
  date: string;
  description: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface FineAppealRequestPayload {
  fine_id: string;
  reason: string;
  requested_change?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface EmployeeFine {
  id: string;
  title: string;
  description?: string | null;
  fine_amount: number | string;
  deduction_mode: string;
  payroll_month?: number | null;
  payroll_year?: number | null;
  status: string;
  category_name?: string | null;
  category_type?: string | null;
  created_at: string;
  active_appeal_id?: string | null;
  active_appeal_status?: string | null;
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
    source_module?: string | null;
    action_url?: string | null;
    action_type?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    status?: string | null;
    priority?: string | null;
    metadata?: Record<string, any> | null;
  }>;
  unread_count: number;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeLeaveBalance(balance: EmployeeLeaveBalance): EmployeeLeaveBalance {
  return {
    ...balance,
    allocated: toFiniteNumber(balance.allocated),
    used: toFiniteNumber(balance.used),
    available: toFiniteNumber(balance.available),
  };
}

function normalizePayslipComponent(component: EmployeePayslip['components'][number]): EmployeePayslip['components'][number] {
  return {
    ...component,
    amount: toFiniteNumber(component.amount),
  };
}

function normalizeEmployeePayslip(payslip: EmployeePayslip): EmployeePayslip {
  return {
    ...payslip,
    month: toFiniteNumber(payslip.month),
    year: toFiniteNumber(payslip.year),
    gross_salary: toFiniteNumber(payslip.gross_salary),
    total_deductions: toFiniteNumber(payslip.total_deductions),
    net_salary: toFiniteNumber(payslip.net_salary),
    overtime_amount: toFiniteNumber(payslip.overtime_amount),
    components: Array.isArray(payslip.components) ? payslip.components.map(normalizePayslipComponent) : [],
  };
}

function normalizePayslipDetail(detail: EnrichedPayslipDetail): EnrichedPayslipDetail {
  return {
    ...detail,
    month: toFiniteNumber(detail.month),
    year: toFiniteNumber(detail.year),
    earnings: (detail.earnings ?? []).map((item) => ({
      ...item,
      amount: toFiniteNumber(item.amount),
    })),
    deductions: (detail.deductions ?? []).map((item) => ({
      ...item,
      amount: toFiniteNumber(item.amount),
    })),
    period: {
      ...detail.period,
      month: toFiniteNumber(detail.period?.month),
      year: toFiniteNumber(detail.period?.year),
    },
    fines: (detail.fines ?? []).map((fine) => ({
      ...fine,
      amount: toFiniteNumber(fine.amount),
    })),
    totals: {
      gross_salary: toFiniteNumber(detail.totals?.gross_salary),
      total_deductions: toFiniteNumber(detail.totals?.total_deductions),
      net_salary: toFiniteNumber(detail.totals?.net_salary),
    },
    attendance: detail.attendance
      ? {
          ...detail.attendance,
          total_working_days: toFiniteNumber(detail.attendance.total_working_days),
          present_days: toFiniteNumber(detail.attendance.present_days),
          absent_days: toFiniteNumber(detail.attendance.absent_days),
          late_count: toFiniteNumber(detail.attendance.late_count),
          half_day_count: toFiniteNumber(detail.attendance.half_day_count),
          overtime_hours: toFiniteNumber(detail.attendance.overtime_hours),
        }
      : null,
  };
}

function normalizeOvertimeRequest(request: MyOvertimeRequest): MyOvertimeRequest {
  return {
    ...request,
    requested_hours: toFiniteNumber(request.requested_hours),
    approved_hours: request.approved_hours == null ? null : toFiniteNumber(request.approved_hours),
    payroll_month: request.payroll_month == null ? null : toFiniteNumber(request.payroll_month),
    payroll_year: request.payroll_year == null ? null : toFiniteNumber(request.payroll_year),
  };
}

function monthDateRange(month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const formatDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  return { date_from: formatDate(start), date_to: formatDate(end) };
}

function normalizeAttendanceSummary(raw: unknown): AttendanceMonthlySummary {
  if (Array.isArray(raw)) {
    const byStatus = new Map(raw.map((row: any) => [String(row.status), toFiniteNumber(row.count)]));
    const totalHours = raw.reduce((sum: number, row: any) => sum + toFiniteNumber(row.total_hours), 0);
    const presentOnly = byStatus.get('present') ?? 0;
    const late = byStatus.get('late') ?? 0;
    const halfDay = byStatus.get('half_day') ?? 0;
    const absent = byStatus.get('absent') ?? 0;
    const present = presentOnly + late;
    return {
      present,
      late,
      half_day: halfDay,
      absent,
      total_working_days: present + halfDay + absent,
      overtime_hours: 0,
      total_work_hours: totalHours,
    };
  }

  const summary = (raw ?? {}) as Partial<AttendanceMonthlySummary>;
  return {
    present: toFiniteNumber(summary.present),
    absent: toFiniteNumber(summary.absent),
    late: toFiniteNumber(summary.late),
    half_day: toFiniteNumber(summary.half_day),
    total_working_days: toFiniteNumber(summary.total_working_days),
    overtime_hours: toFiniteNumber(summary.overtime_hours),
    total_work_hours: toFiniteNumber(summary.total_work_hours),
  };
}

function normalizeEmployeeShift(shift: EmployeeShift): EmployeeShift {
  return {
    ...shift,
    status: shift.status ?? 'scheduled',
  };
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
    api.get('/employees/me/attendance/summary', { params: monthDateRange(month, year) })
      .then((r) => normalizeAttendanceSummary(r.data.data)),

  getHolidays: (params?: HolidayCalendarParams): Promise<EmployeeHoliday[]> =>
    api.get('/employees/me/holidays', { params }).then((r) => r.data.data ?? []),

  getUpcomingHolidays: (limit = 10): Promise<EmployeeHoliday[]> =>
    api.get('/employees/me/holidays/upcoming', { params: { limit } }).then((r) => r.data.data ?? []),

  punch: (type: 'in' | 'out', opts?: { reason_code?: string; note?: string }): Promise<EmployeeTodayAttendance> =>
    api.post('/employees/me/attendance/punch', { type, ...opts }).then((r) => r.data.data),

  getTodayBreaks: (): Promise<BreakSessionSummary> =>
    api.get('/employees/me/attendance/breaks/today').then((r) => r.data.data),

  submitCorrectionRequest: (payload: CorrectionRequestPayload): Promise<any> =>
    api.post('/attendance/requests', {
      date: payload.attendance_date,
      request_type: 'correction',
      requested_clock_in: payload.requested_clock_in || undefined,
      requested_clock_out: payload.requested_clock_out || undefined,
      reason: payload.reason,
      priority: payload.priority,
    }).then((r) => r.data),

  submitShiftChangeRequest: (payload: ShiftChangeRequestPayload): Promise<any> =>
    api.post('/attendance/requests', {
      date: payload.date,
      request_type: 'shift_change',
      reason: `Requested shift: ${payload.requested_shift}. ${payload.reason}`,
      priority: payload.priority,
    }).then((r) => r.data),

  submitOvertimeRequest: (payload: OvertimeRequestPayload): Promise<any> =>
    api.post('/attendance/requests', {
      date: payload.date,
      request_type: 'overtime',
      reason: `Overtime hours: ${payload.hours}. ${payload.reason}`,
      priority: payload.priority,
    }).then((r) => r.data),

  submitExpenseRequest: (payload: ExpenseRequestPayload): Promise<any> =>
    api.post('/finance/expenses', payload).then((r) => r.data),

  submitFineAppealRequest: (payload: FineAppealRequestPayload): Promise<any> =>
    api.post('/fines/appeals', payload).then((r) => r.data),

  getMyFines: (params?: { status?: string; limit?: number }): Promise<EmployeeFine[]> =>
    api.get('/fines/me/list', { params }).then((r) => r.data.data ?? []),

  getLeaveBalances: (): Promise<EmployeeLeaveBalance[]> =>
    api.get('/employees/me/leaves/balances').then((r) => {
      const balances = r.data.data ?? r.data;
      return Array.isArray(balances) ? balances.map(normalizeLeaveBalance) : [];
    }),

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
      data: (r.data.data ?? []).map(normalizeEmployeePayslip),
      total: r.data.meta?.total ?? 0,
      page: r.data.meta?.page ?? 1,
      limit: r.data.meta?.limit ?? params?.limit ?? 10,
    })),

  getPayslipDetail: (id: string): Promise<EnrichedPayslipDetail> =>
    api.get(`/employees/me/payslips/${id}`).then((r) => normalizePayslipDetail(r.data.data)),

  getBankAccounts: (): Promise<EmployeeBankAccount[]> =>
    api.get('/employees/me/bank-accounts').then((r) => r.data.data ?? []),

  getMyOvertimeRequests: (params?: { limit?: number }): Promise<{ data: MyOvertimeRequest[]; total: number }> =>
    api.get('/overtime/requests/my', { params }).then((r) => ({
      data: (r.data.data ?? []).map(normalizeOvertimeRequest),
      total: r.data.total ?? 0,
    })),

  getTodayShift: (params?: { date?: string }): Promise<TodayShift | null> =>
    api.get('/employees/me/shifts/today', { params }).then((r) => r.data.data),

  getShiftSchedule: (params?: ShiftScheduleParams): Promise<EmployeeShift[]> =>
    api.get('/employees/me/shifts/schedule', {
      params: {
        date_from: params?.from,
        date_to: params?.to,
      },
    }).then((r) => {
      const shifts = r.data.data ?? r.data;
      return Array.isArray(shifts) ? shifts.map(normalizeEmployeeShift) : [];
    }),

  getNotifications: (): Promise<NotificationsResponse> =>
    api.get('/dashboard/notifications').then((r) => r.data.data ?? r.data),

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
