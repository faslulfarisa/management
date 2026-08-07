import axios from 'axios';
import { getCurrentHost } from '@/lib/portal-host';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const currentHost = getCurrentHost();
  if (currentHost) config.headers['X-Portal-Host'] = currentHost;
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Singleton refresh promise — ensures only one /auth/refresh call is in-flight at a time.
// Multiple concurrent 401s will all await the same promise instead of each revoking the
// refresh token independently (which would cause the second+ calls to fail).
let refreshingPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      try {
        if (!refreshingPromise) {
          refreshingPromise = axios
            .post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true })
            .then((res) => {
              const newToken: string = res.data.data.accessToken;
              localStorage.setItem('access_token', newToken);
              return newToken;
            })
            .finally(() => { refreshingPromise = null; });
        }
        const newToken = await refreshingPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('selected_tenant_id');
        localStorage.removeItem('tenants');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;
