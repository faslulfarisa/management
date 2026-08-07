import api from './api';

export type OfferStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'sent' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export interface SalaryComponent { name: string; amount: number; frequency?: string }

export interface Offer {
  id: string;
  tenant_id: string;
  application_id: string;
  vacancy_id: string | null;
  designation: string | null;
  employment_type_id: string | null;
  employment_type_name?: string | null;
  joining_date: string | null;
  currency: string;
  ctc: number | null;
  salary_components: SalaryComponent[];
  benefits: string[];
  offer_letter_content: string | null;
  status: OfferStatus;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_reason: string | null;
  rejection_reason: string | null;
  approval_step: number;
  approval_log: any[];
  current_version: number;
  sent_at: string | null;
  expires_at: string | null;
  responded_at: string | null;
  decline_reason: string | null;
  withdrawn_at: string | null;
  created_by_email?: string | null;
  first_name?: string;
  last_name?: string;
  candidate_email?: string;
  candidate_id?: string;
  job_title?: string;
  vacancy_title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferVersion {
  id: string;
  offer_id: string;
  version_number: number;
  snapshot: Record<string, any>;
  change_note: string | null;
  created_by_email?: string | null;
  created_at: string;
}

export interface OfferNegotiation {
  id: string;
  offer_id: string;
  raised_by: 'candidate' | 'recruiter';
  note: string;
  proposed_ctc: number | null;
  proposed_joining_date: string | null;
  created_by_email?: string | null;
  created_at: string;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const offersApi = {
  list: (filters: { q?: string; application_id?: string; status?: string; page?: number; limit?: number } = {}): Promise<{ data: Offer[]; total: number }> =>
    api.get(`/recruitment/offers${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<Offer> => api.get(`/recruitment/offers/${id}`).then((r) => r.data.data),
  create: (data: Partial<Offer> & { application_id: string }) => api.post('/recruitment/offers', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Offer> & { change_note?: string }) => api.put(`/recruitment/offers/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/offers/${id}`).then((r) => r.data.data),
  submit: (id: string) => api.post(`/recruitment/offers/${id}/submit`).then((r) => r.data.data),
  approve: (id: string, reason: string, remarks?: string) => api.post(`/recruitment/offers/${id}/approve`, { reason, remarks }).then((r) => r.data.data),
  reject: (id: string, reason: string) => api.post(`/recruitment/offers/${id}/reject`, { reason }).then((r) => r.data.data),
  send: (id: string, expiresAt?: string) => api.post(`/recruitment/offers/${id}/send`, { expires_at: expiresAt }).then((r) => r.data.data),
  withdraw: (id: string, reason?: string) => api.post(`/recruitment/offers/${id}/withdraw`, { reason }).then((r) => r.data.data),
  listVersions: (id: string): Promise<OfferVersion[]> => api.get(`/recruitment/offers/${id}/versions`).then((r) => r.data.data),
  restoreVersion: (id: string, versionNumber: number) => api.post(`/recruitment/offers/${id}/versions/${versionNumber}/restore`).then((r) => r.data.data),
  negotiations: {
    list: (id: string): Promise<OfferNegotiation[]> => api.get(`/recruitment/offers/${id}/negotiations`).then((r) => r.data.data),
    add: (id: string, data: { note: string; proposed_ctc?: number; proposed_joining_date?: string }) =>
      api.post(`/recruitment/offers/${id}/negotiations`, data).then((r) => r.data.data),
  },
};
