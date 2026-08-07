import api from '@/lib/api';

export type SignupOfferType = 'free_trial' | 'discount_percent' | 'discount_flat';

export interface SignupOffer {
  id: string;
  name: string;
  description: string | null;
  offer_type: SignupOfferType;
  trial_days: number | null;
  discount_percent: string | null;
  discount_amount: string | null;
  code: string | null;
  applicable_plan_id: string | null;
  valid_from: string;
  valid_until: string | null;
  max_redemptions: number | null;
  redemptions_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignupOfferPayload {
  name: string;
  description?: string;
  offerType: SignupOfferType;
  trialDays?: number;
  discountPercent?: number;
  discountAmount?: number;
  code?: string;
  applicablePlanId?: string;
  validFrom?: string;
  validUntil?: string;
  maxRedemptions?: number;
  isActive?: boolean;
}

export const signupOffersApi = {
  list: (): Promise<SignupOffer[]> =>
    api.get('/signup-offers').then((r) => r.data.data),

  getOne: (id: string): Promise<SignupOffer> =>
    api.get(`/signup-offers/${id}`).then((r) => r.data.data),

  create: (data: SignupOfferPayload): Promise<SignupOffer> =>
    api.post('/signup-offers', data).then((r) => r.data.data),

  update: (id: string, data: Partial<SignupOfferPayload>): Promise<SignupOffer> =>
    api.put(`/signup-offers/${id}`, data).then((r) => r.data.data),

  toggleActive: (id: string, isActive: boolean): Promise<SignupOffer> =>
    api.post(`/signup-offers/${id}/toggle`, { isActive }).then((r) => r.data.data),

  remove: (id: string): Promise<{ success: boolean }> =>
    api.delete(`/signup-offers/${id}`).then((r) => r.data.data),
};

export interface PublicSignupOffer {
  id: string;
  name: string;
  description: string | null;
  offer_type: SignupOfferType;
  trial_days: number | null;
  discount_percent: string | null;
  discount_amount: string | null;
  applicable_plan_id: string | null;
  valid_until: string | null;
}

export const publicSignupOffersApi = {
  listActive: (): Promise<PublicSignupOffer[]> =>
    api.get('/public/signup-offers/active').then((r) => r.data.data),

  validateCode: (code: string): Promise<PublicSignupOffer> =>
    api.post('/public/signup-offers/validate-code', { code }).then((r) => r.data.data),
};
