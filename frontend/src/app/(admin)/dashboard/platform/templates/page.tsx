'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DeleteWarningModal } from '@/components/ui/delete-warning-modal';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';
import api from '@/lib/api';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { SalaryStructureForm, SalaryStructureDetailView } from './SalaryStructureForm';
import {
  ClipboardList, Users, IndianRupee, Clock, ChevronDown, ChevronUp,
  Star, Search, Plus, X, Eye, CheckCircle2, AlertCircle,
  Building2, Briefcase, User, Hash, Layers, Info,
  Pencil, Trash2, Settings2, SlidersHorizontal, LayoutDashboard,
  Copy, MoreHorizontal, CalendarDays, ChevronRight, Heart,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'time' | 'color';

interface SelectOption {
  value: string | number;
  label: string;
}

interface FieldDef {
  key: string;
  label: string;
  description?: string;
  format: (v: any) => string;
  condition?: (c: any) => boolean;
  type?: FieldType;
  options?: SelectOption[];
  section?: string;
}

// ─── Shift color presets ─────────────────────────────────────────────────────

const SHIFT_COLORS = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#84cc16', name: 'Lime' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#6366f1', name: 'Indigo' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#64748b', name: 'Slate' },
  { hex: '#1e293b', name: 'Dark' },
];

// ─── Period constants ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FINANCIAL_YEAR_OPTIONS = [
  { value: 'calendar', label: 'Calendar Year (Jan – Dec)' },
  { value: 'april', label: 'Financial Year (Apr – Mar)' },
  { value: 'july', label: 'Fiscal Year (Jul – Jun)' },
  { value: 'october', label: 'Fiscal Year (Oct – Sep)' },
];

const PENALTY_ACTION_OPTIONS = [
  { value: 'none', label: 'No Penalty', desc: 'Record only — no deduction or formal action' },
  { value: 'mark_late', label: 'Mark Late Only', desc: 'Flag attendance as late with no financial impact' },
  { value: 'warning', label: 'Warning Only', desc: 'Issue a formal warning after threshold is crossed' },
  { value: 'half_day', label: 'Half-Day Deduction', desc: 'Count the day as a half-day for payroll purposes' },
  { value: 'salary_deduction', label: 'Salary Deduction', desc: 'Deduct proportional salary for the violation' },
] as const;
type PenaltyActionValue = typeof PENALTY_ACTION_OPTIONS[number]['value'];

const APPLY_TYPE_DOMAINS = new Set([
  'leave_policy', 'overtime_policy', 'shift_management',
]);

// ─── POLICY DOMAINS ───────────────────────────────────────────────────────────

