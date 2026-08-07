import api from '@/lib/api';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'critical' | 'approval' | 'system';
export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';

export interface NotificationItem {
  id: string;
  tenant_id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  source_module: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  branch_id: string | null;
  branch_name?: string | null;
  department_id: string | null;
  department_name?: string | null;
  status: 'active' | 'archived';
  is_read: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface NotificationListFilters {
  page?: number;
  limit?: number;
  type?: string;
  priority?: string;
  source_module?: string;
  branch_id?: string;
  department_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface NotificationOverview {
  pending_approvals: number;
  unread_notifications: number;
  critical_alerts: number;
  todays_activities: number;
  attendance_exceptions: number;
  payroll_alerts: number;
  employee_lifecycle_events: number;
}

export interface AttendanceAlertsData {
  late_arrivals: any[];
  missing_punches: any[];
  absent: any[];
  early_exits: any[];
  break_violations: any[];
  biometric_sync_failures: any[];
}

export interface PayrollAlertsData {
  missing_bank_details: any[];
  pending_payslip_generation: any[];
  payroll_approval_pending: any[];
  fine_deduction_changes: any[];
  salary_structure_issues: any[];
  failed_payroll_processing: any[];
}

export interface EmployeeEventsData {
  new_joiners: any[];
  probation_ending: any[];
  confirmed: any[];
  resignations: any[];
  retired: any[];
  status_changes: any[];
  transfers: any[];
}

export interface DocumentsComplianceData {
  expiring_documents: any[];
  missing_documents: any[];
  contract_expiry: any[];
  passport_expiry: any[];
  visa_expiry: any[];
  certification_expiry: any[];
}

export interface SystemAlertsData {
  biometric_devices_offline: any[];
  sync_failures: any[];
  branch_activation_restrictions: any[];
  integration_errors: any[];
  email_failures: any[];
  sms_failures: any[];
  queue_failures: any[];
  payroll_processing_errors: any[];
}

export interface NotificationPreference {
  tenant_id?: string;
  user_id?: string;
  module: string;
  in_app: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export const NOTIFICATION_TYPES: NotificationType[] = ['info', 'success', 'warning', 'error', 'critical', 'approval', 'system'];
export const NOTIFICATION_PRIORITIES: NotificationPriority[] = ['critical', 'high', 'medium', 'low'];
export const NOTIFICATION_SOURCE_MODULES = ['attendance', 'payroll', 'leave', 'approvals', 'documents', 'employee_events', 'system'];

export const notificationsApi = {
  list: (filters?: NotificationListFilters): Promise<{ data: NotificationItem[]; total: number; page: number; limit: number }> =>
    api.get('/notifications', { params: filters }).then((r) => r.data.data),

  getOverview: (): Promise<NotificationOverview> =>
    api.get('/notifications/overview').then((r) => r.data.data),

  getActionRequired: (filters?: { page?: number; limit?: number; workflow_type?: string; branch_id?: string; priority?: string }): Promise<{ data: any[]; total: number }> =>
    api.get('/notifications/action-required', { params: filters }).then((r) => r.data.data),

  getAttendanceAlerts: (filters?: { branch_id?: string; department_id?: string; employee_id?: string }): Promise<{ data: AttendanceAlertsData; total: number }> =>
    api.get('/notifications/attendance-alerts', { params: filters }).then((r) => r.data.data),

  getPayrollAlerts: (filters?: { branch_id?: string }): Promise<{ data: PayrollAlertsData; total: number }> =>
    api.get('/notifications/payroll-alerts', { params: filters }).then((r) => r.data.data),

  getEmployeeEvents: (filters?: { branch_id?: string }): Promise<{ data: EmployeeEventsData; total: number }> =>
    api.get('/notifications/employee-events', { params: filters }).then((r) => r.data.data),

  getDocumentsCompliance: (filters?: { branch_id?: string }): Promise<{ data: DocumentsComplianceData; total: number }> =>
    api.get('/notifications/documents-compliance', { params: filters }).then((r) => r.data.data),

  getSystemAlerts: (filters?: { branch_id?: string }): Promise<{ data: SystemAlertsData; total: number }> =>
    api.get('/notifications/system-alerts', { params: filters }).then((r) => r.data.data),

  getUnreadCount: (): Promise<{ count: number }> =>
    api.get('/notifications/unread-count').then((r) => r.data.data),

  getPreferences: (): Promise<NotificationPreference[]> =>
    api.get('/notifications/preferences').then((r) => r.data.data),

  updatePreferences: (module: string, channels: Partial<Pick<NotificationPreference, 'in_app' | 'email' | 'sms' | 'whatsapp'>>): Promise<NotificationPreference> =>
    api.put(`/notifications/preferences/${module}`, channels).then((r) => r.data.data),

  markRead: (id: string): Promise<NotificationItem> =>
    api.post(`/notifications/${id}/read`).then((r) => r.data.data),

  markUnread: (id: string): Promise<NotificationItem> =>
    api.post(`/notifications/${id}/unread`).then((r) => r.data.data),

  archive: (id: string): Promise<NotificationItem> =>
    api.post(`/notifications/${id}/archive`).then((r) => r.data.data),

  markAllRead: (): Promise<void> =>
    api.post('/notifications/read-all').then(() => undefined),
};
