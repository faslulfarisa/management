import api from './api';

export interface PreboardingItem {
  key: string;
  label: string;
  category: string;
  status: 'pending' | 'completed' | 'not_applicable';
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
}

export interface BankDetails {
  bank_name?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  account_type?: string;
  upi_id?: string;
}

export interface EmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
  address?: string;
}

export interface PreboardingChecklist {
  id: string;
  application_id: string;
  offer_id: string | null;
  items: PreboardingItem[];
  bank_details: BankDetails;
  emergency_contact: EmergencyContact;
  nda_accepted_at: string | null;
  nda_accepted_ip: string | null;
  joining_date: string | null;
  status: 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ConversionPreview {
  already_converted: boolean;
  employee_id: string | null;
  application_status: string;
  preboarding_status: 'in_progress' | 'completed' | null;
  prefill: {
    first_name: string;
    last_name: string;
    personal_email: string | null;
    personal_phone: string | null;
    branch_id: string | null;
    branch_name: string | null;
    department_id: string | null;
    department_name: string | null;
    position_id: string | null;
    position_name: string | null;
    designation: string | null;
    employment_type_id: string | null;
    employment_type_name: string | null;
    reporting_manager_id: string | null;
    date_of_joining: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    ifsc_code: string | null;
    account_type: string | null;
    upi_id: string | null;
    emergency_contact: EmergencyContact;
  };
}

export interface ConvertToEmployeePayload {
  employee_code?: string;
  first_name?: string;
  last_name?: string;
  personal_email?: string;
  personal_phone?: string;
  branch_id?: string;
  department_id?: string;
  designation_id?: string;
  position_id?: string;
  employment_type_id?: string;
  reporting_manager_id?: string;
  date_of_joining?: string;
  probation_end_date?: string;
  bank_name?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  account_type?: string;
  upi_id?: string;
  emergency_contact?: EmergencyContact;
  enable_login?: boolean;
  login_email?: string;
  login_password?: string;
  login_role?: string;
}

export type ProbationRecommendation = 'confirm' | 'extend' | 'terminate';

export interface ProbationGoal { description: string; target_date: string | null }
export interface ProbationReviewEntry { date: string; reviewer_id: string | null; type: 'manager' | 'hr'; feedback: string; rating: number | null }

export interface ProbationReview {
  id: string;
  tenant_id: string;
  employee_id: string;
  application_id: string | null;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  goals: ProbationGoal[];
  review_entries: ProbationReviewEntry[];
  reviewer_id: string | null;
  reviewer_email?: string | null;
  probation_end_date: string | null;
  extended_probation_end_date: string | null;
  recommendation: ProbationRecommendation | null;
  recommendation_notes: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_reason: string | null;
  rejection_reason: string | null;
  approval_step: number;
  approval_log: any[];
  confirmation_date: string | null;
  confirmation_letter_content: string | null;
  created_at: string;
  updated_at: string;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const preboardingApi = {
  get: (applicationId: string): Promise<PreboardingChecklist> =>
    api.get(`/recruitment/applications/${applicationId}/preboarding`).then((r) => r.data.data),
  updateItem: (applicationId: string, key: string, data: { status: string; notes?: string }) =>
    api.put(`/recruitment/applications/${applicationId}/preboarding/items/${key}`, data).then((r) => r.data.data),
  updateJoiningDate: (applicationId: string, joiningDate: string) =>
    api.put(`/recruitment/applications/${applicationId}/preboarding/joining-date`, { joining_date: joiningDate }).then((r) => r.data.data),
  sendWelcomeEmail: (applicationId: string, subject: string, body: string) =>
    api.post(`/recruitment/applications/${applicationId}/preboarding/welcome-email`, { subject, body }).then((r) => r.data.data),
  listDocuments: (applicationId: string) =>
    api.get(`/recruitment/applications/${applicationId}/preboarding/documents`).then((r) => r.data.data),
};

export const conversionApi = {
  preview: (applicationId: string): Promise<ConversionPreview> =>
    api.get(`/recruitment/applications/${applicationId}/conversion-preview`).then((r) => r.data.data),
  convert: (applicationId: string, data: ConvertToEmployeePayload = {}) =>
    api.post(`/recruitment/applications/${applicationId}/convert`, data).then((r) => r.data.data),
};

export const probationApi = {
  list: (filters: { employee_id?: string; status?: string; page?: number; limit?: number } = {}): Promise<{ data: ProbationReview[]; total: number }> =>
    api.get(`/recruitment/probation-reviews${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<ProbationReview> => api.get(`/recruitment/probation-reviews/${id}`).then((r) => r.data.data),
  byEmployee: (employeeId: string): Promise<ProbationReview[]> =>
    api.get(`/recruitment/probation-reviews/by-employee/${employeeId}`).then((r) => r.data.data),
  create: (data: { employee_id: string; application_id?: string; goals?: ProbationGoal[]; probation_end_date?: string; reviewer_id?: string }) =>
    api.post('/recruitment/probation-reviews', data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/probation-reviews/${id}`).then((r) => r.data.data),
  addGoal: (id: string, data: { description: string; target_date?: string }) =>
    api.post(`/recruitment/probation-reviews/${id}/goals`, data).then((r) => r.data.data),
  addReviewEntry: (id: string, data: { type: 'manager' | 'hr'; feedback: string; rating?: number }) =>
    api.post(`/recruitment/probation-reviews/${id}/review-entries`, data).then((r) => r.data.data),
  setRecommendation: (id: string, data: { recommendation: ProbationRecommendation; recommendation_notes?: string; extended_probation_end_date?: string }) =>
    api.put(`/recruitment/probation-reviews/${id}/recommendation`, data).then((r) => r.data.data),
  submit: (id: string) => api.post(`/recruitment/probation-reviews/${id}/submit`).then((r) => r.data.data),
  approve: (id: string, reason: string, remarks?: string) =>
    api.post(`/recruitment/probation-reviews/${id}/approve`, { reason, remarks }).then((r) => r.data.data),
  reject: (id: string, reason: string) =>
    api.post(`/recruitment/probation-reviews/${id}/reject`, { reason }).then((r) => r.data.data),
};