const POLICY_DOMAINS = [
  {
    key: 'sidebar_access',
    label: 'Navigation Access',
    icon: LayoutDashboard,
    color: 'indigo',
    gradient: 'from-indigo-500 to-blue-600',
    lightBg: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
    description: 'Control visibility of sidebar modules and tabs for users/roles',
    fields: [
      { key: 'show_hr_module', label: 'HR Module', section: 'Module Access', type: 'boolean' as FieldType, description: 'Show or hide the HR module in sidebar', format: (v: boolean) => v ? 'Visible' : 'Hidden' },
      { key: 'show_finance_module', label: 'Finance Module', section: 'Module Access', type: 'boolean' as FieldType, description: 'Show or hide the Finance module in sidebar', format: (v: boolean) => v ? 'Visible' : 'Hidden' },
      { key: 'show_system_module', label: 'System Module', section: 'Module Access', type: 'boolean' as FieldType, description: 'Show or hide the System module in sidebar', format: (v: boolean) => v ? 'Visible' : 'Hidden' },
      { key: 'show_payroll', label: 'HR – Payroll', section: 'Feature Access', type: 'boolean' as FieldType, format: (v: boolean) => v ? 'Visible' : 'Hidden', condition: (c: any) => c.show_hr_module !== false },
      { key: 'show_expenses', label: 'Finance – Expenses', section: 'Feature Access', type: 'boolean' as FieldType, format: (v: boolean) => v ? 'Visible' : 'Hidden', condition: (c: any) => c.show_finance_module !== false },
      { key: 'show_invoices', label: 'Finance – Invoices', section: 'Feature Access', type: 'boolean' as FieldType, format: (v: boolean) => v ? 'Visible' : 'Hidden', condition: (c: any) => c.show_finance_module !== false },
    ] as FieldDef[],
  },
  {
    key: 'attendance_policy',
    label: 'Attendance Policy',
    icon: Clock,
    color: 'blue',
    gradient: 'from-blue-500 to-blue-600',
    lightBg: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    description: 'Grace periods, late penalty rules, WFH, biometric requirements',
    fields: [
      // ── Timing Rules (legacy — shown in detail view only for templates without new penalty config) ──
      { key: 'grace_period_minutes', label: 'Grace Period', section: 'Timing Rules', type: 'number' as FieldType, description: 'Minutes allowed after shift start before marking late', format: (v: number) => `${v} min`, condition: (c: any) => !c.late_entry_enabled },
      { key: 'max_late_per_month', label: 'Max Lates / Month', section: 'Timing Rules', type: 'number' as FieldType, description: 'Max allowed late-marks per month (999 = unlimited)', format: (v: number) => v >= 999 ? 'Unlimited' : `${v} times`, condition: (c: any) => !c.late_entry_enabled },
      { key: 'half_day_late_threshold_minutes', label: 'Half-Day Threshold', section: 'Timing Rules', type: 'number' as FieldType, description: 'Minutes late that convert to a half-day deduction', format: (v: number) => v === 0 ? 'N/A' : `${v} min late`, condition: (c: any) => !c.late_entry_enabled },
      { key: 'late_penalty', label: 'Late Penalty Rule', section: 'Timing Rules', type: 'select' as FieldType, options: [{ value: 'none', label: 'No Penalty' }, { value: 'half_day', label: 'Half-Day After Threshold' }], format: (v: string) => v === 'none' ? 'No Penalty' : 'Half-Day After Threshold', condition: (c: any) => !c.late_entry_enabled },
      // ── Late Entry Penalty (new) ──
      { key: 'late_entry_enabled', label: 'Late Entry Penalty', section: 'Late Entry Penalty', type: 'boolean' as FieldType, description: 'Penalty rules for employees who punch in late', format: (v: boolean) => v ? 'Active' : 'Inactive' },
      { key: 'late_entry_grace_minutes', label: 'Grace Period', section: 'Late Entry Penalty', type: 'number' as FieldType, description: 'Minutes after shift start — no penalty within this window', format: (v: number) => `${v} min`, condition: (c: any) => c.late_entry_enabled },
      { key: 'late_entry_half_day_threshold_minutes', label: 'Half-Day Threshold', section: 'Late Entry Penalty', type: 'number' as FieldType, description: 'Being late beyond this converts attendance to Half-Day', format: (v: number) => `${v} min`, condition: (c: any) => c.late_entry_enabled },
      { key: 'late_entry_max_allowed', label: 'Max Allowed / Month', section: 'Late Entry Penalty', type: 'number' as FieldType, description: 'Late entries per month before penalty action triggers', format: (v: number) => `${v} per month`, condition: (c: any) => c.late_entry_enabled },
      { key: 'late_entry_penalty_action', label: 'Penalty Action', section: 'Late Entry Penalty', type: 'select' as FieldType, options: [{ value: 'none', label: 'No Penalty' }, { value: 'mark_late', label: 'Mark Late Only' }, { value: 'warning', label: 'Warning Only' }, { value: 'half_day', label: 'Half-Day Deduction' }, { value: 'salary_deduction', label: 'Salary Deduction' }], format: (v: string) => ({ none: 'No Penalty', mark_late: 'Mark Late Only', warning: 'Warning Only', half_day: 'Half-Day Deduction', salary_deduction: 'Salary Deduction' }[v] ?? v), condition: (c: any) => c.late_entry_enabled },
      { key: 'late_entry_escalation_enabled', label: 'Repeat Escalation', section: 'Late Entry Penalty', type: 'boolean' as FieldType, description: 'Increase penalty severity for repeated late entries', format: (v: boolean) => v ? 'Enabled' : 'Disabled', condition: (c: any) => c.late_entry_enabled },
      // ── Early Exit Penalty (new) ──
      { key: 'early_exit_enabled', label: 'Early Exit Penalty', section: 'Early Exit Penalty', type: 'boolean' as FieldType, description: 'Penalty rules for employees who punch out before shift end', format: (v: boolean) => v ? 'Active' : 'Inactive' },
      { key: 'early_exit_grace_minutes', label: 'Grace Period', section: 'Early Exit Penalty', type: 'number' as FieldType, description: 'Minutes before shift end — no penalty within this window', format: (v: number) => `${v} min`, condition: (c: any) => c.early_exit_enabled },
      { key: 'early_exit_half_day_threshold_minutes', label: 'Half-Day Threshold', section: 'Early Exit Penalty', type: 'number' as FieldType, description: 'Leaving early beyond this converts attendance to Half-Day', format: (v: number) => `${v} min`, condition: (c: any) => c.early_exit_enabled },
      { key: 'early_exit_max_allowed', label: 'Max Allowed / Month', section: 'Early Exit Penalty', type: 'number' as FieldType, description: 'Early exits per month before penalty action triggers', format: (v: number) => `${v} per month`, condition: (c: any) => c.early_exit_enabled },
      { key: 'early_exit_penalty_action', label: 'Penalty Action', section: 'Early Exit Penalty', type: 'select' as FieldType, options: [{ value: 'none', label: 'No Penalty' }, { value: 'mark_early', label: 'Mark Early Only' }, { value: 'warning', label: 'Warning Only' }, { value: 'half_day', label: 'Half-Day Deduction' }, { value: 'salary_deduction', label: 'Salary Deduction' }], format: (v: string) => ({ none: 'No Penalty', mark_early: 'Mark Early Only', warning: 'Warning Only', half_day: 'Half-Day Deduction', salary_deduction: 'Salary Deduction' }[v] ?? v), condition: (c: any) => c.early_exit_enabled },
      { key: 'early_exit_escalation_enabled', label: 'Repeat Escalation', section: 'Early Exit Penalty', type: 'boolean' as FieldType, description: 'Increase penalty severity for repeated early exits', format: (v: boolean) => v ? 'Enabled' : 'Disabled', condition: (c: any) => c.early_exit_enabled },
      { key: 'absent_lop_threshold_per_month', label: 'Absent → LOP After', section: 'Leave on Pay Rules', type: 'number' as FieldType, description: 'Absences per month before LOP deduction (999 = never)', format: (v: number) => v >= 999 ? 'Never' : `${v} absences/month` },
      { key: 'work_from_home_allowed', label: 'WFH Allowed', section: 'Work from Home', type: 'boolean' as FieldType, description: 'Allow employees to work from home', format: (v: boolean) => v ? 'Yes' : 'No' },
      { key: 'wfh_max_days_per_month', label: 'WFH Max Days / Month', section: 'Work from Home', type: 'number' as FieldType, description: 'Maximum WFH days per month when allowed', format: (v: number) => `${v} days`, condition: (c: any) => c.work_from_home_allowed },
      { key: 'biometric_mandatory', label: 'Biometric Required', section: 'Biometric & Breaks', type: 'boolean' as FieldType, description: 'Require biometric punch for attendance validity', format: (v: boolean) => v ? 'Yes' : 'No' },
      { key: 'biometric_location_restricted', label: 'Restrict to Assigned Location', section: 'Biometric & Breaks', type: 'boolean' as FieldType, description: 'Only accept biometric punches from devices at the property/area this template is assigned to. Punches from other locations will be flagged.', format: (v: boolean) => v ? 'Location-Locked' : 'Any Location', condition: (c: any) => c.biometric_mandatory },
      { key: 'early_exit_penalty', label: 'Early Exit Penalty (Legacy)', section: 'Biometric & Breaks', type: 'boolean' as FieldType, description: 'Apply penalty for leaving before shift end', format: (v: boolean) => v ? 'Yes' : 'No', condition: (c: any) => !c.early_exit_enabled },
      { key: 'mandatory_break_minutes', label: 'Mandatory Break', section: 'Biometric & Breaks', type: 'number' as FieldType, description: 'Required break duration in minutes', format: (v: number) => `${v} min`, condition: (c: any) => c.mandatory_break_minutes != null },
      // ── Monthly-specific ──
      { key: 'monthly_present_days_target', label: 'Monthly Present Days Target', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Target present days for this specific month (0 = no target set)', format: (v: number) => v === 0 ? 'No target' : `${v} days`, condition: (c: any) => c.apply_type === 'monthly' },
      // ── Yearly-specific ──
      { key: 'annual_lop_cap_days', label: 'Annual LOP Cap', section: 'Yearly Configuration', type: 'number' as FieldType, description: 'Maximum Loss of Pay days allowed per year (0 = unlimited)', format: (v: number) => v === 0 ? 'Unlimited' : `${v} days/year`, condition: (c: any) => c.apply_type === 'yearly' },
      { key: 'yearly_attendance_audit', label: 'Annual Attendance Audit', section: 'Yearly Configuration', type: 'boolean' as FieldType, description: 'Enable automated annual attendance audit and summary report', format: (v: boolean) => v ? 'Enabled' : 'Disabled', condition: (c: any) => c.apply_type === 'yearly' },
    ] as FieldDef[],
  },
  {
    key: 'leave_policy',
    label: 'Leave Policy',
    icon: ClipboardList,
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-600',
    lightBg: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    description: 'Leave quotas, carry-forward, encashment rules, notice periods',
    fields: [
      { key: 'casual_leave_days', label: 'Casual Leave (CL)', section: 'Leave Quotas', type: 'number' as FieldType, description: 'Casual leave days allocated per year', format: (v: number) => `${v} days/year` },
      { key: 'sick_leave_days', label: 'Sick Leave (SL)', section: 'Leave Quotas', type: 'number' as FieldType, description: 'Sick leave days allocated per year', format: (v: number) => `${v} days/year` },
      { key: 'privilege_leave_days', label: 'Privilege Leave (PL)', section: 'Leave Quotas', type: 'number' as FieldType, description: 'Privilege leave days per year (0 = locked until confirmation)', format: (v: number) => v === 0 ? 'Locked until confirmation' : `${v} days/year` },
      // Gender-Aware Leave — rendered via LeavePolicyGenderCard in the form; shown as plain rows in detail view
      { key: 'maternity_leave_days', label: 'Maternity Leave (Female Only)', section: 'Gender-Aware Leave', type: 'number' as FieldType, description: 'Maternity leave days for female employees (0 = not applicable)', format: (v: number) => v === 0 ? 'Not applicable' : `${v} days` },
      { key: 'maternity_leave_paid', label: 'Maternity Leave — Pay Type', section: 'Gender-Aware Leave', type: 'boolean' as FieldType, description: 'Whether maternity leave is paid', format: (v: boolean) => v ? 'Paid' : 'Unpaid', condition: (c: any) => (c.maternity_leave_days ?? 0) > 0 },
      { key: 'paternity_leave_days', label: 'Paternity Leave (Male Only)', section: 'Gender-Aware Leave', type: 'number' as FieldType, description: 'Paternity leave days for male employees (0 = not applicable)', format: (v: number) => v === 0 ? 'Not applicable' : `${v} days` },
      { key: 'paternity_leave_paid', label: 'Paternity Leave — Pay Type', section: 'Gender-Aware Leave', type: 'boolean' as FieldType, description: 'Whether paternity leave is paid', format: (v: boolean) => v ? 'Paid' : 'Unpaid', condition: (c: any) => (c.paternity_leave_days ?? 0) > 0 },
      { key: 'carry_forward_enabled', label: 'Carry Forward', section: 'Carry Forward', type: 'boolean' as FieldType, description: 'Allow unused leave balance to carry to next year', format: (v: boolean) => v ? 'Enabled' : 'Disabled' },
      { key: 'carry_forward_max_days', label: 'Carry Forward Max', section: 'Carry Forward', type: 'number' as FieldType, description: 'Maximum days that can be carried forward (0 = none)', format: (v: number) => v === 0 ? 'None' : `${v} days`, condition: (c: any) => c.carry_forward_enabled },
      { key: 'carry_forward_expiry_enabled', label: 'Carry Forward Expiry', section: 'Carry Forward', type: 'boolean' as FieldType, description: 'Expire carried-forward leave after a period', format: (v: boolean) => v ? 'Enabled' : 'Disabled', condition: (c: any) => c.carry_forward_enabled },
      { key: 'carry_forward_expiry_days', label: 'Expiry After Days', section: 'Carry Forward', type: 'number' as FieldType, description: 'Days after carry-forward date before balance expires (e.g. 90)', format: (v: number) => `${v} days`, condition: (c: any) => c.carry_forward_enabled && c.carry_forward_expiry_enabled },
      {
        key: 'carry_forward_expiry_month', label: 'Expiry Month', section: 'Carry Forward', type: 'select' as FieldType, description: 'Calendar month in which carried-forward leave expires', options: [
          { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
          { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
          { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
          { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
        ], format: (v: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][v - 1] ?? `Month ${v}`, condition: (c: any) => c.carry_forward_enabled && c.carry_forward_expiry_enabled
      },
      { key: 'carry_forward_expiry_date', label: 'Expiry Day of Month', section: 'Carry Forward', type: 'number' as FieldType, description: 'Day of month for expiry (1–31), e.g. 31 for last day', format: (v: number) => `Day ${v}`, condition: (c: any) => c.carry_forward_enabled && c.carry_forward_expiry_enabled },
      { key: 'encashment_enabled', label: 'Leave Encashment', section: 'Encashment', type: 'boolean' as FieldType, description: 'Allow employees to encash unused leave', format: (v: boolean) => v ? 'Allowed' : 'Not Allowed' },
      { key: 'encashment_max_days_per_year', label: 'Encashment Max / Year', section: 'Encashment', type: 'number' as FieldType, description: 'Maximum days encashable per year', format: (v: number) => `${v} days/year`, condition: (c: any) => c.encashment_enabled },
      { key: 'encashment_leave_types', label: 'Encashable Leave Types', section: 'Encashment', type: 'select' as FieldType, options: [{ value: 'pl_only', label: 'Privilege Leave Only' }, { value: 'cl_only', label: 'Casual Leave Only' }, { value: 'pl_cl', label: 'PL + CL (Both)' }], format: (v: string) => ({ pl_only: 'Privilege Leave Only', cl_only: 'Casual Leave Only', pl_cl: 'PL + CL' }[v] ?? v), condition: (c: any) => c.encashment_enabled },
      { key: 'encashment_min_retain_days', label: 'Min. Balance to Retain', section: 'Encashment', type: 'number' as FieldType, description: 'Days that must remain in balance after encashment (0 = no minimum)', format: (v: number) => v === 0 ? 'No minimum' : `Retain ${v} days`, condition: (c: any) => c.encashment_enabled },
      { key: 'encashment_basis', label: 'Salary Basis', section: 'Encashment', type: 'select' as FieldType, options: [{ value: 'basic', label: 'Basic Salary (1/26 per day)' }, { value: 'gross', label: 'Gross Salary (1/26 per day)' }], format: (v: string) => v === 'basic' ? 'Basic Salary' : 'Gross Salary', condition: (c: any) => c.encashment_enabled },
      { key: 'encashment_timing', label: 'Encashment Window', section: 'Encashment', type: 'select' as FieldType, options: [{ value: 'anytime', label: 'Anytime' }, { value: 'year_end', label: 'Year-End Only (December)' }, { value: 'on_exit', label: 'On Exit Only' }], format: (v: string) => ({ anytime: 'Anytime', year_end: 'Year-End Only', on_exit: 'On Exit Only' }[v] ?? v), condition: (c: any) => c.encashment_enabled },
      { key: 'encashment_requires_approval', label: 'Approval Required', section: 'Encashment', type: 'boolean' as FieldType, description: 'Manager/HR must approve encashment requests before processing', format: (v: boolean) => v ? 'Approval Required' : 'Auto-Approved', condition: (c: any) => c.encashment_enabled },
      { key: 'privilege_leave_notice_days', label: 'PL Notice Required', section: 'Notice & Certificates', type: 'number' as FieldType, description: 'Advance notice days required for privilege leave (0 = none)', format: (v: number) => v === 0 ? 'None' : `${v} days advance` },
      { key: 'sick_leave_requires_certificate_after_days', label: 'Medical Certificate After', section: 'Notice & Certificates', type: 'number' as FieldType, description: 'Consecutive sick days before a medical certificate is required', format: (v: number) => `${v} consecutive sick days` },
      // ── Monthly-specific ──
      { key: 'monthly_cl_accrual', label: 'Monthly CL Accrual', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Casual leave days accrued per month (for accrual-based leave policies)', format: (v: number) => `${v} days/month`, condition: (c: any) => c.apply_type === 'monthly' },
      { key: 'monthly_pl_accrual', label: 'Monthly PL Accrual', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Privilege leave days earned per month (pro-rated accrual)', format: (v: number) => `${v} days/month`, condition: (c: any) => c.apply_type === 'monthly' },
      // ── Yearly-specific ──
      {
        key: 'annual_leave_reset_month', label: 'Leave Balance Reset Month', section: 'Yearly Configuration', type: 'select' as FieldType, options: [
          { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
          { value: 4, label: 'April' }, { value: 7, label: 'July' }, { value: 10, label: 'October' },
        ], description: 'Month when annual leave balance resets to the configured allocation', format: (v: number) => MONTH_NAMES[v - 1] ?? `Month ${v}`, condition: (c: any) => c.apply_type === 'yearly'
      },
      { key: 'yearly_leave_lapse_enabled', label: 'Year-End Leave Lapse', section: 'Yearly Configuration', type: 'boolean' as FieldType, description: 'Unused leave balance lapses at year end (not carried forward)', format: (v: boolean) => v ? 'Enabled (balance lapses)' : 'Disabled (balance carries forward)', condition: (c: any) => c.apply_type === 'yearly' },
    ] as FieldDef[],
  },
  {
    key: 'salary_structure',
    label: 'Salary Structure',
    icon: IndianRupee,
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    lightBg: 'bg-violet-50',
    textColor: 'text-violet-700',
    borderColor: 'border-violet-200',
    description: 'Salary components, PF/ESI eligibility, LOP method, bonus & gratuity',
    fields: [
      { key: 'basic_percent_of_ctc', label: 'Basic (% of CTC)', section: 'Salary Components', type: 'number' as FieldType, description: 'Basic salary as a percentage of CTC', format: (v: number) => `${v}%` },
      { key: 'hra_percent_of_basic', label: 'HRA (% of Basic)', section: 'Salary Components', type: 'number' as FieldType, description: 'House Rent Allowance as % of Basic (0 = none)', format: (v: number) => v === 0 ? 'None' : `${v}%` },
      { key: 'da_percent_of_basic', label: 'DA (% of Basic)', section: 'Salary Components', type: 'number' as FieldType, description: 'Dearness Allowance as % of Basic (0 = none)', format: (v: number) => v === 0 ? 'None' : `${v}%` },
      { key: 'conveyance_fixed', label: 'Conveyance Allowance', section: 'Salary Components', type: 'number' as FieldType, description: 'Fixed conveyance amount per month (₹)', format: (v: number) => v === 0 ? 'None' : `₹${v.toLocaleString('en-IN')}/month` },
      { key: 'pf_applicable', label: 'PF Applicable', section: 'Statutory Deductions', type: 'boolean' as FieldType, description: 'Apply Provident Fund deduction (12% of Basic)', format: (v: boolean) => v ? 'Yes (12%)' : 'No' },
      { key: 'esi_applicable', label: 'ESI Applicable', section: 'Statutory Deductions', type: 'boolean' as FieldType, description: 'Apply Employee State Insurance deduction', format: (v: boolean) => v ? 'Yes' : 'No' },
      { key: 'esi_wage_ceiling', label: 'ESI Wage Ceiling', section: 'Statutory Deductions', type: 'number' as FieldType, description: 'Monthly wage ceiling for ESI applicability (₹)', format: (v: number) => `₹${v.toLocaleString('en-IN')}/month`, condition: (c: any) => c.esi_applicable },
      { key: 'professional_tax', label: 'Professional Tax', section: 'Statutory Deductions', type: 'number' as FieldType, description: 'Fixed professional tax per month (₹, 0 = nil)', format: (v: number) => v === 0 ? 'Nil' : `₹${v}/month` },
      { key: 'tds_applicable', label: 'TDS Applicable', section: 'Statutory Deductions', type: 'boolean' as FieldType, description: 'Apply Tax Deducted at Source', format: (v: boolean) => v ? 'Yes' : 'No' },
      { key: 'bonus_applicable', label: 'Annual Bonus', section: 'Bonus & Gratuity', type: 'boolean' as FieldType, description: 'Apply annual statutory bonus (8.33% of Basic)', format: (v: boolean) => v ? 'Yes (8.33% of Basic)' : 'No' },
      { key: 'gratuity_applicable', label: 'Gratuity', section: 'Bonus & Gratuity', type: 'boolean' as FieldType, description: 'Applicable after 5 years of service', format: (v: boolean) => v ? 'Applicable' : 'Not Applicable' },
      { key: 'lop_deduction_method', label: 'LOP Deduction Based On', section: 'LOP Rules', type: 'select' as FieldType, options: [{ value: 'working_days', label: 'Working Days' }, { value: 'calendar_days', label: 'Calendar Days' }], format: (v: string) => v === 'working_days' ? 'Working Days' : 'Calendar Days' },
      { key: 'stipend_mode', label: 'Stipend Mode', section: 'LOP Rules', type: 'boolean' as FieldType, description: 'Simple stipend disbursement with no salary components', format: (v: boolean) => v ? 'Yes (no components)' : 'No', condition: (c: any) => c.stipend_mode != null },
      // ── Monthly-specific ──
      { key: 'monthly_gross_target', label: 'Monthly Gross Target', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Target monthly gross salary (₹, 0 = derived from components)', format: (v: number) => v === 0 ? 'Derived from components' : `₹${v.toLocaleString('en-IN')}/month`, condition: (c: any) => c.apply_type === 'monthly' },
      { key: 'monthly_variable_percent', label: 'Variable Component (%)', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Variable pay as a percentage of monthly gross (0 = fully fixed)', format: (v: number) => v === 0 ? 'None (fully fixed)' : `${v}% variable`, condition: (c: any) => c.apply_type === 'monthly' },
      // ── Yearly-specific ──
      { key: 'annual_ctc_amount', label: 'Annual CTC (₹)', section: 'Yearly Configuration', type: 'number' as FieldType, description: 'Cost to Company — total annual package amount (₹)', format: (v: number) => `₹${v.toLocaleString('en-IN')}/year`, condition: (c: any) => c.apply_type === 'yearly' },
      {
        key: 'annual_increment_month', label: 'Increment Effective Month', section: 'Yearly Configuration', type: 'select' as FieldType, options: [
          { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
          { value: 4, label: 'April' }, { value: 7, label: 'July' }, { value: 10, label: 'October' },
        ], description: 'Month when annual salary increments take effect for this structure', format: (v: number) => MONTH_NAMES[v - 1] ?? `Month ${v}`, condition: (c: any) => c.apply_type === 'yearly'
      },
    ] as FieldDef[],
  },
  {
    key: 'overtime_policy',
    label: 'Overtime Policy',
    icon: SlidersHorizontal,
    color: 'amber',
    gradient: 'from-amber-500 to-orange-500',
    lightBg: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    description: 'OT eligibility, rate multiplier, daily/weekly caps, comp-off rules',
    fields: [
      { key: 'ot_applicable', label: 'OT Applicable', section: 'Overtime Settings', type: 'boolean' as FieldType, description: 'Enable overtime pay for this policy', format: (v: boolean) => v ? 'Yes' : 'No' },
      { key: 'ot_threshold_hours_per_day', label: 'OT Starts After', section: 'Overtime Settings', type: 'number' as FieldType, description: 'Hours worked per day before overtime kicks in', format: (v: number) => `${v} hrs/day`, condition: (c: any) => c.ot_applicable },
      { key: 'ot_rate_multiplier', label: 'OT Rate Multiplier', section: 'Overtime Settings', type: 'number' as FieldType, description: 'Multiplier on hourly rate for OT hours (e.g. 1.5)', format: (v: number) => `${v}x hourly rate`, condition: (c: any) => c.ot_applicable },
      { key: 'ot_daily_cap_hours', label: 'Daily OT Cap', section: 'OT Caps', type: 'number' as FieldType, description: 'Maximum OT hours claimable per day', format: (v: number) => `${v} hrs`, condition: (c: any) => c.ot_applicable },
      { key: 'ot_weekly_cap_hours', label: 'Weekly OT Cap', section: 'OT Caps', type: 'number' as FieldType, description: 'Maximum OT hours claimable per week', format: (v: number) => `${v} hrs`, condition: (c: any) => c.ot_applicable },
      { key: 'comp_off_enabled', label: 'Comp-Off', section: 'Comp-Off', type: 'boolean' as FieldType, description: 'Allow compensatory off instead of OT pay', format: (v: boolean) => v ? 'Enabled' : 'Disabled' },
      { key: 'comp_off_after_ot_days', label: 'Comp-Off After', section: 'Comp-Off', type: 'number' as FieldType, description: 'OT days required before comp-off is granted', format: (v: number) => `${v} OT days`, condition: (c: any) => c.comp_off_enabled },
      { key: 'ot_requires_approval', label: 'OT Requires Approval', section: 'Approval', type: 'boolean' as FieldType, description: 'Manager must approve OT before it is paid', format: (v: boolean) => v ? 'Yes' : 'No' },
      { key: 'event_shift_allowance', label: 'Event Shift Allowance', section: 'Allowances', type: 'number' as FieldType, description: 'Fixed allowance (₹) per event shift', format: (v: number) => `₹${v}/shift`, condition: (c: any) => c.event_shift_allowance != null },
      // ── Monthly-specific ──
      { key: 'monthly_ot_hours_budget', label: 'Monthly OT Hours Budget', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Maximum total OT hours budget across all employees this month (0 = unlimited)', format: (v: number) => v === 0 ? 'Unlimited' : `${v} hrs budget/month`, condition: (c: any) => c.apply_type === 'monthly' },
      { key: 'monthly_ot_cost_cap', label: 'Monthly OT Cost Cap (₹)', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Maximum OT payout budget for the month (₹, 0 = no cap)', format: (v: number) => v === 0 ? 'No cap' : `₹${v.toLocaleString('en-IN')}/month`, condition: (c: any) => c.apply_type === 'monthly' },
      // ── Yearly-specific ──
      { key: 'annual_ot_hours_cap', label: 'Annual OT Hours Cap / Employee', section: 'Yearly Configuration', type: 'number' as FieldType, description: 'Maximum OT hours per employee allowed in the year (0 = unlimited)', format: (v: number) => v === 0 ? 'Unlimited' : `${v} hrs/year per employee`, condition: (c: any) => c.apply_type === 'yearly' },
      {
        key: 'yearly_ot_review_month', label: 'OT Policy Review Month', section: 'Yearly Configuration', type: 'select' as FieldType, options: [
          { value: 1, label: 'January' }, { value: 3, label: 'March' }, { value: 4, label: 'April' },
          { value: 7, label: 'July' }, { value: 10, label: 'October' }, { value: 12, label: 'December' },
        ], description: 'Month designated for annual OT policy review and rate adjustment', format: (v: number) => MONTH_NAMES[v - 1] ?? `Month ${v}`, condition: (c: any) => c.apply_type === 'yearly'
      },
    ] as FieldDef[],
  },
  {
    key: 'shift_management',
    label: 'Shift Management',
    icon: Clock,
    color: 'rose',
    gradient: 'from-rose-500 to-pink-600',
    lightBg: 'bg-rose-50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-200',
    description: 'Enterprise shift configuration: timings, rotation, breaks, attendance rules, OT, and more',
    fields: [
      // ── Basic Info ──
      { key: 'shift_name', label: 'Shift Name', section: 'Basic Info', type: 'text' as FieldType, description: 'Display name for this shift template', format: (v: string) => v },
      { key: 'shift_code', label: 'Shift Code', section: 'Basic Info', type: 'text' as FieldType, description: 'Short identifier code (e.g. GEN, MRN, NGT)', format: (v: string) => v },
      {
        key: 'shift_category', label: 'Shift Category', section: 'Basic Info', type: 'select' as FieldType, options: [
          { value: 'general', label: 'General' }, { value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' },
          { value: 'night', label: 'Night' }, { value: 'split', label: 'Split' }, { value: 'flexible', label: 'Flexible' },
        ], format: (v: string) => v.charAt(0).toUpperCase() + v.slice(1)
      },
      {
        key: 'default_shift', label: 'Default Shift Type', section: 'Basic Info', type: 'select' as FieldType, options: [
          { value: 'general', label: 'General (9–6)' }, { value: 'morning', label: 'Morning (7–3)' },
          { value: 'afternoon', label: 'Afternoon (3–11)' }, { value: 'night', label: 'Night (11–7)' },
        ], format: (v: string) => v === 'general' ? 'General (9-6)' : v === 'morning' ? 'Morning (7-3)' : v === 'afternoon' ? 'Afternoon (3-11)' : v === 'night' ? 'Night (11-7)' : v
      },
      { key: 'shift_color', label: 'Shift Color / Tag', section: 'Basic Info', type: 'color' as FieldType, description: 'Color used to identify this shift in scheduling views', format: (v: string) => SHIFT_COLORS.find(c => c.hex === v)?.name ?? v },
      // ── Shift Timings ──
      { key: 'shift_start_time', label: 'Shift Start', section: 'Shift Timings', type: 'time' as FieldType, description: 'Official shift start time', format: (v: string) => v },
      { key: 'shift_end_time', label: 'Shift End', section: 'Shift Timings', type: 'time' as FieldType, description: 'Official shift end time', format: (v: string) => v },
      { key: 'is_overnight_shift', label: 'Overnight Shift', section: 'Shift Timings', type: 'boolean' as FieldType, description: 'Shift spans across midnight into the next calendar day', format: (v: boolean) => v ? 'Yes' : 'No' },
      { key: 'flexible_timing', label: 'Flexible Timing', section: 'Shift Timings', type: 'boolean' as FieldType, description: 'Allow flexible start/end within a defined window', format: (v: boolean) => v ? 'Allowed' : 'Strict' },
      { key: 'max_work_hours_per_day', label: 'Max Work Hours / Day', section: 'Shift Timings', type: 'number' as FieldType, description: 'Maximum allowed working hours in a single day', format: (v: number) => `${v} hrs/day` },
      { key: 'min_work_hours_for_present', label: 'Min Hours for Present', section: 'Shift Timings', type: 'number' as FieldType, description: 'Minimum hours worked to be marked as present (not half-day)', format: (v: number) => `${v} hrs` },
      // ── Break Configuration ──
      { key: 'break_enabled', label: 'Enable Break Time', section: 'Break Configuration', type: 'boolean' as FieldType, description: 'Schedule a rest break within this shift', format: (v: boolean) => v ? 'Enabled' : 'Disabled' },
      { key: 'break_start_time', label: 'Break Start Time', section: 'Break Configuration', type: 'time' as FieldType, description: 'Scheduled break start time', format: (v: string) => v, condition: (c: any) => c.break_enabled },
      { key: 'break_end_time', label: 'Break End Time', section: 'Break Configuration', type: 'time' as FieldType, description: 'Scheduled break end time', format: (v: string) => v, condition: (c: any) => c.break_enabled },
      { key: 'break_duration_minutes', label: 'Break Duration', section: 'Break Configuration', type: 'number' as FieldType, description: 'Total break duration in minutes (auto-calculated from start/end times)', format: (v: number) => `${v} min`, condition: (c: any) => c.break_enabled },
      { key: 'paid_break', label: 'Paid Break', section: 'Break Configuration', type: 'boolean' as FieldType, description: 'Count break time as paid work hours', format: (v: boolean) => v ? 'Paid' : 'Unpaid', condition: (c: any) => c.break_enabled },
      // ── Attendance Rules ──
      { key: 'grace_period_minutes', label: 'Grace Period', section: 'Attendance Rules', type: 'number' as FieldType, description: 'Minutes after shift start before a late-mark is applied', format: (v: number) => `${v} min` },
      { key: 'late_mark_after_minutes', label: 'Late Mark After', section: 'Attendance Rules', type: 'number' as FieldType, description: 'Minutes beyond grace period before a late mark is recorded', format: (v: number) => `${v} min` },
      { key: 'early_leave_before_minutes', label: 'Early Leave Before', section: 'Attendance Rules', type: 'number' as FieldType, description: 'Minutes before shift end to flag as early departure', format: (v: number) => `${v} min` },
      {
        key: 'attendance_calculation_mode', label: 'Attendance Mode', section: 'Attendance Rules', type: 'select' as FieldType, options: [
          { value: 'actual', label: 'Actual Hours Worked' }, { value: 'scheduled', label: 'Scheduled Shift Hours' }, { value: 'flexible', label: 'Flexible (Minimum Hours)' },
        ], format: (v: string) => v === 'actual' ? 'Actual Hours' : v === 'scheduled' ? 'Scheduled Hours' : 'Flexible'
      },
      { key: 'auto_clock_out_enabled', label: 'Auto Clock-Out', section: 'Attendance Rules', type: 'boolean' as FieldType, description: 'Automatically clock out employee after maximum hours', format: (v: boolean) => v ? 'Enabled' : 'Disabled' },
      { key: 'auto_clock_out_after_hours', label: 'Auto Clock-Out After', section: 'Attendance Rules', type: 'number' as FieldType, description: 'Hours from shift start before auto clock-out triggers', format: (v: number) => `After ${v} hrs`, condition: (c: any) => c.auto_clock_out_enabled },
      { key: 'biometric_location_restricted', label: 'Location-Locked Attendance', section: 'Attendance Rules', type: 'boolean' as FieldType, description: "Restrict biometric check-ins to devices registered at the shift's assigned property or area. Punches from other locations will be flagged.", format: (v: boolean) => v ? 'Location-Locked' : 'Any Location' },
      // ── Overtime ──
      { key: 'ot_eligible', label: 'OT Eligible', section: 'Overtime', type: 'boolean' as FieldType, description: 'Employees on this shift type qualify for overtime', format: (v: boolean) => v ? 'Eligible' : 'Not Eligible' },
      { key: 'ot_threshold_minutes', label: 'OT Threshold', section: 'Overtime', type: 'number' as FieldType, description: 'Minutes beyond shift end to qualify as overtime', format: (v: number) => `After ${v} min`, condition: (c: any) => c.ot_eligible },
      { key: 'overtime_on_double_shift', label: 'OT on Double Shift', section: 'Overtime', type: 'boolean' as FieldType, description: 'Mark as OT when employee works consecutive back-to-back shifts', format: (v: boolean) => v ? 'Yes' : 'No' },
      // ── Rest & Recovery ──
      { key: 'min_rest_hours_between_shifts', label: 'Min Rest Between Shifts', section: 'Rest & Recovery', type: 'number' as FieldType, description: 'Minimum rest hours required between consecutive shifts', format: (v: number) => `${v} hrs` },
      { key: 'handover_buffer_minutes', label: 'Handover Buffer', section: 'Rest & Recovery', type: 'number' as FieldType, description: 'Buffer minutes allowed at shift changeover for handover', format: (v: number) => `${v} min` },
      // ── Split Shift ──
      { key: 'split_shift_allowed', label: 'Split Shift Allowed', section: 'Split Shift', type: 'boolean' as FieldType, description: 'Allow this shift to be split into two working sessions', format: (v: boolean) => v ? 'Yes' : 'No' },
      // ── Rotation & Weekly Off ──
      { key: 'rotation_enabled', label: 'Shift Rotation', section: 'Rotation & Weekly Off', type: 'boolean' as FieldType, description: 'Enable automatic rotation between shifts', format: (v: boolean) => v ? 'Enabled' : 'Disabled' },
      { key: 'rotation_frequency_days', label: 'Rotation Frequency', section: 'Rotation & Weekly Off', type: 'number' as FieldType, description: 'Days before rotating to the next shift', format: (v: number) => `Every ${v} days`, condition: (c: any) => c.rotation_enabled },
      {
        key: 'weekly_off_pattern', label: 'Weekly Off Pattern', section: 'Rotation & Weekly Off', type: 'select' as FieldType, options: [
          { value: 'fixed', label: 'Fixed (Sunday)' }, { value: 'rotating', label: 'Rotating' }, { value: 'staggered', label: 'Staggered' },
        ], format: (v: string) => v === 'fixed' ? 'Fixed (Sunday)' : v === 'rotating' ? 'Rotating' : v === 'staggered' ? 'Staggered' : v
      },
      { key: 'weekly_offs_per_month', label: 'Weekly Offs / Month', section: 'Rotation & Weekly Off', type: 'number' as FieldType, format: (v: number) => `${v} days` },
      { key: 'alternate_week_off_enabled', label: 'Alternate Week Off', section: 'Rotation & Weekly Off', type: 'boolean' as FieldType, description: 'Enable alternating weekly off schedule (e.g. 1st & 3rd Saturday)', format: (v: boolean) => v ? 'Enabled' : 'Disabled' },
      { key: 'weekly_off_days', label: 'Weekly Off Days', section: 'Rotation & Weekly Off', type: 'text' as FieldType, description: 'Comma-separated day names (e.g. Sunday,Saturday)', format: (v: string) => v },
      // ── Allowances ──
      { key: 'night_shift_allowance', label: 'Night Shift Allowance', section: 'Allowances', type: 'number' as FieldType, description: 'Per-night allowance amount (₹, 0 = none)', format: (v: number) => v === 0 ? 'None' : `₹${v.toLocaleString('en-IN')}/night` },
      // ── Automation ──
      { key: 'auto_assign_shifts', label: 'Auto-Assign Shifts', section: 'Automation', type: 'boolean' as FieldType, description: 'Automatically assign this shift to new employees', format: (v: boolean) => v ? 'Yes' : 'No' },
      // ── Monthly-specific ──
      { key: 'monthly_roster_finalize_by_day', label: 'Roster Finalized By (Day)', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Day of the preceding month by which the roster must be finalized (e.g. 25)', format: (v: number) => `By day ${v} of preceding month`, condition: (c: any) => c.apply_type === 'monthly' },
      { key: 'monthly_shift_swap_limit', label: 'Max Shift Swaps / Month', section: 'Monthly Configuration', type: 'number' as FieldType, description: 'Maximum allowed shift swaps per employee per month (0 = unlimited)', format: (v: number) => v === 0 ? 'Unlimited' : `${v} swaps/month`, condition: (c: any) => c.apply_type === 'monthly' },
      // ── Yearly-specific ──
      {
        key: 'annual_shift_plan_month', label: 'Annual Shift Planning Month', section: 'Yearly Configuration', type: 'select' as FieldType, options: [
          { value: 1, label: 'January' }, { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
        ], description: 'Month when the upcoming year shift schedule and rotation plan is prepared', format: (v: number) => MONTH_NAMES[v - 1] ?? `Month ${v}`, condition: (c: any) => c.apply_type === 'yearly'
      },
      { key: 'annual_night_shift_cap_days', label: 'Annual Night Shift Cap / Employee', section: 'Yearly Configuration', type: 'number' as FieldType, description: 'Maximum night shift days per employee per year (0 = no cap)', format: (v: number) => v === 0 ? 'No cap' : `${v} days/year`, condition: (c: any) => c.apply_type === 'yearly' },
    ] as FieldDef[],
  },
];

// ─── Scope meta ───────────────────────────────────────────────────────────────

const SCOPE_ICONS: Record<string, any> = {
  employee: User, designation: Briefcase, department: Building2, property: Hash,
};
const SCOPE_LABELS: Record<string, string> = {
  employee: 'Employee', designation: 'Designation', department: 'Department', property: 'Property',
};

// ─── Helper Components ────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled = false }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${checked ? 'bg-indigo-600' : 'bg-slate-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
    </button>
  );
}

function CardToggleBtn({ checked, onChange, color = 'indigo' }: {
  checked: boolean; onChange: (v: boolean) => void;
  color?: 'indigo' | 'amber' | 'rose' | 'emerald';
}) {
  const bg = checked
    ? color === 'amber' ? 'bg-amber-500'
    : color === 'rose' ? 'bg-rose-500'
    : color === 'emerald' ? 'bg-emerald-500'
    : 'bg-indigo-600'
    : 'bg-slate-200';
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 ${bg}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function ConfigFormField({ field, value, onChange }: {
  field: FieldDef; value: any; onChange: (key: string, val: any) => void;
}) {
  const set = (val: any) => onChange(field.key, val);

  const labelCol = (
    <div className="min-w-0 flex-1 pr-4">
      <p className="text-sm text-slate-700 font-medium leading-snug">{field.label}</p>
      {field.description && (
        <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{field.description}</p>
      )}
    </div>
  );

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        {labelCol}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium min-w-[52px] text-right ${value ? 'text-indigo-600' : 'text-slate-400'}`}>
            {value ? 'Enabled' : 'Disabled'}
          </span>
          <ToggleSwitch checked={Boolean(value)} onChange={set} />
        </div>
      </div>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        {labelCol}
        <select
          value={value ?? ''}
          onChange={e => {
            const v = e.target.value;
            const n = Number(v);
            set(!isNaN(n) && v !== '' ? n : v);
          }}
          className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-700 shrink-0"
        >
          <option value="">Select…</option>
          {field.options.map(o => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'time') {
    return (
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        {labelCol}
        <input
          type="time"
          value={value ?? ''}
          onChange={e => set(e.target.value)}
          className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 shrink-0"
        />
      </div>
    );
  }

  if (field.type === 'color') {
    const selectedPreset = SHIFT_COLORS.find(c => c.hex === value);
    const isCustom = value && !selectedPreset;
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          {labelCol}
          {value ? (
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="w-5 h-5 rounded-full border-2 border-white shadow-md ring-1 ring-slate-200"
                style={{ backgroundColor: value }}
              />
              <span className="text-xs font-semibold text-slate-700">{selectedPreset?.name ?? value}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 shrink-0">None selected</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {SHIFT_COLORS.map(c => {
            const active = value === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                title={c.name}
                onClick={() => set(c.hex)}
                className={`w-7 h-7 rounded-full transition-all duration-100 hover:scale-110 focus:outline-none ${active ? 'ring-2 ring-offset-2 ring-slate-500 scale-110' : ''
                  }`}
                style={{ backgroundColor: c.hex }}
              >
                {active && (
                  <span className="flex items-center justify-center w-full h-full">
                    <svg className="w-3 h-3 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
          {/* Custom color via native picker */}
          <label
            title="Custom color"
            className={`w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden ${isCustom ? 'border-slate-500' : 'border-slate-300 hover:border-slate-400'
              }`}
            style={isCustom ? { backgroundColor: value } : {}}
          >
            <input
              type="color"
              value={value?.startsWith('#') ? value : '#6366f1'}
              onChange={e => set(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            {!isCustom && <Plus className="w-3 h-3 text-slate-400" />}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 gap-2">
      {labelCol}
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        onChange={e => {
          const r = e.target.value;
          set(field.type === 'number' ? (r === '' ? '' : Number(r)) : r);
        }}
        placeholder={field.type === 'number' ? '0' : '…'}
        className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg w-32 text-right focus:outline-none focus:ring-2 focus:ring-indigo-400 shrink-0"
      />
    </div>
  );
}

function Badge({ text, variant = 'default' }: { text: string; variant?: 'default' | 'green' | 'amber' | 'red' | 'purple' }) {
  const s = {
    default: 'bg-slate-100 text-slate-600 border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${s[variant]}`}>
      {text}
    </span>
  );
}

function ScopeChip({ scopeType, scopeName, priority, effectiveFrom, effectiveTo }: {
  scopeType: string; scopeName: string; priority: number;
  effectiveFrom?: string; effectiveTo?: string;
}) {
  const Icon = SCOPE_ICONS[scopeType] || Layers;
  const emp = scopeType === 'employee';
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${emp ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200'}`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${emp ? 'text-violet-600' : 'text-slate-500'}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium truncate ${emp ? 'text-violet-700' : 'text-slate-700'}`}>{scopeName}</p>
        <p className="text-[10px] text-slate-400">{SCOPE_LABELS[scopeType]} · P{priority}</p>
        {(effectiveFrom || effectiveTo) && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            {effectiveFrom ? new Date(effectiveFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}
            {' → '}
            {effectiveTo ? new Date(effectiveTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Ongoing'}
          </p>
        )}
      </div>
      {emp && <Star className="w-3 h-3 text-violet-500 shrink-0 mt-0.5" />}
    </div>
  );
}

// ─── Sectioned config form renderer ──────────────────────────────────────────

function SectionedConfigForm({ fields, config, onChange }: {
  fields: FieldDef[];
  config: Record<string, any>;
  onChange: (key: string, val: any) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (s: string) => setCollapsed(prev => {
    const n = new Set(prev);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });

  const sectionMap = new Map<string, FieldDef[]>();
  for (const f of fields) {
    const s = f.section ?? 'General';
    if (!sectionMap.has(s)) sectionMap.set(s, []);
    sectionMap.get(s)!.push(f);
  }

  return (
    <div className="space-y-3">
      {Array.from(sectionMap.entries()).map(([sec, secFields]) => {
        const visible = secFields.filter(f => !f.condition || f.condition(config));
        if (visible.length === 0) return null;
        const isCollapsed = collapsed.has(sec);
        return (
          <div key={sec} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(sec)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 hover:bg-slate-100 transition-colors"
            >
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{sec}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">{visible.length} field{visible.length !== 1 ? 's' : ''}</span>
                {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-400" />}
              </div>
            </button>
            {!isCollapsed && (
              <div className="divide-y divide-slate-100">
                {visible.map(f => (
                  <ConfigFormField key={f.key} field={f} value={config[f.key]} onChange={onChange} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Penalty Config Card ──────────────────────────────────────────────────────

function PenaltyConfigCard({
  type,
  prefix,
  config,
  onChange,
}: {
  type: 'late' | 'early_exit';
  prefix: string;
  config: Record<string, any>;
  onChange: (key: string, val: any) => void;
}) {
  const isLate = type === 'late';
  const enabled = Boolean(config[`${prefix}_enabled`]);

  // Gracefully read from new keys; fall back to legacy keys for old templates
  const graceMin: number | '' = config[`${prefix}_grace_minutes`] ??
    (isLate ? config['grace_period_minutes'] ?? '' : '');
  const halfDayMin: number | '' = config[`${prefix}_half_day_threshold_minutes`] ??
    (isLate ? config['half_day_late_threshold_minutes'] ?? '' : '');
  const maxAllowed: number | '' = config[`${prefix}_max_allowed`] ??
    (isLate ? config['max_late_per_month'] ?? '' : '');
  const penaltyAction: PenaltyActionValue = (config[`${prefix}_penalty_action`] as PenaltyActionValue) ?? 'none';
  const escalation = Boolean(config[`${prefix}_escalation_enabled`]);

  const thresholdError =
    halfDayMin !== '' && graceMin !== '' && Number(halfDayMin) <= Number(graceMin);

  const cardBorder = enabled
    ? (isLate ? 'border-amber-300' : 'border-rose-300')
    : 'border-slate-200';
  const headerBg = enabled
    ? (isLate ? 'bg-amber-50' : 'bg-rose-50')
    : 'bg-slate-50';
  const iconBg = enabled
    ? (isLate ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600')
    : 'bg-slate-200 text-slate-400';
  const activeLabel = isLate ? 'text-amber-600' : 'text-rose-600';

  const title = isLate ? 'Late Entry Penalty' : 'Early Exit Penalty';
  const subtitle = isLate
    ? 'Rules for employees who punch in after shift start'
    : 'Rules for employees who punch out before shift end';

  const exampleText = (() => {
    if (graceMin === '') return null;
    const parts: string[] = [];
    if (isLate) {
      parts.push(`Employee can punch in up to ${graceMin} min after shift start without penalty.`);
    } else {
      parts.push(`Employee can leave up to ${graceMin} min before shift end without penalty.`);
    }
    if (halfDayMin !== '' && !thresholdError) {
      parts.push(isLate
        ? `If late beyond ${halfDayMin} min, attendance is marked as Half-Day.`
        : `If early exit exceeds ${halfDayMin} min, attendance is marked as Half-Day.`);
    }
    if (maxAllowed !== '') {
      const actionLabel = PENALTY_ACTION_OPTIONS.find(o => o.value === penaltyAction)?.label ?? 'penalty';
      parts.push(`Up to ${maxAllowed} such ${isLate ? 'late entries' : 'early exits'}/month are allowed before ${actionLabel.toLowerCase()} applies.`);
    }
    return parts.join(' ');
  })();

  return (
    <div className={`rounded-xl border-2 ${cardBorder} overflow-hidden transition-all duration-200`}>
      {/* ── Card header with enable toggle ── */}
      <div className={`flex items-center justify-between px-5 py-4 ${headerBg} transition-colors`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${iconBg}`}>
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className={`text-sm font-bold ${enabled ? 'text-slate-800' : 'text-slate-500'}`}>{title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={`text-xs font-semibold ${enabled ? activeLabel : 'text-slate-400'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <CardToggleBtn
            checked={enabled}
            onChange={v => onChange(`${prefix}_enabled`, v)}
            color={isLate ? 'amber' : 'rose'}
          />
        </div>
      </div>

      {/* ── Expanded body ── */}
      {enabled && (
        <div className="px-5 py-5 bg-white border-t border-slate-100 space-y-4">

          {/* Row 1: Grace Period + Half-Day Threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Grace Period</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">minutes</span>
              </div>
              <input
                type="number"
                min="0"
                value={graceMin}
                onChange={e => onChange(`${prefix}_grace_minutes`, e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 15"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800"
              />
              <p className="text-[10px] text-slate-400 leading-tight">
                {isLate
                  ? 'Employees punching in within this window are not penalised'
                  : 'Employees leaving within this window before shift end are not penalised'}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Half-Day Threshold</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">minutes</span>
              </div>
              <input
                type="number"
                min="0"
                value={halfDayMin}
                onChange={e => onChange(`${prefix}_half_day_threshold_minutes`, e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 120"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${thresholdError
                  ? 'border-red-300 bg-red-50 focus:ring-red-400'
                  : 'border-slate-200 focus:ring-indigo-400'
                  } text-slate-800`}
              />
              {thresholdError ? (
                <p className="text-[10px] text-red-500 font-medium">
                  Must be greater than grace period ({graceMin} min)
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 leading-tight">
                  {isLate
                    ? 'Exceeding this limit converts the day to Half-Day'
                    : 'Exceeding this early-exit limit converts the day to Half-Day'}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Max Allowed + Penalty Action */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                {isLate ? 'Max Late Entries / Month' : 'Max Early Exits / Month'}
              </span>
              <input
                type="number"
                min="0"
                value={maxAllowed}
                onChange={e => onChange(`${prefix}_max_allowed`, e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Leave blank = unlimited"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800"
              />
              <p className="text-[10px] text-slate-400 leading-tight">
                {isLate
                  ? 'Monthly allowance before the penalty action triggers. Blank = no cap.'
                  : 'Monthly allowance before the penalty action triggers. Blank = no cap.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Penalty Action</span>
              <select
                value={penaltyAction}
                onChange={e => onChange(`${prefix}_penalty_action`, e.target.value as PenaltyActionValue)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800"
              >
                {PENALTY_ACTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 leading-tight">
                {PENALTY_ACTION_OPTIONS.find(o => o.value === penaltyAction)?.desc}
              </p>
            </div>
          </div>

          {/* Escalation toggle */}
          <div className={`flex items-start justify-between gap-4 px-4 py-3.5 rounded-xl border transition-colors ${escalation ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700">Repeat Penalty Escalation</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                {escalation
                  ? `Severity increases for repeated violations — e.g. 3× warning → 5× deduction → 7× half-day`
                  : 'Same penalty applies regardless of how many violations occur'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              <span className={`text-xs font-medium ${escalation ? 'text-indigo-600' : 'text-slate-400'}`}>
                {escalation ? 'On' : 'Off'}
              </span>
              <ToggleSwitch
                checked={escalation}
                onChange={v => onChange(`${prefix}_escalation_enabled`, v)}
              />
            </div>
          </div>

          {/* Contextual example */}
          {exampleText && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-blue-50 border border-blue-100">
              <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-blue-700 leading-relaxed">
                <span className="font-semibold">Example: </span>{exampleText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapsed placeholder */}
      {!enabled && (
        <div className="px-5 py-2.5 bg-white border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            Enable to configure {isLate ? 'late entry' : 'early exit'} penalty rules
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Gender-Aware Leave Card ─────────────────────────────────────────────────
// Handles Maternity (female) and Paternity (male) leave configuration
// inside the Leave Policy template form.

function LeavePolicyGenderCard({
  type,
  config,
  onChange,
}: {
  type: 'maternity' | 'paternity';
  config: Record<string, any>;
  onChange: (key: string, val: any) => void;
}) {
  const isMaternity = type === 'maternity';
  const daysKey = isMaternity ? 'maternity_leave_days' : 'paternity_leave_days';
  const paidKey = isMaternity ? 'maternity_leave_paid' : 'paternity_leave_paid';

  const days: number = config[daysKey] ?? 0;
  const paid: boolean = config[paidKey] !== false;
  const active = days > 0;

  const genderLabel = isMaternity ? 'Female Only' : 'Male Only';
  const title = isMaternity ? 'Maternity Leave' : 'Paternity Leave';
  const subtitle = isMaternity
    ? 'Paid / unpaid leave for female employees after childbirth'
    : 'Paid / unpaid leave for male employees on birth of a child';

  const accentBorder = active ? (isMaternity ? 'border-rose-300' : 'border-blue-300') : 'border-slate-200';
  const headerBg = active ? (isMaternity ? 'bg-rose-50' : 'bg-blue-50') : 'bg-slate-50';
  const genderPillBg = active
    ? (isMaternity ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-blue-100 text-blue-700 border border-blue-200')
    : 'bg-slate-100 text-slate-400 border border-slate-200';
  const accentText = active ? (isMaternity ? 'text-rose-600' : 'text-blue-600') : 'text-slate-400';
  const infoBg = isMaternity ? 'bg-rose-50 border-rose-100' : 'bg-blue-50 border-blue-100';
  const infoText = isMaternity ? 'text-rose-700' : 'text-blue-700';
  const infoIcon = isMaternity ? 'text-rose-400' : 'text-blue-400';
  const paidActiveCls = 'bg-emerald-600 text-white border-emerald-600 shadow-md';
  const unpaidActiveCls = 'bg-slate-700 text-white border-slate-700 shadow-md';
  const inactiveCls = 'border-slate-200 text-slate-500 hover:border-slate-300';

  return (
    <div className={`rounded-xl border-2 ${accentBorder} overflow-hidden transition-all duration-200`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${headerBg} transition-colors`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${active ? (isMaternity ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600') : 'bg-slate-200 text-slate-400'}`}>
            <Heart className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className={`text-sm font-bold ${active ? 'text-slate-800' : 'text-slate-500'}`}>{title}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${genderPillBg}`}>{genderLabel}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">{subtitle}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold ${accentText}`}>
          {active ? `${days} days` : 'Not Applicable'}
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-5 bg-white border-t border-slate-100 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Days */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Allowed Days</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">days</span>
            </div>
            <input
              type="number"
              min="0"
              value={days === 0 ? '' : days}
              onChange={e => onChange(daysKey, e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="0 = not applicable"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800"
            />
            <p className="text-[10px] text-slate-400 leading-tight">Leave blank or 0 to disable</p>
          </div>

          {/* Paid / Unpaid */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">Leave Pay Type</span>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => onChange(paidKey, true)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${paid ? paidActiveCls : inactiveCls}`}
              >
                Paid
              </button>
              <button
                type="button"
                onClick={() => onChange(paidKey, false)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${!paid ? unpaidActiveCls : inactiveCls}`}
              >
                Unpaid
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">Determines salary deduction</p>
          </div>
        </div>

        {/* Auto-eligibility notice */}
        {active && (
          <div className={`flex items-start gap-2.5 px-3.5 py-3 rounded-lg border ${infoBg}`}>
            <Info className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${infoIcon}`} />
            <p className={`text-[11px] leading-relaxed ${infoText}`}>
              <span className="font-semibold">Auto-eligible: </span>
              {isMaternity
                ? `Female employees will automatically receive ${days} days of ${paid ? 'paid' : 'unpaid'} Maternity Leave in their leave balance.`
                : `Male employees will automatically receive ${days} days of ${paid ? 'paid' : 'unpaid'} Paternity Leave in their leave balance.`}
              {' '}Ineligible-gender employees will not see this leave type in their portal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Gender-Aware Leave Summary (detail panel) ───────────────────────────────

function LeavePolicyGenderSummary({ config }: { config: Record<string, any> }) {
  const entries = [
    {
      key: 'maternity',
      label: 'Maternity Leave',
      genderLabel: 'Female Only',
      days: config.maternity_leave_days ?? 0,
      paid: config.maternity_leave_paid !== false,
      accentBg: 'bg-rose-50',
      accentBorder: 'border-rose-200',
      accentText: 'text-rose-700',
      pillBg: 'bg-rose-100 text-rose-700',
    },
    {
      key: 'paternity',
      label: 'Paternity Leave',
      genderLabel: 'Male Only',
      days: config.paternity_leave_days ?? 0,
      paid: config.paternity_leave_paid !== false,
      accentBg: 'bg-blue-50',
      accentBorder: 'border-blue-200',
      accentText: 'text-blue-700',
      pillBg: 'bg-blue-100 text-blue-700',
    },
  ].filter(e => e.days > 0);

  if (entries.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Heart className="w-3.5 h-3.5 text-slate-400" />
        Gender-Aware Leave
      </h4>
      <div className="space-y-2">
        {entries.map(e => (
          <div key={e.key} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${e.accentBorder} ${e.accentBg}`}>
            <div className="flex items-center gap-2.5">
              <Heart className={`w-3.5 h-3.5 ${e.accentText}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${e.accentText}`}>{e.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${e.pillBg}`}>{e.genderLabel}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Automatically assigned · {e.paid ? 'Paid leave' : 'Unpaid leave'}</p>
              </div>
            </div>
            <span className={`text-sm font-bold ${e.accentText}`}>{e.days} days</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Leave Encashment Card ───────────────────────────────────────────────────

function LeaveEncashmentCard({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, val: any) => void;
}) {
  const enabled = Boolean(config.encashment_enabled);
  const maxDays: number | '' = config.encashment_max_days_per_year ?? '';
  const leaveTypes: string = config.encashment_leave_types ?? 'pl_only';
  const basis: string = config.encashment_basis ?? 'basic';
  const timing: string = config.encashment_timing ?? 'anytime';
  const minRetain: number | '' = config.encashment_min_retain_days ?? '';
  const requiresApproval: boolean = Boolean(config.encashment_requires_approval);

  const leaveTypeLabel: Record<string, string> = { pl_only: 'Privilege Leave', cl_only: 'Casual Leave', pl_cl: 'PL + CL' };
  const timingLabel: Record<string, string> = { anytime: 'anytime', year_end: 'at year-end (December) only', on_exit: 'on exit only' };

  const exampleText = (() => {
    if (!enabled) return null;
    const parts: string[] = [];
    if (maxDays !== '') parts.push(`Employees can encash up to ${maxDays} day(s) of ${leaveTypeLabel[leaveTypes] ?? leaveTypes} per year.`);
    if (minRetain !== '' && Number(minRetain) > 0) parts.push(`A minimum of ${minRetain} day(s) must remain in the balance after encashment.`);
    parts.push(`Daily rate = 1/26 of monthly ${basis === 'gross' ? 'gross' : 'basic'} salary.`);
    parts.push(`Requests can be raised ${timingLabel[timing] ?? timing}${requiresApproval ? ' and require HR approval before processing' : ' and are auto-approved'}.`);
    return parts.join(' ');
  })();

  const accentBorder = enabled ? 'border-emerald-300' : 'border-slate-200';
  const headerBg = enabled ? 'bg-emerald-50' : 'bg-slate-50';
  const iconBg = enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400';

  return (
    <div className={`rounded-xl border-2 ${accentBorder} overflow-hidden transition-all duration-200`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${headerBg} transition-colors`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${iconBg}`}>
            <IndianRupee className="w-4 h-4" />
          </div>
          <div>
            <p className={`text-sm font-bold ${enabled ? 'text-slate-800' : 'text-slate-500'}`}>Leave Encashment</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">Allow employees to convert unused leave balance into cash</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={`text-xs font-semibold ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
            {enabled ? 'Allowed' : 'Not Allowed'}
          </span>
          <CardToggleBtn
            checked={enabled}
            onChange={v => onChange('encashment_enabled', v)}
            color="emerald"
          />
        </div>
      </div>

      {/* Expanded body */}
      {enabled && (
        <div className="px-5 py-5 bg-white border-t border-slate-100 space-y-4">

          {/* Row 1: Max Days / Year + Leave Types */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Max Days / Year</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">days</span>
              </div>
              <input
                type="number"
                min="0"
                value={maxDays}
                onChange={e => onChange('encashment_max_days_per_year', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 15"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-800"
              />
              <p className="text-[10px] text-slate-400 leading-tight">Maximum leave days an employee can encash per year</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Encashable Leave Types</span>
              <select
                value={leaveTypes}
                onChange={e => onChange('encashment_leave_types', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800"
              >
                <option value="pl_only">Privilege Leave Only</option>
                <option value="cl_only">Casual Leave Only</option>
                <option value="pl_cl">PL + CL (Both)</option>
              </select>
              <p className="text-[10px] text-slate-400 leading-tight">Which leave balances are eligible for encashment</p>
            </div>
          </div>

          {/* Row 2: Salary Basis + Encashment Window */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Salary Basis</span>
              <select
                value={basis}
                onChange={e => onChange('encashment_basis', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800"
              >
                <option value="basic">Basic Salary (÷ 26 per day)</option>
                <option value="gross">Gross Salary (÷ 26 per day)</option>
              </select>
              <p className="text-[10px] text-slate-400 leading-tight">Salary component used to compute the daily encashment rate</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Encashment Window</span>
              <select
                value={timing}
                onChange={e => onChange('encashment_timing', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800"
              >
                <option value="anytime">Anytime</option>
                <option value="year_end">Year-End Only (December)</option>
                <option value="on_exit">On Exit Only</option>
              </select>
              <p className="text-[10px] text-slate-400 leading-tight">When employees are allowed to raise an encashment request</p>
            </div>
          </div>

          {/* Row 3: Min Retain + Approval */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Min. Balance to Retain</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">days</span>
              </div>
              <input
                type="number"
                min="0"
                value={minRetain}
                onChange={e => onChange('encashment_min_retain_days', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0 = no minimum"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-800"
              />
              <p className="text-[10px] text-slate-400 leading-tight">Employee cannot encash if it would drop their balance below this</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Approval Requirement</span>
              <div
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${requiresApproval ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}
                onClick={() => onChange('encashment_requires_approval', !requiresApproval)}
              >
                <span className={`text-sm font-medium ${requiresApproval ? 'text-amber-700' : 'text-slate-600'}`}>
                  {requiresApproval ? 'Approval Required' : 'Auto-Approved'}
                </span>
                <ToggleSwitch checked={requiresApproval} onChange={v => onChange('encashment_requires_approval', v)} />
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {requiresApproval ? 'HR must review and approve before leave balance is deducted' : 'Requests are approved instantly and balance is deducted immediately'}
              </p>
            </div>
          </div>

          {/* Policy summary example */}
          {exampleText && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <Info className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                <span className="font-semibold">Policy summary: </span>{exampleText}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── OT Rate Multiplier Card ─────────────────────────────────────────────────

const OT_MULTIPLIER_PRESETS = [
  { value: 1.0,  label: '1×',    sublabel: 'No premium',      desc: 'Flat rate — same as regular hourly pay' },
  { value: 1.25, label: '1.25×', sublabel: 'Quarter premium', desc: 'Mild incentive for voluntary overtime' },
  { value: 1.5,  label: '1.5×',  sublabel: 'Time & a half',   desc: 'Standard statutory overtime rate' },
  { value: 2.0,  label: '2×',    sublabel: 'Double time',     desc: 'Holiday or high-demand event premium' },
];

function OtRateMultiplierCard({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, val: any) => void;
}) {
  const otApplicable = Boolean(config.ot_applicable);
  const multiplier: number = config.ot_rate_multiplier ?? 1.5;
  const isPreset = OT_MULTIPLIER_PRESETS.some(p => p.value === multiplier);
  const [customMode, setCustomMode] = useState(!isPreset);

  if (!otApplicable) return null;

  const hourlyRate = 30000 / (26 * 8);
  const examplePay = hourlyRate * 3 * multiplier;
  const activePreset = OT_MULTIPLIER_PRESETS.find(p => p.value === multiplier);

  return (
    <div className="rounded-xl border-2 border-amber-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-amber-50 border-b border-amber-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">OT Rate Multiplier</p>
            <p className="text-[11px] text-slate-400 leading-tight">Factor applied to the hourly rate for each overtime hour worked</p>
          </div>
        </div>
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-2xl font-black text-amber-600">{multiplier}</span>
          <span className="text-sm font-bold text-amber-500">×</span>
        </div>
      </div>

      <div className="px-5 py-4 bg-white space-y-4">
        {/* Preset grid */}
        <div className="grid grid-cols-4 gap-2">
          {OT_MULTIPLIER_PRESETS.map(preset => {
            const active = !customMode && multiplier === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  setCustomMode(false);
                  onChange('ot_rate_multiplier', preset.value);
                }}
                className={`flex flex-col items-center gap-1 px-2 py-3.5 rounded-xl border-2 transition-all ${
                  active
                    ? 'border-amber-400 bg-amber-50 shadow-md shadow-amber-100/60'
                    : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40'
                }`}
              >
                <span className={`text-lg font-black leading-none ${active ? 'text-amber-600' : 'text-slate-700'}`}>
                  {preset.label}
                </span>
                <span className={`text-[10px] font-semibold leading-tight text-center ${active ? 'text-amber-500' : 'text-slate-400'}`}>
                  {preset.sublabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom input */}
        <div>
          <div className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border transition-colors ${
            customMode ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50'
          }`}>
            <span className="text-xs font-semibold text-slate-500 shrink-0">Custom</span>
            <input
              type="number"
              step="0.05"
              min="1"
              max="5"
              value={customMode ? multiplier : ''}
              placeholder="e.g. 1.75"
              onFocus={() => setCustomMode(true)}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 1) {
                  setCustomMode(true);
                  onChange('ot_rate_multiplier', v);
                }
              }}
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none min-w-0"
            />
            <span className="text-xs text-slate-400 shrink-0">× hourly rate</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 px-1">Enter any value between 1× and 5× for non-standard rates</p>
        </div>

        {/* Live example */}
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-blue-50 border border-blue-100">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            <span className="font-semibold">Example: </span>
            Employee with ₹30,000 basic · 3 OT hours →
            {' '}Hourly rate = ₹{hourlyRate.toFixed(2)} →
            {' '}OT pay = <span className="font-bold">₹{examplePay.toFixed(2)}</span>
            {activePreset && <span className="text-blue-500 italic"> — {activePreset.desc}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Break Time Config Card ──────────────────────────────────────────────────

function BreakTimeConfigCard({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, val: any) => void;
}) {
  const enabled = Boolean(config.break_enabled);
  const breakStart: string = config.break_start_time ?? '';
  const breakEnd: string = config.break_end_time ?? '';
  const breakDuration: number | '' = config.break_duration_minutes ?? '';
  const paidBreak: boolean = config.paid_break !== false;
  const shiftStart: string = config.shift_start_time ?? '';
  const shiftEnd: string = config.shift_end_time ?? '';
  const isOvernight: boolean = Boolean(config.is_overnight_shift);

  const parseMinutes = (t: string): number => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const formatMinutes = (min: number): string => {
    if (min <= 0) return '0m';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const calcDurationFromTimes = (start: string, end: string): number | null => {
    if (!start || !end) return null;
    const startMin = parseMinutes(start);
    const endMin = parseMinutes(end);
    if (endMin <= startMin) return null;
    return endMin - startMin;
  };

  const handleBreakStartChange = (val: string) => {
    onChange('break_start_time', val);
    const dur = calcDurationFromTimes(val, breakEnd);
    if (dur !== null) onChange('break_duration_minutes', dur);
  };

  const handleBreakEndChange = (val: string) => {
    onChange('break_end_time', val);
    const dur = calcDurationFromTimes(breakStart, val);
    if (dur !== null) onChange('break_duration_minutes', dur);
  };

  const calcShiftStats = (): { totalMin: number; bDur: number; effectiveMin: number } | null => {
    if (!shiftStart || !shiftEnd) return null;
    const startMin = parseMinutes(shiftStart);
    let endMin = parseMinutes(shiftEnd);
    if (isOvernight && endMin <= startMin) endMin += 24 * 60;
    else if (endMin < startMin) endMin += 24 * 60;
    const totalMin = endMin - startMin;
    const bDur = breakDuration !== '' ? Number(breakDuration) : 0;
    const effectiveMin = paidBreak ? totalMin : totalMin - bDur;
    return { totalMin, bDur, effectiveMin };
  };

  const stats = enabled ? calcShiftStats() : null;
  const hasBreakSummary = breakStart && breakEnd && breakDuration !== '';

  return (
    <div className={`rounded-xl border-2 ${enabled ? 'border-rose-300' : 'border-slate-200'} overflow-hidden transition-all duration-200`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${enabled ? 'bg-rose-50' : 'bg-slate-50'} transition-colors`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${enabled ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-400'}`}>
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className={`text-sm font-bold ${enabled ? 'text-slate-800' : 'text-slate-500'}`}>Break Time Configuration</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">Schedule a rest break within this shift</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={`text-xs font-semibold ${enabled ? 'text-rose-600' : 'text-slate-400'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <CardToggleBtn
            checked={enabled}
            onChange={v => onChange('break_enabled', v)}
            color="rose"
          />
        </div>
      </div>

      {/* Expanded body */}
      {enabled && (
        <div className="px-5 py-5 bg-white border-t border-slate-100 space-y-5">

          {/* Row 1: Break Start + Break End */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Break Start</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">time</span>
              </div>
              <input
                type="time"
                value={breakStart}
                onChange={e => handleBreakStartChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 text-slate-800"
              />
              <p className="text-[10px] text-slate-400 leading-tight">When the break period begins</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Break End</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">time</span>
              </div>
              <input
                type="time"
                value={breakEnd}
                onChange={e => handleBreakEndChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 text-slate-800"
              />
              <p className="text-[10px] text-slate-400 leading-tight">When the break period ends</p>
            </div>
          </div>

          {/* Break Duration */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Break Duration</span>
              <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded font-medium">auto-calculated</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="480"
                value={breakDuration}
                onChange={e => onChange('break_duration_minutes', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 30"
                className="w-32 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 text-slate-800"
              />
              <span className="text-xs text-slate-500">minutes</span>
              {breakDuration !== '' && Number(breakDuration) > 0 && (
                <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                  {formatMinutes(Number(breakDuration))}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Auto-calculated from start/end times. Enter directly if times are not set.
            </p>
          </div>

          {/* Paid / Unpaid Break */}
          <div className={`flex items-start justify-between gap-4 px-4 py-3.5 rounded-xl border transition-colors ${paidBreak ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700">Paid Break</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                {paidBreak
                  ? 'Break time counts as paid work hours — employees are compensated during break'
                  : 'Break time is unpaid — deducted from effective working hours for payroll purposes'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              <span className={`text-xs font-medium ${paidBreak ? 'text-emerald-600' : 'text-slate-400'}`}>
                {paidBreak ? 'Paid' : 'Unpaid'}
              </span>
              <ToggleSwitch checked={paidBreak} onChange={v => onChange('paid_break', v)} />
            </div>
          </div>

          {/* Hours breakdown — only when shift times are set */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center px-3 py-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Shift Total</span>
                <span className="text-lg font-black text-slate-700">{formatMinutes(stats.totalMin)}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-3 rounded-xl bg-rose-50 border border-rose-200">
                <span className="text-[10px] text-rose-500 font-medium uppercase tracking-wide mb-1">Break</span>
                <span className="text-lg font-black text-rose-600">{formatMinutes(stats.bDur)}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] text-emerald-500 font-medium uppercase tracking-wide mb-1">Effective Work</span>
                <span className="text-lg font-black text-emerald-600">{formatMinutes(stats.effectiveMin)}</span>
              </div>
            </div>
          )}

          {/* Context callout */}
          {hasBreakSummary && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-blue-50 border border-blue-100">
              <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-blue-700 leading-relaxed">
                <span className="font-semibold">Break summary: </span>
                {breakStart} → {breakEnd} ({formatMinutes(Number(breakDuration))} break).
                {' '}{paidBreak
                  ? 'Paid break — full shift hours count toward payroll and overtime calculations.'
                  : `Unpaid break — ${formatMinutes(Number(breakDuration))} will be deducted from effective working hours.`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapsed placeholder */}
      {!enabled && (
        <div className="px-5 py-2.5 bg-white border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Enable to configure break time for this shift</p>
        </div>
      )}
    </div>
  );
}

// ─── Break Time Config Summary (detail view) ─────────────────────────────────

function BreakTimeConfigSummary({ config }: { config: Record<string, any> }) {
  if (!config.break_enabled) return null;

  const start: string = config.break_start_time ?? '';
  const end: string = config.break_end_time ?? '';
  const duration: number | undefined = config.break_duration_minutes;
  const paid: boolean = config.paid_break !== false;

  if (!duration && !start) return null;

  const timeLabel = start && end ? `${start} → ${end}` : 'Scheduled break';
  const durationLabel = duration ? `${duration} min` : '';

  return (
    <div className="mt-4">
      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        Break Time
      </h4>
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center gap-2.5">
          <Clock className={`w-3.5 h-3.5 ${paid ? 'text-emerald-600' : 'text-slate-500'}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${paid ? 'text-emerald-700' : 'text-slate-700'}`}>{timeLabel}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${paid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                {paid ? 'Paid' : 'Unpaid'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {durationLabel ? `${durationLabel} · ` : ''}{paid ? 'Counted as paid hours' : 'Deducted from working hours'}
            </p>
          </div>
        </div>
        {durationLabel && (
          <span className={`text-sm font-bold ${paid ? 'text-emerald-700' : 'text-slate-700'}`}>{durationLabel}</span>
        )}
      </div>
    </div>
  );
}

// ─── Period selector (Monthly / Yearly) ──────────────────────────────────────

function PeriodSelector({ config, onChange }: {
  config: Record<string, any>;
  onChange: (key: string, val: any) => void;
}) {
  const applyType: string = config.apply_type || 'monthly';

  return (
    <div className="rounded-xl border border-indigo-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100 flex items-center gap-2">
        <CalendarDays className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Apply Type</span>
        {/* <span className="text-[10px] text-indigo-400 ml-auto">How entered values are calculated/applied</span> */}
      </div>

      <div className="p-4 space-y-3">
        {/* Segmented toggle */}
        <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50 p-1 gap-1 shadow-inner">
          <button
            type="button"
            onClick={() => onChange('apply_type', 'monthly')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${applyType === 'monthly'
              ? 'bg-white text-indigo-700 shadow-md shadow-indigo-100 border border-indigo-200 ring-1 ring-indigo-300/50'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Monthly
          </button>
          <button
            type="button"
            onClick={() => onChange('apply_type', 'yearly')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${applyType === 'yearly'
              ? 'bg-white text-indigo-700 shadow-md shadow-indigo-100 border border-indigo-200 ring-1 ring-indigo-300/50'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Yearly
          </button>
        </div>

        {/* Context hint */}
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {applyType === 'monthly'
            ? 'Entered values will be calculated/applied monthly.'
            : 'Entered values will be calculated/applied yearly.'}
        </p>
      </div>
    </div>
  );
}

// ─── Quick-actions dropdown ───────────────────────────────────────────────────

function TemplateActionsMenu({ template, domain, onEdit, onDuplicate, onDelete, onSetDefault, canEdit, canCreate, canDelete }: {
  template: any;
  domain: typeof POLICY_DOMAINS[0];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/60 py-1 w-44" onClick={e => e.stopPropagation()}>
          {canEdit && (
            <button onClick={() => { onEdit(); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <Pencil className="w-3.5 h-3.5 text-slate-400" /> Edit Template
            </button>
          )}
          {canCreate && (
            <button onClick={() => { onDuplicate(); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <Copy className="w-3.5 h-3.5 text-slate-400" /> Copy Template
            </button>
          )}
          {!template.is_default && canEdit && (
            <button onClick={() => { onSetDefault(); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <Star className="w-3.5 h-3.5 text-amber-400" /> Set as Default
            </button>
          )}
          {canDelete && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button onClick={() => { onDelete(); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete Template
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const canCreate = useCan(PERMISSIONS.PLATFORM_TEMPLATES_CREATE);
  const canEdit = useCan(PERMISSIONS.PLATFORM_TEMPLATES_EDIT);
  const canDelete = useCan(PERMISSIONS.PLATFORM_TEMPLATES_DELETE);
  const canAssign = useCan(PERMISSIONS.PLATFORM_TEMPLATES_ASSIGN);
  const [activeDomain, setActiveDomain] = useState(POLICY_DOMAINS[0].key);
  const [templates, setTemplates] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [search, setSearch] = useState('');

  // Create / Edit
  const [showCreate, setShowCreate] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', description: '', config: {} as Record<string, any> });
  const [createLoading, setCreateLoading] = useState(false);

  // Delete flow
  const [deleteTemplate, setDeleteTemplate] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const depCheck = useDependencyCheck();

  // Copy / Paste clipboard
  const [copiedTemplate, setCopiedTemplate] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [previewEmployee, setPreviewEmployee] = useState<any | null>(null);
  const [previewResults, setPreviewResults] = useState<Record<string, any>>({});
  const [previewLoading, setPreviewLoading] = useState(false);

  const domain = POLICY_DOMAINS.find(d => d.key === activeDomain)!;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const { data } = await api.get('/templates', { params: { type } });
      const list: any[] = data.data || [];
      setTemplates(list);
      const assignMap: Record<string, any[]> = {};
      await Promise.all(list.map(async (t: any) => {
        try {
          const { data: ad } = await api.get('/template-assignments', { params: { template_id: t.id } });
          assignMap[t.id] = ad.data || [];
        } catch { assignMap[t.id] = []; }
      }));
      setAssignments(assignMap);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchTemplates(activeDomain); }, [activeDomain, fetchTemplates]);
  useEffect(() => { if (showPreview) fetchEmployees(); }, [showPreview, fetchEmployees]);

  useEffect(() => {
    if (selectedTemplate) {
      const updated = templates.find(t => t.id === selectedTemplate.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedTemplate)) {
        setSelectedTemplate(updated);
      }
    }
  }, [templates, selectedTemplate]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleConfigChange = (key: string, val: any) => {
    setCreateForm(f => ({ ...f, config: { ...f.config, [key]: val } }));
  };

  const openCreate = () => {
    setIsEditing(false);
    setEditTemplateId(null);
    const defaultConfig: Record<string, any> = APPLY_TYPE_DOMAINS.has(activeDomain)
      ? { apply_type: 'monthly' }
      : {};
    setCreateForm({ name: '', description: '', config: defaultConfig });
    setShowCreate(true);
  };

  const openEdit = (template: any) => {
    setIsEditing(true);
    setEditTemplateId(template.id);
    setCreateForm({ name: template.name, description: template.description || '', config: { ...(template.config || {}) } });
    setShowCreate(true);
  };

  const handleCopyTemplate = (template: any) => {
    setCopiedTemplate(template);
    setToast(`"${template.name}" copied — open New Template to paste`);
    setTimeout(() => setToast(null), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      if (isEditing && editTemplateId) {
        await api.put(`/templates/${editTemplateId}`, {
          name: createForm.name, description: createForm.description, config: createForm.config,
          is_default: selectedTemplate?.is_default || false,
        });
      } else {
        await api.post('/templates', {
          template_type: activeDomain, name: createForm.name,
          description: createForm.description, config: createForm.config, is_default: false,
        });
      }
      setShowCreate(false);
      fetchTemplates(activeDomain);
    } catch (err: any) {
      alert(err.response?.data?.error || `Failed to ${isEditing ? 'update' : 'create'} template`);
    } finally { setCreateLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteTemplate) return;
    setDeleting(true);
    try {
      await api.delete(`/templates/${deleteTemplate.id}`);
      setDeleteTemplate(null);
      depCheck.clear();
      fetchTemplates(activeDomain);
      if (selectedTemplate?.id === deleteTemplate.id) setSelectedTemplate(null);
    } catch { alert('Failed to delete template'); }
    finally { setDeleting(false); }
  };

  const openDeleteTemplate = (t: any) => {
    setDeleteTemplate(t);
    depCheck.check('template', t.id);
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.put(`/templates/${id}`, { is_default: true });
      fetchTemplates(activeDomain);
    } catch { alert('Failed to set default'); }
  };

  const handlePreview = async (emp: any) => {
    setPreviewEmployee(emp);
    setPreviewLoading(true);
    try {
      const results: Record<string, any> = {};
      for (const dom of POLICY_DOMAINS) {
        try {
          const { data } = await api.get('/templates/resolved', {
            params: { type: dom.key, scope_type: 'employee', scope_id: emp.id },
          });
          results[dom.key] = data.data;
        } catch { results[dom.key] = null; }
      }
      setPreviewResults(results);
    } finally { setPreviewLoading(false); }
  };

  const getAssignmentCount = (id: string) => (assignments[id] || []).length;

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <Settings2 className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">HR Policy Templates</h1>
                <p className="text-xs text-slate-500">Configurable rules applied per-employee, designation, department, or property</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${showPreview
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
              >
                <Eye className="w-4 h-4" />
                Preview Policies
              </button>
              {canCreate && (
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  New Template
                </button>
              )}
            </div>
          </div>

          {/* Priority legend */}
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-medium text-slate-600">Priority cascade:</span>
            {[
              { label: 'Per-Employee', color: 'bg-violet-500', score: 100 },
              { label: 'Designation', color: 'bg-blue-500', score: 50 },
              { label: 'Department', color: 'bg-emerald-500', score: 30 },
              { label: 'Property', color: 'bg-amber-500', score: 10 },
              { label: 'Default', color: 'bg-slate-400', score: 0 },
            ].map((item, i, arr) => (
              <span key={item.label} className="flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${item.color}`} />
                {item.label}
                {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 mx-0.5" />}
              </span>
            ))}
          </div>
        </div>

        {/* Domain tabs */}
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex gap-0 border-b border-slate-200">
            {POLICY_DOMAINS.map(dom => {
              const Icon = dom.icon;
              const active = dom.key === activeDomain;
              return (
                <button
                  key={dom.key}
                  onClick={() => { setActiveDomain(dom.key); setSelectedTemplate(null); setSearch(''); }}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {dom.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-[1400px] mx-auto px-6 py-6 flex gap-6">

        {/* ── Template list ── */}
        <div className={`flex flex-col gap-3 ${selectedTemplate ? 'w-80 shrink-0' : 'flex-1'}`}>

          {/* Domain banner */}
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${domain.lightBg} ${domain.borderColor}`}>
            <Info className={`w-4 h-4 mt-0.5 shrink-0 ${domain.textColor}`} />
            <div>
              <p className={`text-sm font-semibold ${domain.textColor}`}>{domain.label}</p>
              <p className="text-xs text-slate-600 mt-0.5">{domain.description}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-9 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
              <domain.icon className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">
                {search ? `No templates matching "${search}"` : `No ${domain.label} templates yet`}
              </p>
              {!search && <p className="text-xs text-slate-400 mt-1">Click "New Template" to create one</p>}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTemplates.map(t => {
                const count = getAssignmentCount(t.id);
                const isSelected = selectedTemplate?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(isSelected ? null : t)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${isSelected ? 'border-indigo-400 bg-indigo-50 shadow-md shadow-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                          {t.is_default && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              <Star className="w-2.5 h-2.5" /> DEFAULT
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${domain.lightBg} ${domain.textColor} ${domain.borderColor}`}>
                          {count} {count === 1 ? 'assigned' : 'assigned'}
                        </span>
                        <TemplateActionsMenu
                          template={t}
                          domain={domain}
                          onEdit={() => openEdit(t)}
                          onDuplicate={() => handleCopyTemplate(t)}
                          onDelete={() => openDeleteTemplate(t)}
                          onSetDefault={() => handleSetDefault(t.id)}
                          canEdit={canEdit}
                          canCreate={canCreate}
                          canDelete={canDelete}
                        />
                      </div>
                    </div>

                    {/* Config peek */}
                    {!selectedTemplate && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {/* Apply period badge */}
                        {APPLY_TYPE_DOMAINS.has(activeDomain) && activeDomain !== 'attendance_policy' && t.config?.apply_type && (
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold border ${t.config.apply_type === 'monthly'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-violet-50 text-violet-700 border-violet-200'
                            }`}>
                            <CalendarDays className="w-3 h-3" />
                            {t.config.apply_type === 'monthly'
                              ? `${MONTH_NAMES[(t.config.apply_month || 1) - 1]} ${t.config.apply_year || ''}`.trim()
                              : `Year ${t.config.apply_year || ''}`.trim()}
                          </span>
                        )}
                        {/* Salary structure specific peek */}
                        {activeDomain === 'salary_structure' && t.config ? (() => {
                          const mode = t.config.salary_input_mode || 'annual_ctc';
                          const annual = mode === 'annual_ctc' ? Number(t.config.annual_ctc_lpa) : mode === 'monthly_ctc' ? Number(t.config.monthly_ctc_input) * 12 : 0;
                          const basic = Number(t.config.basic_percent_of_ctc) || 40;
                          const chips = [
                            annual > 0 ? `₹${(annual / 100000).toFixed(1)}L CTC` : null,
                            `Basic ${basic}%`,
                            t.config.pf_applicable !== false ? 'PF ✓' : null,
                            t.config.pt_applicable !== false && t.config.pt_state ? `PT (${t.config.pt_state.replace('_', ' ')})` : null,
                          ].filter(Boolean);
                          return chips.map((chip, i) => (
                            <span key={i} className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 font-medium">
                              {chip}
                            </span>
                          ));
                        })() : domain.fields.slice(0, 3).map(field => {
                          const val = t.config?.[field.key];
                          if (val == null) return null;
                          if (field.condition && !field.condition(t.config)) return null;
                          return (
                            <span key={field.key} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                              <span className="text-slate-400">{field.label}:</span>
                              <span className="font-medium">{(field.format as any)(val)}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3">
                      <span className="text-[10px] text-slate-400">
                        Created {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selectedTemplate && (
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              {/* Panel header */}
              <div className={`bg-gradient-to-r ${domain.gradient} p-5`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <domain.icon className="w-5 h-5 text-white/80" />
                      <span className="text-white/70 text-xs font-medium uppercase tracking-wider">{domain.label}</span>
                      {selectedTemplate.is_default && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                          <Star className="w-2.5 h-2.5" /> DEFAULT
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-white">{selectedTemplate.name}</h2>
                    {selectedTemplate.description && (
                      <p className="text-white/70 text-sm mt-1">{selectedTemplate.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <button
                        onClick={() => openEdit(selectedTemplate)}
                        title="Edit"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canCreate && (
                      <button
                        onClick={() => handleCopyTemplate(selectedTemplate)}
                        title="Copy Template"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setSelectedTemplate(null)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-6">
                {/* Config display */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                    Configuration Settings
                  </h3>

                  {/* Apply Period badge — shown when the template has a period set */}
                  {APPLY_TYPE_DOMAINS.has(activeDomain) && activeDomain !== 'attendance_policy' && selectedTemplate.config?.apply_type && (
                    <div className="flex items-center gap-2.5 mb-4 px-4 py-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50">
                      <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-indigo-700">Apply Period:</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${selectedTemplate.config.apply_type === 'monthly'
                          ? 'bg-blue-100 text-blue-700 border-blue-200'
                          : 'bg-violet-100 text-violet-700 border-violet-200'
                          }`}>
                          {selectedTemplate.config.apply_type === 'monthly' ? 'Monthly' : 'Yearly'}
                        </span>
                        {selectedTemplate.config.apply_type === 'monthly' && selectedTemplate.config.apply_month && (
                          <span className="text-sm font-semibold text-indigo-800">
                            {MONTH_NAMES[(selectedTemplate.config.apply_month || 1) - 1]} {selectedTemplate.config.apply_year || ''}
                          </span>
                        )}
                        {selectedTemplate.config.apply_type === 'yearly' && selectedTemplate.config.apply_year && (
                          <span className="text-sm font-semibold text-indigo-800">
                            Year {selectedTemplate.config.apply_year}
                            {selectedTemplate.config.financial_year_type && selectedTemplate.config.financial_year_type !== 'calendar' && (
                              <span className="text-indigo-400 text-xs font-normal ml-1.5">
                                · {FINANCIAL_YEAR_OPTIONS.find(o => o.value === selectedTemplate.config.financial_year_type)?.label}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {activeDomain === 'salary_structure' ? (
                    <SalaryStructureDetailView config={selectedTemplate.config || {}} />
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {domain.fields
                          .filter(f =>
                            f.section !== 'Gender-Aware Leave' &&
                            !(activeDomain === 'shift_management' && f.section === 'Break Configuration')
                          )
                          .map(field => {
                            const val = selectedTemplate.config?.[field.key];
                            if (val == null) return null;
                            if (field.condition && !field.condition(selectedTemplate.config)) return null;
                            const fmt = (field.format as any)(val);
                            return (
                              <div key={field.key} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                                <span className="text-sm text-slate-500">{field.label}</span>
                                {field.type === 'color' ? (
                                  <div className="flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full border border-slate-200 shadow-sm shrink-0" style={{ backgroundColor: val }} />
                                    <span className="text-sm font-semibold text-slate-800">{fmt}</span>
                                  </div>
                                ) : (
                                  <span className={`text-sm font-semibold ${fmt.includes('Yes') || fmt.includes('Enabled') || fmt.includes('Allowed') || fmt.includes('Eligible') ? 'text-emerald-700' :
                                    fmt.includes('No') || fmt.includes('Disabled') || fmt.includes('Not') || fmt.includes('Nil') || fmt.includes('None') ? 'text-slate-400' :
                                      'text-slate-800'
                                    }`}>{fmt}</span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                      {/* Gender-Aware Leave summary — leave_policy only */}
                      {activeDomain === 'leave_policy' && selectedTemplate.config && (
                        <LeavePolicyGenderSummary config={selectedTemplate.config} />
                      )}
                      {/* Break Time summary — shift_management only */}
                      {activeDomain === 'shift_management' && selectedTemplate.config && (
                        <BreakTimeConfigSummary config={selectedTemplate.config} />
                      )}
                    </>
                  )}
                </div>

                {/* Assignments — managed in Schedules module */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {getAssignmentCount(selectedTemplate.id) > 0
                          ? `Assigned to ${getAssignmentCount(selectedTemplate.id)} entit${getAssignmentCount(selectedTemplate.id) === 1 ? 'y' : 'ies'}`
                          : 'Not yet assigned — acts as global default'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Assignments are managed in the Schedules module</p>
                    </div>
                  </div>
                  {canAssign && (
                    <a
                      href="/dashboard/hr/schedules"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200 shrink-0"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      Go to Schedules
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Employee Preview Panel ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-violet-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Employee Policy Preview</h2>
                  <p className="text-xs text-slate-500">Resolved policy template per domain for any employee</p>
                </div>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-60 border-r border-slate-200 overflow-y-auto p-3 bg-slate-50 shrink-0">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2">Select Employee</p>
                {employees.length === 0 ? (
                  <p className="text-xs text-slate-400 px-2">Loading employees…</p>
                ) : employees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => handlePreview(emp)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all mb-1 ${previewEmployee?.id === emp.id ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-white text-slate-700'
                      }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {emp.first_name?.[0]}{emp.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{emp.first_name} {emp.last_name}</p>
                      <p className={`text-[10px] truncate ${previewEmployee?.id === emp.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {emp.designation_name || emp.employee_code}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {!previewEmployee ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Eye className="w-12 h-12 text-slate-200 mb-3" />
                    <p className="text-sm font-medium text-slate-500">Select an employee on the left</p>
                    <p className="text-xs text-slate-400 mt-1">Their resolved policies will appear here</p>
                  </div>
                ) : previewLoading ? (
                  <div className="space-y-4">
                    {POLICY_DOMAINS.map(d => <div key={d.key} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                        {previewEmployee.first_name?.[0]}{previewEmployee.last_name?.[0]}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{previewEmployee.first_name} {previewEmployee.last_name}</p>
                        <p className="text-xs text-slate-500">{previewEmployee.employee_code} · {previewEmployee.designation_name}</p>
                      </div>
                    </div>
                    {POLICY_DOMAINS.map(dom => {
                      const resolved = previewResults[dom.key];
                      const Icon = dom.icon;
                      return (
                        <div key={dom.key} className={`rounded-xl border overflow-hidden ${resolved ? dom.borderColor : 'border-slate-200'}`}>
                          <div className={`flex items-center justify-between px-4 py-3 ${resolved ? dom.lightBg : 'bg-slate-50'}`}>
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${resolved ? dom.textColor : 'text-slate-400'}`} />
                              <span className={`text-sm font-semibold ${resolved ? dom.textColor : 'text-slate-500'}`}>{dom.label}</span>
                            </div>
                            {resolved ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-700">{resolved.name}</span>
                                {resolved.is_default && <Badge text="DEFAULT" variant="amber" />}
                                <CheckCircle2 className={`w-4 h-4 ${dom.textColor}`} />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-slate-400 text-xs">
                                <AlertCircle className="w-3.5 h-3.5" /> No template — using system default
                              </div>
                            )}
                          </div>
                          {resolved && (
                            <div className="px-4 py-3 flex flex-wrap gap-2">
                              {dom.fields.slice(0, 5).map(field => {
                                const val = resolved.config?.[field.key];
                                if (val == null) return null;
                                if (field.condition && !field.condition(resolved.config)) return null;
                                return (
                                  <span key={field.key} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-700 shadow-sm">
                                    <span className="text-slate-400">{field.label}:</span>
                                    <span className="font-semibold">{(field.format as any)(val)}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden max-h-[92vh] flex flex-col ${activeDomain === 'salary_structure' ? 'max-w-4xl' : 'max-w-2xl'}`} onClick={e => e.stopPropagation()}>
            <div className={`bg-gradient-to-r ${domain.gradient} px-6 py-5 shrink-0`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">{domain.label}</p>
                  <h2 className="text-lg font-bold text-white">{isEditing ? 'Edit Template' : 'Create New Template'}</h2>
                </div>
                <button onClick={() => setShowCreate(false)} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 p-6 space-y-5">

                {/* Paste banner — only shown in create mode when something is copied */}
                {!isEditing && copiedTemplate && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Copy className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-indigo-700 truncate">Clipboard: {copiedTemplate.name}</p>
                        <p className="text-[10px] text-indigo-500">Paste to fill this form — you can edit everything after</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreateForm(f => ({
                        ...f,
                        description: f.description || copiedTemplate.description || '',
                        config: { ...(copiedTemplate.config || {}) },
                      }))}
                      className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Paste Config
                    </button>
                  </div>
                )}

                {/* Name & Description */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Template Name *</label>
                    <input
                      value={createForm.name}
                      onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={`e.g., Night Shift ${domain.label}`}
                      required
                      className="mt-1.5 w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</label>
                    <textarea
                      value={createForm.description}
                      onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                      rows={2}
                      placeholder="Briefly describe who this template applies to and why"
                      className="mt-1.5 w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>

                {/* Apply Type selector — only for the 5 policy domains */}
                {APPLY_TYPE_DOMAINS.has(activeDomain) && activeDomain !== 'attendance_policy' && (
                  <div>
                    <PeriodSelector config={createForm.config} onChange={handleConfigChange} />
                  </div>
                )}

                {/* ── Timing Rules — custom penalty cards (Attendance Policy only) ── */}
                {activeDomain === 'attendance_policy' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Timing Rules</label>
                      <span className="text-[10px] text-slate-400 ml-0.5">— late entry &amp; early exit penalties</span>
                    </div>
                    <div className="space-y-3">
                      <PenaltyConfigCard
                        type="late"
                        prefix="late_entry"
                        config={createForm.config}
                        onChange={handleConfigChange}
                      />
                      <PenaltyConfigCard
                        type="early_exit"
                        prefix="early_exit"
                        config={createForm.config}
                        onChange={handleConfigChange}
                      />
                    </div>
                  </div>
                )}

                {/* Sectioned config fields */}
                {activeDomain === 'leave_policy' ? (
                  <div className="space-y-4">
                    {/* Leave Quotas */}
                    <SectionedConfigForm
                      fields={domain.fields.filter(f => f.section === 'Leave Quotas')}
                      config={createForm.config}
                      onChange={handleConfigChange}
                    />

                    {/* Gender-Aware Leave cards */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Heart className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Gender-Aware Leave</span>
                        <span className="text-[10px] text-slate-400">— auto-assigned by employee gender</span>
                      </div>
                      <div className="space-y-3">
                        <LeavePolicyGenderCard type="maternity" config={createForm.config} onChange={handleConfigChange} />
                        <LeavePolicyGenderCard type="paternity" config={createForm.config} onChange={handleConfigChange} />
                      </div>
                    </div>

                    {/* Carry Forward */}
                    <SectionedConfigForm
                      fields={domain.fields.filter(f => f.section === 'Carry Forward')}
                      config={createForm.config}
                      onChange={handleConfigChange}
                    />

                    {/* Leave Encashment Card */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <IndianRupee className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Leave Encashment</span>
                        <span className="text-[10px] text-slate-400">— cash out unused leave balance</span>
                      </div>
                      <LeaveEncashmentCard config={createForm.config} onChange={handleConfigChange} />
                    </div>

                    {/* Notice, Certificates & Period config */}
                    <SectionedConfigForm
                      fields={domain.fields.filter(f =>
                        f.section !== 'Leave Quotas' &&
                        f.section !== 'Gender-Aware Leave' &&
                        f.section !== 'Carry Forward' &&
                        f.section !== 'Encashment'
                      )}
                      config={createForm.config}
                      onChange={handleConfigChange}
                    />
                  </div>
                ) : activeDomain === 'salary_structure' ? (
                  <SalaryStructureForm
                    config={createForm.config}
                    onChange={(updates) => setCreateForm(f => ({ ...f, config: { ...f.config, ...updates } }))}
                  />
                ) : activeDomain === 'overtime_policy' ? (
                  <div className="space-y-4">
                    <SectionedConfigForm
                      fields={domain.fields.filter(f =>
                        f.section === 'Overtime Settings' && f.key !== 'ot_rate_multiplier'
                      )}
                      config={createForm.config}
                      onChange={handleConfigChange}
                    />
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">OT Rate Multiplier</span>
                        <span className="text-[10px] text-slate-400">— pay premium per overtime hour</span>
                      </div>
                      <OtRateMultiplierCard config={createForm.config} onChange={handleConfigChange} />
                    </div>
                    <SectionedConfigForm
                      fields={domain.fields.filter(f => f.section !== 'Overtime Settings')}
                      config={createForm.config}
                      onChange={handleConfigChange}
                    />
                  </div>
                ) : activeDomain === 'shift_management' ? (
                  <div className="space-y-4">
                    <SectionedConfigForm
                      fields={domain.fields.filter(f =>
                        f.section === 'Basic Info' || f.section === 'Shift Timings'
                      )}
                      config={createForm.config}
                      onChange={handleConfigChange}
                    />
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Break Time</span>
                        <span className="text-[10px] text-slate-400">— schedule a rest break within this shift</span>
                      </div>
                      <BreakTimeConfigCard config={createForm.config} onChange={handleConfigChange} />
                    </div>
                    <SectionedConfigForm
                      fields={domain.fields.filter(f =>
                        f.section !== 'Basic Info' &&
                        f.section !== 'Shift Timings' &&
                        f.section !== 'Break Configuration'
                      )}
                      config={createForm.config}
                      onChange={handleConfigChange}
                    />
                  </div>
                ) : (
                  <SectionedConfigForm
                    fields={
                      activeDomain === 'attendance_policy'
                        ? domain.fields.filter(f =>
                          f.section !== 'Timing Rules' &&
                          f.section !== 'Late Entry Penalty' &&
                          f.section !== 'Early Exit Penalty'
                        )
                        : domain.fields
                    }
                    config={createForm.config}
                    onChange={handleConfigChange}
                  />
                )}
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={createLoading} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all shadow-lg bg-gradient-to-r ${domain.gradient} disabled:opacity-60`}>
                  {createLoading ? (isEditing ? 'Updating…' : 'Creating…') : (isEditing ? 'Save Changes' : 'Create Template')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-2xl text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {toast}
        </div>
      )}

      {/* Delete — dependency-aware warning */}
      {deleteTemplate && (
        <DeleteWarningModal
          entityType="template"
          entityLabel="Template"
          isLoading={depCheck.isLoading}
          report={depCheck.report}
          onCancel={() => { setDeleteTemplate(null); depCheck.clear(); }}
          onConfirmDelete={handleDelete}
          isDeleting={deleting}
        />
      )}

    </div>
  );
}
