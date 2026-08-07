'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { useAuthStore, type AccessScope } from '@/store/auth.store';
import type { Permission } from '@/lib/permissions';

interface MyPermissionsResponse {
  permissions: string[];
  accessScope: AccessScope;
  userType: string;
  tenantId: string | null;
}

/**
 * Fetches the current user's effective permissions + branch access scope for
 * the active organization (GET /auth/me/permissions) and syncs them into
 * auth.store. Mount once near the root of the authenticated app — re-fetches
 * automatically whenever `selectedTenantId` changes (org switch).
 */
export function usePermissionsSync() {
  const { _hydrated, accessToken, selectedTenantId, setPermissions } = useAuthStore();

  const query = useQuery({
    queryKey: ['auth', 'me', 'permissions', selectedTenantId],
    queryFn: async () => {
      const res = await api.get<{ data: MyPermissionsResponse }>('/auth/me/permissions');
      return res.data.data;
    },
    enabled: _hydrated && !!accessToken,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) {
      setPermissions(query.data.permissions, query.data.accessScope);
    }
  }, [query.data, setPermissions]);

  return query;
}

/** Returns true if the current user has been granted `permission`. */
export function useCan(permission: Permission | string): boolean {
  const permissions = useAuthStore((s) => s.permissions);
  return permissions.includes(permission);
}

/** Returns true if the current user has at least one of `permissions`. */
export function useCanAny(permissions: (Permission | string)[]): boolean {
  const granted = useAuthStore((s) => s.permissions);
  return permissions.some((p) => granted.includes(p));
}

/** Returns true if the current user has every permission in `permissions`. */
export function useCanAll(permissions: (Permission | string)[]): boolean {
  const granted = useAuthStore((s) => s.permissions);
  return permissions.every((p) => granted.includes(p));
}

/** The current user's branch access scope (global vs restricted to specific branches). */
export function useAccessScope(): AccessScope {
  return useAuthStore((s) => s.accessScope);
}

/** Returns true if the current user's branch scope includes `branchId`. */
export function useCanAccessBranch(branchId: string | null | undefined): boolean {
  const scope = useAccessScope();
  return useMemo(() => {
    if (scope.isGlobalAccess) return true;
    if (!branchId) return false;
    return scope.branchIds.includes(branchId);
  }, [scope, branchId]);
}

/**
 * Combines a permission check with an optional branch-scope check —
 * mirrors AuthorizationService.can(user, permission, { branchId }) on the backend.
 */
export function useCanInBranch(permission: Permission | string, branchId?: string | null): boolean {
  const can = useCan(permission);
  const inBranch = useCanAccessBranch(branchId);
  if (!can) return false;
  if (branchId === undefined) return true;
  return inBranch;
}
