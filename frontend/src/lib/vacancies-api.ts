import api from './api';

export type VacancyStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'open' | 'on_hold'
  | 'closed' | 'reopened' | 'archived' | 'cancelled';

export interface Vacancy {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  department_id: string | null;
  position_id: string | null;
  title: string;
  hiring_manager_id: string | null;
  recruiter_id: string | null;
  reporting_manager_id: string | null;
  employment_type_id: string | null;
  experience_min_years: number | null;
  experience_max_years: number | null;
  qualification: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  number_of_positions: number;
  target_start_date: string | null;
  target_close_date: string | null;
  description: string | null;
  justification: string | null;
  status: VacancyStatus;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_reason: string | null;
  rejection_reason: string | null;
  approval_step: number;
  approval_log: any[];
  close_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined display fields
  branch_name?: string | null;
  department_name?: string | null;
  position_name?: string | null;
  employment_type_name?: string | null;
  hiring_manager_first_name?: string | null;
  hiring_manager_last_name?: string | null;
  recruiter_first_name?: string | null;
  recruiter_last_name?: string | null;
  reporting_manager_first_name?: string | null;
  reporting_manager_last_name?: string | null;
  created_by_email?: string | null;
}

export interface VacancyStatusHistoryEntry {
  id: string;
  vacancy_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  actor_email?: string | null;
  reason: string | null;
  created_at: string;
}

export interface VacancyComment {
  id: string;
  vacancy_id: string;
  author_id: string;
  author_email?: string | null;
  comment: string;
  created_at: string;
}

export interface VacancyAttachment {
  id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  name: string;
  file_url: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface VacancyFilters {
  q?: string;
  status?: string;
  branch_id?: string;
  department_id?: string;
  employment_type_id?: string;
  recruiter_id?: string;
  hiring_manager_id?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const vacanciesApi = {
  list: (filters: VacancyFilters = {}): Promise<{ data: Vacancy[]; total: number }> =>
    api.get(`/recruitment/vacancies${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<Vacancy> => api.get(`/recruitment/vacancies/${id}`).then((r) => r.data.data),
  create: (data: Partial<Vacancy>) => api.post('/recruitment/vacancies', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Vacancy>) => api.put(`/recruitment/vacancies/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/vacancies/${id}`).then((r) => r.data.data),
  submit: (id: string) => api.post(`/recruitment/vacancies/${id}/submit`).then((r) => r.data.data),
  approve: (id: string, reason: string, remarks?: string) =>
    api.post(`/recruitment/vacancies/${id}/approve`, { reason, remarks }).then((r) => r.data.data),
  reject: (id: string, reason: string) => api.post(`/recruitment/vacancies/${id}/reject`, { reason }).then((r) => r.data.data),
  close: (id: string, reason?: string) => api.post(`/recruitment/vacancies/${id}/close`, { reason }).then((r) => r.data.data),
  reopen: (id: string, reason?: string) => api.post(`/recruitment/vacancies/${id}/reopen`, { reason }).then((r) => r.data.data),
  archive: (id: string, reason?: string) => api.post(`/recruitment/vacancies/${id}/archive`, { reason }).then((r) => r.data.data),
  history: (id: string): Promise<VacancyStatusHistoryEntry[]> =>
    api.get(`/recruitment/vacancies/${id}/history`).then((r) => r.data.data),
  comments: {
    list: (id: string): Promise<VacancyComment[]> => api.get(`/recruitment/vacancies/${id}/comments`).then((r) => r.data.data),
    add: (id: string, comment: string) => api.post(`/recruitment/vacancies/${id}/comments`, { comment }).then((r) => r.data.data),
    remove: (commentId: string) => api.delete(`/recruitment/vacancies/comments/${commentId}`).then((r) => r.data.data),
  },
  attachments: {
    list: (id: string): Promise<VacancyAttachment[]> => api.get(`/recruitment/vacancies/${id}/attachments`).then((r) => r.data.data),
    upload: (file: File): Promise<{ url: string; fileName: string; sizeBytes: number; mimeType: string }> => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/recruitment/vacancies/upload-file', formData).then((r) => r.data.data);
    },
    attach: (id: string, meta: { name: string; file_url: string; file_size_bytes?: number; mime_type?: string; document_type?: string }) =>
      api.post(`/recruitment/vacancies/${id}/attachments`, meta).then((r) => r.data.data),
    download: (docId: string): Promise<{ url: string }> =>
      api.get(`/recruitment/vacancies/attachments/${docId}/download`).then((r) => r.data.data),
    remove: (docId: string) => api.delete(`/recruitment/vacancies/attachments/${docId}`).then((r) => r.data.data),
  },
};

export function vacancyFullName(prefix: 'hiring_manager' | 'recruiter' | 'reporting_manager', v: Vacancy): string | null {
  const first = (v as any)[`${prefix}_first_name`];
  const last = (v as any)[`${prefix}_last_name`];
  if (!first && !last) return null;
  return [first, last].filter(Boolean).join(' ');
}
