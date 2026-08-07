import api from './api';

function compactPayload<T extends Record<string, any>>(payload: T): Partial<T> {
  return Object.entries(payload).reduce((acc, [key, value]) => {
    if (value === '' || value === undefined || value === null) return acc;
    if (Array.isArray(value)) {
      if (value.length) acc[key as keyof T] = value as T[keyof T];
      return acc;
    }
    if (typeof value === 'object') {
      const compacted = compactPayload(value);
      if (Object.keys(compacted).length) acc[key as keyof T] = compacted as T[keyof T];
      return acc;
    }
    acc[key as keyof T] = value;
    return acc;
  }, {} as Partial<T>);
}

export interface ShiftOverrideRequest {
  id: string;
  tenant_id: string;
  employee_id: string;
  request_date: string;
  start_date: string;
  end_date: string;
  current_shift_id: string | null;
  reason_category: string;
  detailed_reason: string;
  supporting_documents: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  preferred_action: string | null;
  remarks: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approval_step: number;
  approval_log: any[];
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  action_type: string | null;
  replacement_employee_id: string | null;
  target_shift_id: string | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
  custom_break_minutes: number | null;
  custom_grace_period_minutes: number | null;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  current_shift_name?: string;
}

export const shiftOverrideApi = {
  submit: (data: any): Promise<ShiftOverrideRequest> =>
    api.post('/shift-overrides', compactPayload(data)).then((r) => r.data.data),

  list: (params?: any): Promise<{ data: ShiftOverrideRequest[]; total: number; pages: number }> =>
    api.get('/shift-overrides', { params }).then((r) => r.data.data),

  listMe: (params?: any): Promise<{ data: ShiftOverrideRequest[]; total: number; pages: number }> =>
    api.get('/shift-overrides/me', { params }).then((r) => r.data.data),

  validateReplacement: (replacementId: string, startDate: string, endDate: string) =>
    api
      .get('/shift-overrides/validate-replacement', {
        params: { replacement_id: replacementId, start_date: startDate, end_date: endDate },
      })
      .then((r) => r.data.data),

  approve: (id: string, actionType: string, options: any) =>
    api.post(`/shift-overrides/${id}/approve`, compactPayload({ action_type: actionType, ...options })).then((r) => r.data.data),

  reject: (id: string, reason: string) =>
    api.post(`/shift-overrides/${id}/reject`, { reason }).then((r) => r.data.data),

  cancel: (id: string, reason?: string) =>
    api.post(`/shift-overrides/${id}/cancel`, { reason }).then((r) => r.data.data),

  statistics: () =>
    api.get('/shift-overrides/statistics').then((r) => r.data.data),
};
