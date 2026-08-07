export interface FilterState {
  date_from?: string;
  date_to?: string;
  branch_id?: string;
  department_id?: string;
  employee_id?: string;
  page?: number;
  limit?: number;
  shift_id?: string;
  designation_id?: string;
  attendance_status?: string;
  verification_method?: string;
  device_id?: string;
  payroll_month?: number;
  payroll_year?: number;
  leave_type_id?: string;
}

export type FilterField =
  | 'date_range'
  | 'branch'
  | 'department'
  | 'designation'
  | 'employee'
  | 'shift'
  | 'attendance_status'
  | 'leave_type'
  | 'verification_method'
  | 'device'
  | 'payroll_cycle';

export interface SelectOption {
  id: string;
  name: string;
}

export interface FilterOptions {
  branches?: SelectOption[];
  departments?: SelectOption[];
  designations?: SelectOption[];
  shifts?: SelectOption[];
  leaveTypes?: SelectOption[];
  devices?: SelectOption[];
  employees?: SelectOption[];
}

export interface TabDef {
  key: string;
  label: string;
  count?: number;
}

export interface ExportConfig {
  filename: string;
  title: string;
}
