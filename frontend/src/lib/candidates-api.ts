import api from './api';

export interface Candidate {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  current_company: string | null;
  current_designation: string | null;
  experience_years: number | null;
  expected_salary: number | null;
  source: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: Record<string, any>;
  education: Array<{ degree?: string; institution?: string; year?: string }>;
  experience: Array<{ company?: string; title?: string; from?: string; to?: string; description?: string }>;
  skills: string[];
  certifications: string[];
  tags: string[];
  notes: string | null;
  application_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  tenant_id: string;
  candidate_id: string;
  job_posting_id: string;
  vacancy_id: string | null;
  source: string;
  status: 'applied' | 'under_review' | 'shortlisted' | 'rejected' | 'withdrawn' | 'hired';
  resume_document_id: string | null;
  cover_note: string | null;
  rejection_reason: string | null;
  current_stage_id: string | null;
  stage_name?: string | null;
  stage_category?: string | null;
  applied_at: string;
  first_name?: string;
  last_name?: string;
  candidate_email?: string;
  candidate_phone?: string;
  job_title?: string;
  converted_employee_id?: string | null;
  converted_at?: string | null;
}

export interface PipelineStageHistoryEntry {
  id: string;
  application_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  from_stage_name?: string | null;
  to_stage_name?: string | null;
  actor_id: string | null;
  actor_email?: string | null;
  comment: string | null;
  created_at: string;
}

export interface CandidateScreening {
  id: string;
  application_id: string;
  current_salary: number | null;
  expected_salary: number | null;
  notice_period_days: number | null;
  availability_date: string | null;
  communication_rating: number | null;
  recommendation: 'proceed' | 'hold' | 'reject' | null;
  notes: string | null;
  screened_by: string | null;
  screened_by_email?: string | null;
  screened_at: string | null;
}

export interface CandidateAssessment {
  id: string;
  application_id: string;
  assessment_type: 'technical' | 'coding' | 'assignment' | 'case_study' | 'language_test' | 'other';
  title: string;
  instructions: string | null;
  assigned_by: string | null;
  assigned_by_email?: string | null;
  assigned_at: string;
  due_at: string | null;
  status: 'assigned' | 'in_progress' | 'submitted' | 'evaluated' | 'cancelled';
  score: number | null;
  max_score: number;
  result: 'pass' | 'fail' | null;
  evaluator_id: string | null;
  evaluator_email?: string | null;
  evaluated_at: string | null;
  evaluation_notes: string | null;
}

export interface CandidateEvaluation {
  id: string;
  application_id: string;
  interview_id: string | null;
  evaluation_type: 'technical' | 'hr' | 'behavioural' | 'communication' | 'leadership' | 'culture_fit' | 'other';
  reviewer_id: string;
  reviewer_email?: string | null;
  reviewer_first_name?: string | null;
  reviewer_last_name?: string | null;
  ratings: { criteria: string; score: number; max_score?: number; comment?: string }[];
  overall_rating: number | null;
  strengths: string | null;
  concerns: string | null;
  recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';
  created_at: string;
}

export type VerificationType = 'reference' | 'employment' | 'education' | 'identity' | 'address' | 'background';

export interface CandidateVerification {
  id: string;
  application_id: string;
  verification_type: VerificationType;
  status: 'pending' | 'in_progress' | 'verified' | 'failed' | 'not_applicable';
  details: Record<string, any>;
  comments: string | null;
  reviewer_id: string | null;
  reviewer_email?: string | null;
  reviewed_at: string | null;
}

