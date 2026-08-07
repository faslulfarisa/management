export interface EmployeeProfile {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  branch_id: string;
  branch_name?: string;
  department_id: string;
  department_name?: string;
  designation_id?: string;
  designation_name?: string;
  date_of_joining: string;
  status: 'active' | 'inactive' | 'probation' | 'confirmed';
  is_manager: boolean;
  avatar_url?: string;
  reporting_manager_name?: string;
  reporting_manager_id?: string;
}

export interface EmployeeAttendanceRecord {
  id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'present' | 'absent' | 'late' | 'half_day';
  late_minutes: number;
  overtime_minutes: number;
  shift_name?: string;
  shift_start?: string;
  shift_end?: string;
  source?: string;
}

export interface CurrentBreakSession {
  id: string;
  break_code: string;
  category: 'temporary_break' | 'official_outside' | 'emergency';
  reason_label: string;
  note: string | null;
  started_at: string;
  allowed_minutes: number | null;
  is_paid: boolean;
}

export interface BreakSession {
  id: string;
  break_code: string;
  category: 'temporary_break' | 'official_outside' | 'emergency';
  reason_label: string;
  note: string | null;
  status: 'active' | 'completed';
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  allowed_minutes: number | null;
  is_paid: boolean;
  overdue_minutes: number;
  is_overdue: boolean;
}

export interface BreakLimit {
  allowed_minutes: number | null;
  paid: boolean;
}

export interface BreakSessionSummary {
  breaks: BreakSession[];
  limits: Record<string, BreakLimit>;
}

export interface EmployeeTodayAttendance {
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'present' | 'absent' | 'late' | 'half_day' | null;
  late_minutes: number;
  overtime_minutes: number;
  is_punched_in: boolean;
  shift_name?: string;
  shift_start?: string;
  shift_end?: string;
  is_on_break: boolean;
  current_break: CurrentBreakSession | null;
  total_break_minutes: number;
  total_overdue_break_minutes: number;
  last_punch_out_reason_code?: string | null;
  last_punch_out_note?: string | null;
}

export interface EmployeeLeaveBalance {
  leave_type_id: string;
  leave_type_name: string;
  allocated: number;
  used: number;
  available: number;
}

export interface EmployeeLeaveRequest {
  id: string;
  leave_type_id: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approval_request_id?: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayslip {
  id: string;
  month: number;
  year: number;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  overtime_amount: number;
  status: 'draft' | 'processed' | 'paid';
  paid_at?: string;
  components: PayslipComponent[];
}

export interface PayslipComponent {
  label: string;
  amount: number;
  type: 'earning' | 'deduction';
}

export interface EmployeeShift {
  id: string;
  date: string;
  shift_name: string;
  shift_code?: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  status: 'scheduled' | 'completed' | 'absent';
}

export interface TodayShift {
  shift_name: string;
  shift_code?: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  grace_period_minutes?: number;
}

export interface EmployeeDocument {
  id: string;
  name: string;
  type: 'payslip' | 'contract' | 'hr_letter' | 'warning_letter' | 'offer_letter' | 'other';
  url: string;
  created_at: string;
  file_size?: number;
}

export interface AttendanceMonthlySummary {
  present: number;
  absent: number;
  late: number;
  half_day: number;
  total_working_days: number;
  overtime_hours: number;
}

export type EmployeeNavTab = 'home' | 'attendance' | 'requests' | 'notifications' | 'profile';

export interface PayslipFine {
  id: string;
  title: string;
  category: string | null;
  amount: number;
  description: string | null;
}

export interface EmployeeBankAccount {
  id: string;
  account_holder_name: string;
  bank_name: string;
  account_number_masked: string;
  ifsc_code: string;
  account_type: string;
  upi_id: string | null;
  is_primary: boolean;
  verification_status: string;
}

export interface MyOvertimeRequest {
  id: string;
  ot_date: string;
  requested_hours: number;
  approved_hours: number | null;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'cancelled';
  payroll_month: number | null;
  payroll_year: number | null;
  reason: string;
}

export interface EnrichedPayslipDetail {
  id: string;
  payslip_number: string | null;
  month: number;
  year: number;
  status: 'draft' | 'processed' | 'paid';
  paid_at: string | null;
  remarks: string | null;
  snapshot_data: Record<string, unknown> | null;

  employee: {
    id: string;
    employee_code: string;
    first_name: string;
    last_name: string;
    designation_name: string | null;
    department_name: string | null;
    branch_name: string | null;
    date_of_joining: string | null;
    pan_number: string | null;
    uan_number: string | null;
  };

  company: {
    name: string;
    legal_name: string | null;
    gstin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logo_url: string | null;
    header_color: string | null;
    accent_color: string | null;
    footer_text: string | null;
    watermark_enabled: boolean;
    watermark_text: string | null;
    watermark_opacity: number;
    show_gstin: boolean;
    show_address: boolean;
  };

  period: {
    month: number;
    year: number;
    period_label: string;
    payslip_number: string;
  };

  earnings: Array<{ label: string; amount: number }>;
  deductions: Array<{ label: string; amount: number }>;
  fines: PayslipFine[];

  totals: {
    gross_salary: number;
    total_deductions: number;
    net_salary: number;
  };

  attendance: {
    total_working_days: number;
    present_days: number;
    absent_days: number;
    late_count: number;
    half_day_count: number;
    overtime_hours: number;
  } | null;

  payment: {
    id: string;
    status: string;
    method: string;
    gateway: string | null;
    transaction_reference: string | null;
    payment_date: string | null;
    paid_at: string | null;
  } | null;
}
