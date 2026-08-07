import api from './api';

export interface PublicOrganization {
  id: string;
  name: string;
  logo_url: string | null;
}

export interface PublicJobSummary {
  id: string;
  title: string;
  openings: number;
  salary_min: number | null;
  salary_max: number | null;
  closes_at: string | null;
  published_at: string | null;
  department_name: string | null;
  summary: string | null;
  work_location: string | null;
  employment_type_name: string | null;
}

export interface PublicJobDetail extends PublicJobSummary {
  responsibilities: string | null;
  kras: any[];
  kpis: any[];
  skills: any[];
  competencies: any[];
  benefits: any[];
  qualifications: string | null;
  certifications: string | null;
}

export interface ApplyPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  current_company?: string;
  current_designation?: string;
  experience_years?: string;
  expected_salary?: string;
  cover_note?: string;
  resume?: File;
}

export const careerPortalApi = {
  listJobs: (slug: string, params: { q?: string } = {}): Promise<{ organization: PublicOrganization; jobs: PublicJobSummary[] }> =>
    api.get(`/public/career/${slug}/jobs`, { params }).then((r) => r.data.data),

  getJob: (slug: string, jobId: string): Promise<{ organization: PublicOrganization; job: PublicJobDetail }> =>
    api.get(`/public/career/${slug}/jobs/${jobId}`).then((r) => r.data.data),

  apply: (slug: string, jobId: string, payload: ApplyPayload): Promise<{ applicationId: string; candidateId: string }> => {
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => { if (v !== undefined) form.append(k, v as any); });
    return api.post(`/public/career/${slug}/jobs/${jobId}/apply`, form).then((r) => r.data.data);
  },

  getApplicationStatus: (slug: string, applicationId: string, email: string) =>
    api.get(`/public/career/${slug}/applications/${applicationId}`, { params: { email } }).then((r) => r.data.data),

  getOffer: (slug: string, offerId: string, email: string) =>
    api.get(`/public/career/${slug}/offers/${offerId}`, { params: { email } }).then((r) => r.data.data),

  acceptOffer: (slug: string, offerId: string, email: string) =>
    api.post(`/public/career/${slug}/offers/${offerId}/accept`, { email }).then((r) => r.data.data),

  declineOffer: (slug: string, offerId: string, email: string, reason?: string) =>
    api.post(`/public/career/${slug}/offers/${offerId}/decline`, { email, reason }).then((r) => r.data.data),

  negotiateOffer: (slug: string, offerId: string, email: string, data: { note: string; proposed_ctc?: number; proposed_joining_date?: string }) =>
    api.post(`/public/career/${slug}/offers/${offerId}/negotiate`, { email, ...data }).then((r) => r.data.data),

  // ── Preboarding (email-matched, no login) ─────────────────────────────
  getPreboarding: (slug: string, applicationId: string, email: string) =>
    api.get(`/public/career/${slug}/applications/${applicationId}/preboarding`, { params: { email } }).then((r) => r.data.data),

  submitBankDetails: (slug: string, applicationId: string, email: string, data: { bank_name?: string; bank_account_number?: string; ifsc_code?: string; account_type?: string; upi_id?: string }) =>
    api.post(`/public/career/${slug}/applications/${applicationId}/preboarding/bank-details`, { email, ...data }).then((r) => r.data.data),

  submitEmergencyContact: (slug: string, applicationId: string, email: string, data: { name: string; relationship?: string; phone: string; address?: string }) =>
    api.post(`/public/career/${slug}/applications/${applicationId}/preboarding/emergency-contact`, { email, ...data }).then((r) => r.data.data),

  acceptNda: (slug: string, applicationId: string, email: string) =>
    api.post(`/public/career/${slug}/applications/${applicationId}/preboarding/accept-nda`, { email }).then((r) => r.data.data),

  uploadPreboardingDocument: (slug: string, applicationId: string, email: string, file: File) => {
    const form = new FormData();
    form.append('email', email);
    form.append('file', file);
    return api.post(`/public/career/${slug}/applications/${applicationId}/preboarding/documents`, form).then((r) => r.data.data);
  },
};