export interface CandidateCommunication {
  id: string;
  candidate_id: string;
  application_id: string | null;
  template_id: string | null;
  channel: 'email' | 'sms' | 'whatsapp' | 'phone_note' | 'internal_note';
  subject: string;
  body: string;
  status: 'sent' | 'failed' | 'logged';
  error_message: string | null;
  sent_by: string | null;
  sent_by_email?: string | null;
  sent_at: string;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const candidatesApi = {
  list: (filters: { q?: string; tag?: string; source?: string; page?: number; limit?: number } = {}): Promise<{ data: Candidate[]; total: number }> =>
    api.get(`/recruitment/candidates${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<Candidate> => api.get(`/recruitment/candidates/${id}`).then((r) => r.data.data),
  create: (data: Partial<Candidate> & { job_posting_id?: string; vacancy_id?: string }) => api.post('/recruitment/candidates', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Candidate>) => api.put(`/recruitment/candidates/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/candidates/${id}`).then((r) => r.data.data),
  applications: (id: string): Promise<{ data: Application[]; total: number }> =>
    api.get(`/recruitment/candidates/${id}/applications`).then((r) => ({ data: r.data.data, total: r.data.total })),
  resumes: {
    list: (id: string) => api.get(`/recruitment/candidates/${id}/resumes`).then((r) => r.data.data),
    upload: (id: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/recruitment/candidates/${id}/resumes`, form).then((r) => r.data.data);
    },
    download: (docId: string): Promise<{ url: string }> => api.get(`/recruitment/candidates/resumes/${docId}/download`).then((r) => r.data.data),
    remove: (docId: string) => api.delete(`/recruitment/candidates/resumes/${docId}`).then((r) => r.data.data),
  },
};

export const applicationsApi = {
  list: (filters: { q?: string; candidate_id?: string; job_posting_id?: string; vacancy_id?: string; status?: string; stage_id?: string; page?: number; limit?: number } = {}): Promise<{ data: Application[]; total: number }> =>
    api.get(`/recruitment/applications${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<Application> => api.get(`/recruitment/applications/${id}`).then((r) => r.data.data),
  updateStatus: (id: string, status: Application['status'], rejectionReason?: string) =>
    api.post(`/recruitment/applications/${id}/status`, { status, rejection_reason: rejectionReason }).then((r) => r.data.data),

  moveStage: (id: string, toStageId: string, comment?: string) =>
    api.post(`/recruitment/applications/${id}/stage`, { to_stage_id: toStageId, comment }).then((r) => r.data.data),
  stageHistory: (id: string): Promise<PipelineStageHistoryEntry[]> =>
    api.get(`/recruitment/applications/${id}/stage-history`).then((r) => r.data.data),

  screening: {
    get: (id: string): Promise<CandidateScreening | null> => api.get(`/recruitment/applications/${id}/screening`).then((r) => r.data.data),
    upsert: (id: string, data: Partial<CandidateScreening>) => api.put(`/recruitment/applications/${id}/screening`, data).then((r) => r.data.data),
  },
  verifications: {
    list: (id: string): Promise<CandidateVerification[]> => api.get(`/recruitment/applications/${id}/verifications`).then((r) => r.data.data),
    upsert: (id: string, data: { verification_type: VerificationType; status?: string; details?: Record<string, any>; comments?: string }) =>
      api.put(`/recruitment/applications/${id}/verifications`, data).then((r) => r.data.data),
  },
  assessments: {
    list: (id: string): Promise<CandidateAssessment[]> => api.get(`/recruitment/applications/${id}/assessments`).then((r) => r.data.data),
    create: (id: string, data: Partial<CandidateAssessment>) => api.post(`/recruitment/applications/${id}/assessments`, data).then((r) => r.data.data),
    update: (assessmentId: string, data: Partial<CandidateAssessment>) => api.put(`/recruitment/applications/assessments/${assessmentId}`, data).then((r) => r.data.data),
  },
  evaluations: {
    list: (id: string): Promise<CandidateEvaluation[]> => api.get(`/recruitment/applications/${id}/evaluations`).then((r) => r.data.data),
    create: (id: string, data: Partial<CandidateEvaluation>) => api.post(`/recruitment/applications/${id}/evaluations`, data).then((r) => r.data.data),
  },
  communications: {
    list: (id: string): Promise<CandidateCommunication[]> => api.get(`/recruitment/applications/${id}/communications`).then((r) => r.data.data),
    send: (id: string, data: { channel?: CandidateCommunication['channel']; template_id?: string; subject?: string; body?: string }) =>
      api.post(`/recruitment/applications/${id}/communications`, data).then((r) => r.data.data),
  },
};
