import api from './api';

export interface JobDescription {
  id: string;
  tenant_id: string;
  vacancy_id: string | null;
  vacancy_title?: string | null;
  title: string;
  summary: string | null;
  responsibilities: string | null;
  kras: any[];
  kpis: any[];
  skills: any[];
  competencies: any[];
  benefits: any[];
  qualifications: string | null;
  certifications: string | null;
  work_location: string | null;
  is_template: boolean;
  template_name: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'archived';
  approval_status: string;
  rejection_reason: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface JobDescriptionVersion {
  id: string;
  job_description_id: string;
  version_number: number;
  snapshot: Record<string, any>;
  change_note: string | null;
  created_by_email?: string | null;
  created_at: string;
}

export interface JobPosting {
  id: string;
  tenant_id: string;
  vacancy_id: string | null;
  job_description_id: string | null;
  title: string;
  status: string;
  openings: number;
  salary_min: number | null;
  salary_max: number | null;
  closes_at: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  visibility: 'public' | 'unlisted';
  provider: string;
  share_token: string | null;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const jobDescriptionsApi = {
  list: (filters: { q?: string; status?: string; vacancy_id?: string; is_template?: boolean; page?: number; limit?: number } = {}): Promise<{ data: JobDescription[]; total: number }> =>
    api.get(`/recruitment/job-descriptions${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<JobDescription> => api.get(`/recruitment/job-descriptions/${id}`).then((r) => r.data.data),
  create: (data: Partial<JobDescription>) => api.post('/recruitment/job-descriptions', data).then((r) => r.data.data),
  update: (id: string, data: Partial<JobDescription> & { change_note?: string }) => api.put(`/recruitment/job-descriptions/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/job-descriptions/${id}`).then((r) => r.data.data),
  duplicate: (id: string) => api.post(`/recruitment/job-descriptions/${id}/duplicate`).then((r) => r.data.data),
  archive: (id: string) => api.post(`/recruitment/job-descriptions/${id}/archive`).then((r) => r.data.data),
  submit: (id: string) => api.post(`/recruitment/job-descriptions/${id}/submit`).then((r) => r.data.data),
  approve: (id: string, reason: string, remarks?: string) => api.post(`/recruitment/job-descriptions/${id}/approve`, { reason, remarks }).then((r) => r.data.data),
  reject: (id: string, reason: string) => api.post(`/recruitment/job-descriptions/${id}/reject`, { reason }).then((r) => r.data.data),
  listVersions: (id: string): Promise<JobDescriptionVersion[]> => api.get(`/recruitment/job-descriptions/${id}/versions`).then((r) => r.data.data),
  restoreVersion: (id: string, versionNumber: number) => api.post(`/recruitment/job-descriptions/${id}/versions/${versionNumber}/restore`).then((r) => r.data.data),
};

export const jobPostingsApi = {
  list: (filters: { status?: string; vacancy_id?: string; job_description_id?: string } = {}): Promise<JobPosting[]> => api.get(`/recruitment/jobs${qs(filters)}`).then((r) => r.data.data),
  publish: (vacancyId: string, jobDescriptionId: string, opts: { provider?: string; visibility?: string; closes_at?: string } = {}) =>
    api.post('/recruitment/jobs/publish', { vacancy_id: vacancyId, job_description_id: jobDescriptionId, ...opts }).then((r) => r.data.data),
  unpublish: (id: string) => api.post(`/recruitment/jobs/${id}/unpublish`).then((r) => r.data.data),
  republish: (id: string) => api.post(`/recruitment/jobs/${id}/republish`).then((r) => r.data.data),
  share: (id: string): Promise<{ url: string; qrCodeDataUrl: string }> => api.get(`/recruitment/jobs/${id}/share`).then((r) => r.data.data),
};
