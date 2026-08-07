import api from './api';

export interface PipelineStage {
  id: string;
  tenant_id: string;
  name: string;
  stage_category: 'screening' | 'assessment' | 'interview' | 'evaluation' | 'offer' | 'custom';
  stage_order: number;
  color: string | null;
  is_active: boolean;
  created_at: string;
}

export const pipelineStagesApi = {
  list: (includeInactive = false): Promise<PipelineStage[]> =>
    api.get('/recruitment/pipeline-stages', { params: { includeInactive } }).then((r) => r.data.data),
  create: (data: { name: string; stage_category?: string; stage_order: number; color?: string }) =>
    api.post('/recruitment/pipeline-stages', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Pick<PipelineStage, 'name' | 'stage_category' | 'stage_order' | 'color' | 'is_active'>>) =>
    api.put(`/recruitment/pipeline-stages/${id}`, data).then((r) => r.data.data),
  deactivate: (id: string) => api.delete(`/recruitment/pipeline-stages/${id}`).then((r) => r.data.data),
};

export interface CommunicationTemplate {
  id: string;
  tenant_id: string;
  name: string;
  category: 'interview_invite' | 'rejection' | 'offer' | 'reminder' | 'custom';
  subject: string;
  body: string;
  is_active: boolean;
  created_at: string;
}

export const communicationTemplatesApi = {
  list: (includeInactive = false): Promise<CommunicationTemplate[]> =>
    api.get('/recruitment/communication-templates', { params: { includeInactive } }).then((r) => r.data.data),
  create: (data: { name: string; category?: string; subject: string; body: string }) =>
    api.post('/recruitment/communication-templates', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Pick<CommunicationTemplate, 'name' | 'category' | 'subject' | 'body' | 'is_active'>>) =>
    api.put(`/recruitment/communication-templates/${id}`, data).then((r) => r.data.data),
};
