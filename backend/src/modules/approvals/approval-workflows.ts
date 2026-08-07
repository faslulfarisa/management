export type ApprovalWorkflowStatus = 'implemented' | 'unavailable' | 'deprecated';

export interface ApprovalWorkflowDefinition {
  value: string;
  label: string;
  status: ApprovalWorkflowStatus;
  entityTable?: string;
}

export const APPROVAL_WORKFLOWS: ApprovalWorkflowDefinition[] = [
  { value: 'leave', label: 'Leave Requests', status: 'implemented', entityTable: 'leave_requests' },
  { value: 'leave_encashment', label: 'Leave Encashment', status: 'implemented', entityTable: 'leave_encashment_requests' },
  { value: 'expense', label: 'Expense Claims', status: 'implemented', entityTable: 'expenses' },
  { value: 'reimbursement', label: 'Reimbursements', status: 'implemented', entityTable: 'reimbursements' },
  { value: 'transfer', label: 'Branch Transfers', status: 'implemented', entityTable: 'employee_branch_transfers' },
  { value: 'payroll', label: 'Payroll Runs', status: 'implemented', entityTable: 'payroll_runs' },
  { value: 'attendance_correction', label: 'Attendance Corrections', status: 'implemented', entityTable: 'attendance_corrections' },
  { value: 'overtime', label: 'Overtime', status: 'implemented', entityTable: 'overtime_requests' },
  { value: 'shift_override', label: 'Shift Changes', status: 'implemented', entityTable: 'shift_override_requests' },
  { value: 'biometric_device', label: 'Biometric Device', status: 'implemented', entityTable: 'biometric_devices' },
  { value: 'exit_request', label: 'Exit Requests', status: 'implemented', entityTable: 'exit_requests' },
  { value: 'ff_settlement', label: 'F&F Settlement', status: 'implemented', entityTable: 'final_settlements' },
  { value: 'compliance_document', label: 'Compliance Documents', status: 'implemented', entityTable: 'compliance_documents' },
  { value: 'vacancy_request', label: 'Vacancy Requests', status: 'implemented', entityTable: 'vacancies' },
  { value: 'job_description', label: 'Job Descriptions', status: 'implemented', entityTable: 'job_descriptions' },
  { value: 'offer', label: 'Offers', status: 'implemented', entityTable: 'offers' },
  { value: 'probation_confirmation', label: 'Probation Confirmation', status: 'implemented', entityTable: 'probation_reviews' },
  { value: 'workforce_plan', label: 'Workforce Plans', status: 'implemented', entityTable: 'workforce_plans' },
  { value: 'fine_deduction', label: 'Fine & Deduction', status: 'implemented', entityTable: 'employee_fines' },
  { value: 'fine_appeal', label: 'Fine Appeals', status: 'implemented', entityTable: 'employee_fine_appeals' },
  { value: 'payroll_payment', label: 'Payroll Payments', status: 'unavailable' },
  { value: 'manual_attendance', label: 'Manual Attendance', status: 'unavailable' },
  { value: 'onboarding', label: 'Onboarding', status: 'unavailable' },
  { value: 'exit_clearance', label: 'Exit Clearance', status: 'unavailable' },
  { value: 'salary_revision', label: 'Salary Revision', status: 'unavailable' },
  { value: 'role_change', label: 'Role Changes', status: 'unavailable' },
  { value: 'policy_change', label: 'Policy Changes', status: 'unavailable' },
  { value: 'vendor_approval', label: 'Vendor Approvals', status: 'unavailable' },
  { value: 'shift_change', label: 'Shift Changes', status: 'deprecated' },
];

export const IMPLEMENTED_APPROVAL_WORKFLOW_TYPES = APPROVAL_WORKFLOWS
  .filter((workflow) => workflow.status === 'implemented')
  .map((workflow) => workflow.value);

export function getApprovalWorkflow(value: string): ApprovalWorkflowDefinition | undefined {
  return APPROVAL_WORKFLOWS.find((workflow) => workflow.value === value);
}

export function isImplementedApprovalWorkflow(value: string): boolean {
  return getApprovalWorkflow(value)?.status === 'implemented';
}
