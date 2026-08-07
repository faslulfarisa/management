import api from './api';

export type InterviewStatus = 'scheduled' | 'rescheduled' | 'completed' | 'cancelled' | 'no_show';

export interface ScorecardEntry {
  panelist_id: string;
  rating: number;
  recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no' | null;
  comments: string | null;
  submitted_at: string;
}

export interface Interview {
  id: string;
  tenant_id: string;
  candidate_id: string;
  job_posting_id: string | null;
  application_id: string | null;
  vacancy_id: string | null;
  interviewer_id: string | null;
  interview_type: 'phone' | 'video' | 'in_person';
  round_type: 'technical' | 'hr' | 'managerial' | 'final' | 'other';
  round_number: number;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_link: string | null;
  status: InterviewStatus;
  feedback: string | null;
  rating: number | null;
  recommendation: string | null;
  panel_member_ids: string[];
  scorecard: ScorecardEntry[];
  cancelled_at: string | null;
  cancellation_reason: string | null;
  rescheduled_from_id: string | null;
  first_name?: string;
  last_name?: string;
  candidate_email?: string;
  vacancy_title?: string;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const interviewsApi = {
  list: (filters: { q?: string; application_id?: string; candidate_id?: string; status?: string; page?: number; limit?: number } = {}): Promise<{ data: Interview[]; total: number }> =>
    api.get(`/recruitment/interviews${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<Interview> => api.get(`/recruitment/interviews/${id}`).then((r) => r.data.data),
  schedule: (data: {
    application_id: string; round_type?: string; round_number?: number; interview_type?: string;
    scheduled_at: string; duration_minutes?: number; location?: string; meeting_link?: string; panel_member_ids?: string[];
  }) => api.post('/recruitment/interviews', data).then((r) => r.data.data),
  reschedule: (id: string, scheduledAt: string, reason?: string) =>
    api.post(`/recruitment/interviews/${id}/reschedule`, { scheduled_at: scheduledAt, reason }).then((r) => r.data.data),
  cancel: (id: string, reason?: string) => api.post(`/recruitment/interviews/${id}/cancel`, { reason }).then((r) => r.data.data),
  submitFeedback: (id: string, rating: number, recommendation?: string, comments?: string) =>
    api.post(`/recruitment/interviews/${id}/feedback`, { rating, recommendation, comments }).then((r) => r.data.data),
  complete: (id: string, data: { feedback?: string; rating?: number; recommendation?: string }) =>
    api.post(`/recruitment/interviews/${id}/complete`, data).then((r) => r.data.data),
  markNoShow: (id: string) => api.post(`/recruitment/interviews/${id}/no-show`).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/interviews/${id}`).then((r) => r.data.data),
};
