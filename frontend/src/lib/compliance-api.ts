import api from './api';

export interface ComplianceCategory {
  id: string;
  scope: 'company' | 'employee';
  group_label: string;
  name: string;
  code: string;
  is_system: boolean;
  is_active: boolean;
}

export interface ComplianceDocument {
  id: string;
  tenant_id: string;
  scope: 'company' | 'employee';
  employee_id: string | null;
  category_id: string;
  category_name?: string;
  category_group_label?: string;
  document_type: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  department_id: string | null;
  branch_id: string | null;
  tags: string[];
  issue_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  grace_period_days: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'expired' | 'renewal_pending' | 'archived' | 'deleted';
  confidentiality_level: 'public' | 'internal' | 'confidential' | 'restricted';
  current_version: number;
  document_number: string | null;
  issuing_authority: string | null;
  extra_fields: Record<string, any>;
  remarks: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_url: string;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  change_note: string | null;
  uploaded_by: string | null;
  uploaded_by_email?: string;
  created_at: string;
}

export interface DocumentFilters {
  scope?: 'company' | 'employee';
  employeeId?: string;
  branchId?: string;
  departmentId?: string;
  categoryId?: string;
  groupLabel?: string;
  status?: string;
  confidentialityLevel?: string;
  q?: string;
  tag?: string;
  documentNumber?: string;
  expiringWithinDays?: number;
  page?: number;
  limit?: number;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const complianceCategoriesApi = {
  list: (scope?: 'company' | 'employee'): Promise<ComplianceCategory[]> =>
    api.get(`/compliance/categories${qs({ scope })}`).then((r) => r.data.data),
  create: (data: { scope: string; group_label: string; name: string; code: string }) =>
    api.post('/compliance/categories', data).then((r) => r.data.data),
};

export const complianceDocumentsApi = {
  list: (filters: DocumentFilters = {}): Promise<{ data: ComplianceDocument[]; total: number }> =>
    api.get(`/compliance/documents${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<ComplianceDocument> => api.get(`/compliance/documents/${id}`).then((r) => r.data.data),
  create: (data: Partial<ComplianceDocument> & { scope: string; category_id: string; document_type: string; title: string }) =>
    api.post('/compliance/documents', data).then((r) => r.data.data),
  update: (id: string, data: Partial<ComplianceDocument>) =>
    api.put(`/compliance/documents/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/compliance/documents/${id}`).then((r) => r.data.data),
  archive: (id: string) => api.post(`/compliance/documents/${id}/archive`).then((r) => r.data.data),
  uploadFile: (file: File): Promise<{ url: string; fileName: string; sizeBytes: number; mimeType: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/compliance/documents/upload-file', formData).then((r) => r.data.data);
  },
  listVersions: (id: string): Promise<DocumentVersion[]> => api.get(`/compliance/documents/${id}/versions`).then((r) => r.data.data),
  uploadVersion: (id: string, data: { file_url: string; file_name?: string; file_size_bytes?: number; mime_type?: string; change_note?: string }) =>
    api.post(`/compliance/documents/${id}/versions`, data).then((r) => r.data.data),
  restoreVersion: (id: string, versionNumber: number) =>
    api.post(`/compliance/documents/${id}/versions/restore`, { version_number: versionNumber }).then((r) => r.data.data),
  download: (id: string): Promise<{ url: string; fileName: string | null }> =>
    api.get(`/compliance/documents/${id}/download`).then((r) => r.data.data),
  submit: (id: string) => api.post(`/compliance/documents/${id}/submit`).then((r) => r.data.data),
  approve: (id: string, reason: string, remarks?: string) =>
    api.post(`/compliance/documents/${id}/approve`, { reason, remarks }).then((r) => r.data.data),
  reject: (id: string, reason: string) => api.post(`/compliance/documents/${id}/reject`, { reason }).then((r) => r.data.data),
  requestRenewal: (id: string, data: { file_url: string; file_name?: string; file_size_bytes?: number; mime_type?: string; change_note?: string }) =>
    api.post(`/compliance/documents/${id}/renewal`, data).then((r) => r.data.data),
};

export const complianceTrackerApi = {
  getFilings: (filters: { type?: string; month?: number; year?: number } = {}) =>
    api.get(`/compliance/filings${qs(filters)}`).then((r) => r.data.data),
  createFiling: (data: any) => api.post('/compliance/filings', data).then((r) => r.data.data),
  updateFiling: (id: string, data: any) => api.put(`/compliance/filings/${id}`, data).then((r) => r.data.data),
  removeFiling: (id: string) => api.delete(`/compliance/filings/${id}`).then((r) => r.data.data),
  listItems: (filters: { complianceType?: string; status?: string } = {}) =>
    api.get(`/compliance/tracker-items${qs(filters)}`).then((r) => r.data.data),
  createItem: (data: any) => api.post('/compliance/tracker-items', data).then((r) => r.data.data),
  updateItem: (id: string, data: any) => api.put(`/compliance/tracker-items/${id}`, data).then((r) => r.data.data),
  removeItem: (id: string) => api.delete(`/compliance/tracker-items/${id}`).then((r) => r.data.data),
  linkDocument: (id: string, documentId: string) => api.post(`/compliance/tracker-items/${id}/documents/${documentId}`).then((r) => r.data.data),
};

export const compliancePolicyApi = {
  publish: (documentId: string) => api.post(`/compliance/policies/${documentId}/publish`).then((r) => r.data.data),
  getAcknowledgements: (documentId: string) => api.get(`/compliance/policies/${documentId}/acknowledgements`).then((r) => r.data.data),
  acknowledge: (documentId: string) => api.post(`/compliance/policies/${documentId}/acknowledge`).then((r) => r.data.data),
  myPending: () => api.get('/compliance/policies/my/pending').then((r) => r.data.data),
};

export const complianceDocumentRequestsApi = {
  list: (filters: { employeeId?: string; status?: string } = {}) =>
    api.get(`/compliance/document-requests${qs(filters)}`).then((r) => r.data.data),
  create: (data: { employee_id: string; category_id?: string; title: string; instructions?: string; due_date?: string }) =>
    api.post('/compliance/document-requests', data).then((r) => r.data.data),
  fulfil: (id: string, documentId: string) => api.post(`/compliance/document-requests/${id}/fulfil`, { document_id: documentId }).then((r) => r.data.data),
  approve: (id: string, remarks?: string) => api.post(`/compliance/document-requests/${id}/approve`, { remarks }).then((r) => r.data.data),
  requestResubmission: (id: string, remarks?: string) => api.post(`/compliance/document-requests/${id}/request-resubmission`, { remarks }).then((r) => r.data.data),
};

export const complianceDashboardApi = {
  getCards: () => api.get('/compliance/dashboard/cards').then((r) => r.data.data),
  getExpiryTimeline: () => api.get('/compliance/dashboard/expiry-timeline').then((r) => r.data.data),
  getAuditActivity: (limit?: number) => api.get(`/compliance/dashboard/audit-activity${qs({ limit })}`).then((r) => r.data.data),
};

export const complianceReportsApi = {
  documentInventory: () => api.get('/compliance/reports/document-inventory').then((r) => r.data.data),
  expiredDocuments: () => api.get('/compliance/reports/expired-documents').then((r) => r.data.data),
  upcomingRenewals: () => api.get('/compliance/reports/upcoming-renewals').then((r) => r.data.data),
  employeeMissingDocuments: () => api.get('/compliance/reports/employee-missing-documents').then((r) => r.data.data),
  companyLicenseReport: () => api.get('/compliance/reports/company-licenses').then((r) => r.data.data),
  policyAcknowledgementReport: () => api.get('/compliance/reports/policy-acknowledgements').then((r) => r.data.data),
  auditReport: (from?: string, to?: string) => api.get(`/compliance/reports/audit${qs({ from, to })}`).then((r) => r.data.data),
};
