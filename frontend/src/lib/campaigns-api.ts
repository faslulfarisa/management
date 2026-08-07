import api from './api';

export type CampaignType = 'employee_referral' | 'agency' | 'walk_in' | 'campus' | 'internship' | 'job_board' | 'social_media' | 'other';
export type CampaignStatus = 'planned' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  campaign_type: CampaignType;
  vacancy_ids: string[];
  start_date: string | null;
  end_date: string | null;
  budget_amount: number | null;
  actual_spend: number;
  status: CampaignStatus;
  description: string | null;
  application_count?: number;
  hired_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total_applications: number;
  shortlisted: number;
  rejected: number;
  hired: number;
  conversion_rate: number;
  cost_per_hire: number | null;
}

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const campaignsApi = {
  list: (filters: { q?: string; status?: string; campaign_type?: string; page?: number; limit?: number } = {}): Promise<{ data: Campaign[]; total: number }> =>
    api.get(`/recruitment/campaigns${qs(filters)}`).then((r) => ({ data: r.data.data, total: r.data.total })),
  get: (id: string): Promise<Campaign> => api.get(`/recruitment/campaigns/${id}`).then((r) => r.data.data),
  stats: (id: string): Promise<CampaignStats> => api.get(`/recruitment/campaigns/${id}/stats`).then((r) => r.data.data),
  create: (data: Partial<Campaign>) => api.post('/recruitment/campaigns', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Campaign>) => api.put(`/recruitment/campaigns/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/recruitment/campaigns/${id}`).then((r) => r.data.data),
};
