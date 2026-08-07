// Explicit data-access scope, replacing the implicit `string[] | null`
// ("null = unrestricted") convention previously returned by
// UserHierarchyService.getAccessScope().
//
// `isGlobalAccess: true`  -> caller may see all branches in the tenant
//                            (super_admin / org_admin).
// `isGlobalAccess: false` -> caller is restricted to `branchIds`
//                            (branch_admin / admin).
export interface AccessScope {
  isGlobalAccess: boolean;
  branchIds: string[];
}

export const GLOBAL_ACCESS_SCOPE: AccessScope = Object.freeze({ isGlobalAccess: true, branchIds: [] });

export function isBranchInScope(scope: AccessScope, branchId: string | null | undefined): boolean {
  if (scope.isGlobalAccess) return true;
  if (!branchId) return false;
  return scope.branchIds.includes(branchId);
}

/**
 * Builds a SQL fragment + params enforcing `scope` against `column`
 * (e.g. `'e.branch_id'`), starting at positional parameter `$paramIndex`.
 *
 * Replaces the `($N::uuid[] IS NULL OR <column> = ANY($N))` pattern with an
 * explicit branch:
 *   - global access  -> `{ clause: 'TRUE', params: [] }` (no extra param)
 *   - scoped access  -> `{ clause: '<column> = ANY($N::uuid[])', params: [branchIds] }`
 *
 * Usage:
 *   const scope = branchScopeClause(accessScope, 'e.branch_id', idx);
 *   query += ` AND ${scope.clause}`;
 *   params.push(...scope.params);
 *   idx += scope.params.length;
 */
export function branchScopeClause(
  scope: AccessScope,
  column: string,
  paramIndex: number,
): { clause: string; params: [string[]] | [] } {
  if (scope.isGlobalAccess) return { clause: 'TRUE', params: [] };
  return { clause: `${column} = ANY($${paramIndex}::uuid[])`, params: [scope.branchIds] };
}
