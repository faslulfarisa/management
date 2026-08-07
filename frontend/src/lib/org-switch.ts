import type { QueryClient } from '@tanstack/react-query';
import { useBiometricsStore } from '@/store/biometrics.store';
import { useNavigationHistoryStore } from '@/store/navigation-history.store';

// localStorage key prefixes that hold data scoped to the *previously active*
// organization. These must not leak into the next org's session.
const TENANT_SCOPED_STORAGE_PREFIXES = ['report-filters:'];

/**
 * Removes all localStorage entries scoped to the organization being left
 * (saved report filters, table/column preferences, etc). Auth/session keys
 * (access_token, tenants, selected_tenant_id, ...) are intentionally left
 * alone — those are managed by auth.store and updated separately.
 */
export function clearTenantScopedStorage(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && TENANT_SCOPED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * Resets all client-side caches and stores that hold data scoped to an
 * organization context. Must be called whenever the active organization
 * changes, before any data for the new organization is fetched — otherwise
 * stale cross-org data (cached queries, live filters, in-memory feeds) can
 * briefly render or leak into the new org's views.
 */
export function resetOrgScopedState(queryClient: QueryClient): void {
  queryClient.clear();
  clearTenantScopedStorage();
  useBiometricsStore.getState().resetAll();
  useNavigationHistoryStore.getState().reset();
}
