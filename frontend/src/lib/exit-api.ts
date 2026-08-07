import api from '@/lib/api';
import type {
  ExitRequest, ExitTimelineEvent, ExitChecklistItem, ExitClearance,
  ExitKnowledgeTransfer, ExitInterview, ExitInterviewQuestion, FinalSettlement, ExitStats,
} from '@/types/exit';

export const exitApi = {
  getStats: (): Promise<ExitStats> => api.get('/exit-management/stats').then((r) => r.data.data),

  getMonthlyTrend: (months?: number): Promise<any[]> =>
    api.get('/exit-management/analytics/monthly-trend', { params: { months } }).then((r) => r.data.data),
  getDepartmentTrend: (): Promise<any[]> => api.get('/exit-management/analytics/department-trend').then((r) => r.data.data),
  getBranchTrend: (): Promise<any[]> => api.get('/exit-management/analytics/branch-trend').then((r) => r.data.data),
  getAttritionReport: (params?: { from?: string; to?: string }): Promise<any> =>
    api.get('/exit-management/analytics/attrition', { params }).then((r) => r.data.data),

  listRequests: (params?: { status?: string; search?: string; employee_id?: string; branch_id?: string }): Promise<ExitRequest[]> =>
    api.get('/exit-management/requests', { params }).then((r) => r.data.data),
  getRequest: (id: string): Promise<ExitRequest> => api.get(`/exit-management/requests/${id}`).then((r) => r.data.data),
  createRequest: (payload: any): Promise<ExitRequest> => api.post('/exit-management/requests', payload).then((r) => r.data.data),
  approveRequest: (id: string, reason: string): Promise<any> => api.put(`/exit-management/requests/${id}/approve`, { reason }).then((r) => r.data.data),
  rejectRequest: (id: string, reason: string): Promise<any> => api.put(`/exit-management/requests/${id}/reject`, { reason }).then((r) => r.data.data),
  deleteRequest: (id: string): Promise<void> => api.delete(`/exit-management/requests/${id}`).then(() => undefined),
  getTimeline: (id: string): Promise<ExitTimelineEvent[]> => api.get(`/exit-management/requests/${id}/timeline`).then((r) => r.data.data),

  getChecklist: (id: string): Promise<ExitChecklistItem[]> => api.get(`/exit-management/requests/${id}/checklist`).then((r) => r.data.data),
  createChecklistItem: (id: string, payload: any): Promise<ExitChecklistItem> => api.post(`/exit-management/requests/${id}/checklist`, payload).then((r) => r.data.data),
  updateChecklistItem: (itemId: string, payload: any): Promise<ExitChecklistItem> => api.put(`/exit-management/checklist/${itemId}`, payload).then((r) => r.data.data),
  deleteChecklistItem: (itemId: string): Promise<void> => api.delete(`/exit-management/checklist/${itemId}`).then(() => undefined),

  getClearances: (id: string): Promise<ExitClearance[]> => api.get(`/exit-management/requests/${id}/clearances`).then((r) => r.data.data),
  createClearance: (id: string, payload: any): Promise<ExitClearance> => api.post(`/exit-management/requests/${id}/clearances`, payload).then((r) => r.data.data),
  updateClearance: (clearanceId: string, payload: any): Promise<ExitClearance> => api.put(`/exit-management/clearances/${clearanceId}`, payload).then((r) => r.data.data),
  deleteClearance: (clearanceId: string): Promise<void> => api.delete(`/exit-management/clearances/${clearanceId}`).then(() => undefined),

  getKnowledgeTransfer: (id: string): Promise<ExitKnowledgeTransfer | null> => api.get(`/exit-management/requests/${id}/knowledge-transfer`).then((r) => r.data.data),
  reviewKnowledgeTransfer: (id: string, approved: boolean, remarks?: string): Promise<ExitKnowledgeTransfer> =>
    api.put(`/exit-management/requests/${id}/knowledge-transfer/review`, { approved, remarks }).then((r) => r.data.data),

  getInterviewQuestionnaire: (): Promise<ExitInterviewQuestion[]> => api.get('/exit-management/interview-questionnaire').then((r) => r.data.data),
  getInterview: (id: string): Promise<ExitInterview | null> => api.get(`/exit-management/requests/${id}/interview`).then((r) => r.data.data),
  scheduleInterview: (id: string, scheduled_at: string, conducted_by?: string): Promise<ExitInterview> =>
    api.post(`/exit-management/requests/${id}/interview/schedule`, { scheduled_at, conducted_by }).then((r) => r.data.data),
  skipInterview: (id: string): Promise<ExitInterview> => api.post(`/exit-management/requests/${id}/interview/skip`).then((r) => r.data.data),
  addManagerFeedback: (id: string, feedback: string): Promise<ExitInterview> => api.put(`/exit-management/requests/${id}/interview/manager-feedback`, { feedback }).then((r) => r.data.data),
  addHrFeedback: (id: string, feedback: string): Promise<ExitInterview> => api.put(`/exit-management/requests/${id}/interview/hr-feedback`, { feedback }).then((r) => r.data.data),

  listSettlements: (params?: { employee_id?: string; payment_status?: string }): Promise<FinalSettlement[]> =>
    api.get('/exit-management/settlements', { params }).then((r) => r.data.data),
  getSettlementForRequest: (id: string): Promise<FinalSettlement | null> =>
    api.get(`/exit-management/requests/${id}/settlement`).then((r) => r.data.data),
  calculateSettlement: (id: string): Promise<FinalSettlement> => api.post(`/exit-management/requests/${id}/settlement/calculate`).then((r) => r.data.data),
  adjustSettlement: (id: string, payload: { field: string; amount: number; reason: string }): Promise<FinalSettlement> =>
    api.put(`/exit-management/settlements/${id}/adjust`, payload).then((r) => r.data.data),
  approveSettlement: (id: string, reason: string): Promise<any> => api.put(`/exit-management/settlements/${id}/approve`, { reason }).then((r) => r.data.data),
  rejectSettlement: (id: string, reason: string): Promise<any> => api.put(`/exit-management/settlements/${id}/reject`, { reason }).then((r) => r.data.data),
  markSettlementPaid: (id: string, payment_date?: string): Promise<FinalSettlement> => api.put(`/exit-management/settlements/${id}/payment-status`, { payment_date }).then((r) => r.data.data),
  deleteSettlement: (id: string): Promise<void> => api.delete(`/exit-management/settlements/${id}`).then(() => undefined),

  listTemplates: (templateType?: string): Promise<any[]> => api.get('/exit-management/templates', { params: { template_type: templateType } }).then((r) => r.data.data),
  createTemplate: (payload: any): Promise<any> => api.post('/exit-management/templates', payload).then((r) => r.data.data),
  assignTemplate: (payload: any): Promise<any> => api.post('/exit-management/templates/assign', payload).then((r) => r.data.data),

  getDocuments: (id: string): Promise<any[]> => api.get(`/exit-management/requests/${id}/documents`).then((r) => r.data.data),
  registerDocument: (id: string, payload: any): Promise<any> => api.post(`/exit-management/requests/${id}/documents`, payload).then((r) => r.data.data),
};
