'use client';

import type { ReactNode } from 'react';
import { useCan, useCanAll, useCanAny, useCanAccessBranch } from '@/hooks/use-permissions';
import type { Permission } from '@/lib/permissions';

interface CanProps {
  /** Render children if the user has this permission. */
  permission?: Permission | string;
  /** Render children if the user has at least one of these permissions. */
  any?: (Permission | string)[];
  /** Render children only if the user has all of these permissions. */
  all?: (Permission | string)[];
  /** Additionally require the user's branch access scope to include this branch. */
  branchId?: string | null;
  /** Rendered when the check fails (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative permission gate for role/organization/branch-aware rendering.
 *
 * Usage:
 *   <Can permission={PERMISSIONS.EMPLOYEES_CREATE}>
 *     <Button>Add Employee</Button>
 *   </Can>
 *
 *   <Can permission={PERMISSIONS.PAYROLL_APPROVE} branchId={employee.branchId}>
 *     <Button>Approve</Button>
 *   </Can>
 */
export function Can({ permission, any, all, branchId, fallback = null, children }: CanProps) {
  const hasPermission = useCan(permission ?? '__none__');
  const hasAny = useCanAny(any ?? []);
  const hasAll = useCanAll(all ?? []);
  const hasBranch = useCanAccessBranch(branchId);

  let allowed = true;
  if (permission) allowed = allowed && hasPermission;
  if (any) allowed = allowed && hasAny;
  if (all) allowed = allowed && hasAll;
  if (branchId !== undefined) allowed = allowed && hasBranch;

  return <>{allowed ? children : fallback}</>;
}
