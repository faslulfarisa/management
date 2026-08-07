import api from '@/lib/api';
import type { GlobalProfile, GlobalProfilePersonalPayload } from '@/types/global-profile';

export const globalProfileApi = {
  getProfile: (): Promise<GlobalProfile> =>
    api.get('/auth/profile').then((r) => r.data.data),

  updatePersonal: (payload: GlobalProfilePersonalPayload): Promise<GlobalProfile> =>
    api.patch('/auth/profile/personal', payload).then((r) => r.data.data),

  updateAccount: (payload: { username?: string; email?: string }): Promise<GlobalProfile> =>
    api.patch('/auth/profile/account', payload).then((r) => r.data.data),

  uploadPhoto: (file: File): Promise<GlobalProfile> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/auth/profile/photo', formData).then((r) => r.data.data);
  },

  deletePhoto: (): Promise<GlobalProfile> =>
    api.delete('/auth/profile/photo').then((r) => r.data.data),

  revokeSession: (id: string): Promise<void> =>
    api.delete(`/auth/sessions/${id}`).then(() => undefined),
};
