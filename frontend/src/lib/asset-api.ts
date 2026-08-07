import api from '@/lib/api';
import type { AssetAssignment } from '@/types/exit';

export const assetApi = {
  listTypes: (): Promise<any[]> => api.get('/assets/types').then((r) => r.data.data),
  createType: (payload: any): Promise<any> => api.post('/assets/types', payload).then((r) => r.data.data),

  listItems: (params?: { status?: string; search?: string }): Promise<any[]> =>
    api.get('/assets/items', { params }).then((r) => r.data.data),
  createItem: (payload: any): Promise<any> => api.post('/assets/items', payload).then((r) => r.data.data),

  assign: (payload: { asset_item_id: string; employee_id: string; expected_return_date?: string; notes?: string }): Promise<any> =>
    api.post('/assets/assignments', payload).then((r) => r.data.data),
  listForEmployee: (employeeId: string): Promise<AssetAssignment[]> =>
    api.get(`/assets/assignments/employee/${employeeId}`).then((r) => r.data.data),
  listForExit: (exitRequestId: string): Promise<AssetAssignment[]> =>
    api.get(`/assets/assignments/exit/${exitRequestId}`).then((r) => r.data.data),
  recordReturn: (assignmentId: string, payload: { return_condition: 'good' | 'damaged' | 'lost'; recovery_amount?: number; notes?: string }): Promise<AssetAssignment> =>
    api.put(`/assets/assignments/${assignmentId}/return`, payload).then((r) => r.data.data),
};
