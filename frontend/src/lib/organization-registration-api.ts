import api from '@/lib/api';

export interface CreateAccountPayload {
  fullName: string;
  email: string;
  mobile?: string;
  password: string;
  confirmPassword: string;
}

export interface RegistrationSession {
  registrationId: string;
  accessToken: string;
}

export interface AccountStatus {
  fullName: string;
  email: string;
  mobile: string | null;
  emailVerified: boolean;
  mobileVerified: boolean;
}

export interface AddressPayload {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
}

export interface SubmitOrganizationPayload extends RegistrationSession {
  legalName: string;
  tradeName?: string;
  companyType: string;
  registrationNumber?: string;
  gstin?: string;
  panNumber?: string;
  cinNumber?: string;
  industry?: string;
  websiteUrl?: string;
  corporateEmail: string;
  supportEmail?: string;
  phoneNumber: string;
  alternatePhone?: string;
  registeredAddress: AddressPayload;
  operationalAddress?: AddressPayload;
  estimatedBranchCount?: number;
  estimatedEmployeeCount?: number;
  businessCategory?: string;
  currentHrSystem?: string;
  companySize?: string;
  payrollRequirement?: boolean;
  attendanceRequirement?: boolean;
  biometricRequirement?: boolean;
  recruitmentRequirement?: boolean;
  performanceRequirement?: boolean;
  contactPersonName: string;
  contactDesignation: string;
  contactPersonMobile: string;
  contactPersonEmail: string;
  offerId?: string;
}

export interface OrganizationStatus {
  id: string;
  name: string;
  approval_status: string;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  trial_ends_at: string | null;
}

export const registrationApi = {
  createAccount: (data: CreateAccountPayload): Promise<RegistrationSession> =>
    api.post('/organization-registration/account', data).then((r) => r.data.data),

  verifyEmail: (registrationId: string, token: string): Promise<{ success: boolean; alreadyVerified?: boolean }> =>
    api.post('/organization-registration/verify-email', { registrationId, token }).then((r) => r.data.data),

  // NOTE: callers often pass the registration *store* object here, which
  // also carries email/fullName/mobile — explicitly pick just the session
  // fields so those extra properties never reach the backend (the global
  // ValidationPipe rejects unknown body properties with a 400).
  resendVerification: (session: RegistrationSession) =>
    api.post('/organization-registration/resend-verification', {
      registrationId: session.registrationId, accessToken: session.accessToken,
    }).then((r) => r.data.data),

  requestMobileOtp: (session: RegistrationSession) =>
    api.post('/organization-registration/mobile-otp/request', {
      registrationId: session.registrationId, accessToken: session.accessToken,
    }).then((r) => r.data.data),

  verifyMobile: (session: RegistrationSession & { otp: string }) =>
    api.post('/organization-registration/mobile-otp/verify', {
      registrationId: session.registrationId, accessToken: session.accessToken, otp: session.otp,
    }).then((r) => r.data.data),

  getAccountStatus: (session: RegistrationSession): Promise<AccountStatus> =>
    api.post('/organization-registration/account/status', {
      registrationId: session.registrationId, accessToken: session.accessToken,
    }).then((r) => r.data.data),

  submitOrganization: (data: SubmitOrganizationPayload): Promise<{ tenantId: string; approvalStatus: string; offerApplied: boolean; trialEndsAt: string | null }> =>
    api.post('/organization-registration/organization', data).then((r) => r.data.data),

  getOrganizationStatus: (tenantId: string): Promise<OrganizationStatus> =>
    api.get(`/organization-registration/status/${tenantId}`).then((r) => r.data.data),
};

export interface PendingOrganizationSummary {
  id: string;
  name: string;
  legal_name: string;
  trade_name: string | null;
  company_type: string;
  contact_person_name: string;
  contact_person_mobile: string;
  contact_person_email: string;
  primary_email: string;
  phone_number: string;
  estimated_branch_count: number | null;
  estimated_employee_count: number | null;
  approval_status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  demo_scheduled_at: string | null;
  created_at: string;
}

export interface OrganizationApprovalStats {
  newRegistrations: number;
  pendingApprovals: number;
  awaitingContact: number;
  awaitingActivation: number;
  changeRequestsPending: number;
}

export type ApprovalAction = 'approve' | 'reject' | 'request_info' | 'schedule_demo' | 'under_discussion';

export const organizationApprovalApi = {
  list: (status?: string): Promise<PendingOrganizationSummary[]> =>
    api.get('/organization-approvals', { params: status ? { status } : undefined }).then((r) => r.data.data),

  stats: (): Promise<OrganizationApprovalStats> =>
    api.get('/organization-approvals/stats').then((r) => r.data.data),

  getOne: (id: string) =>
    api.get(`/organization-approvals/${id}`).then((r) => r.data.data),

  transition: (id: string, action: ApprovalAction, notes?: string, demoAt?: string) =>
    api.post(`/organization-approvals/${id}/transition`, { action, notes, demoAt }).then((r) => r.data.data),
};

export interface OrganizationChangeRequest {
  id: string;
  tenant_id: string;
  requested_by_user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'documents_requested';
  changes: Record<string, { old: any; new: any }>;
  reason: string;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  tenant_name?: string;
  tenant_legal_name?: string;
}

export interface CreateChangeRequestPayload {
  legalName?: string;
  tradeName?: string;
  registrationNumber?: string;
  gstin?: string;
  panNumber?: string;
  cinNumber?: string;
  companyType?: string;
  reason: string;
}

export const organizationChangeRequestApi = {
  create: (data: CreateChangeRequestPayload): Promise<OrganizationChangeRequest> =>
    api.post('/organization-change-requests', data).then((r) => r.data.data),

  listMine: (): Promise<OrganizationChangeRequest[]> =>
    api.get('/organization-change-requests').then((r) => r.data.data),

  listAll: (status?: string): Promise<OrganizationChangeRequest[]> =>
    api.get('/organization-change-requests/admin', { params: status ? { status } : undefined }).then((r) => r.data.data),

  getOne: (id: string): Promise<OrganizationChangeRequest> =>
    api.get(`/organization-change-requests/admin/${id}`).then((r) => r.data.data),

  transition: (id: string, action: 'approve' | 'reject' | 'request_documents', notes?: string) =>
    api.post(`/organization-change-requests/admin/${id}/transition`, { action, notes }).then((r) => r.data.data),
};
