// Hierarchy + scope user types. Mirrors the client-visible customer roles.
// Kept strictly separate from the roles/positions permission-customization
// system (HR Manager, Finance Manager, etc.).
export type UserType = 'org_admin' | 'branch_admin' | 'admin' | 'employee';

export const ALL_USER_TYPES: UserType[] = [
  'org_admin',
  'branch_admin',
  'admin',
  'employee',
];

// Lower rank = more privileged.
export const HIERARCHY_RANK: Record<UserType, number> = {
  org_admin: 0,
  branch_admin: 1,
  admin: 2,
  employee: 3,
};

export function rankOf(userType?: string | null): number {
  return HIERARCHY_RANK[userType as UserType] ?? HIERARCHY_RANK.employee;
}

// True if userType is at least as privileged as minType (rank-wise, lower rank wins).
export function isAtLeast(userType: string | null | undefined, minType: UserType): boolean {
  return rankOf(userType) <= HIERARCHY_RANK[minType];
}

export const USER_TYPE_LABELS: Record<UserType, string> = {
  org_admin: 'Org Admin',
  branch_admin: 'Branch Admin',
  admin: 'Admin',
  employee: 'Employee',
};

export const USER_TYPE_COLORS: Record<UserType, string> = {
  org_admin: 'bg-orange-50 text-orange-700 border-orange-200/60 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800/60',
  branch_admin: 'bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/60',
  admin: 'bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/60',
  employee: 'bg-slate-50 text-slate-600 border-slate-200/60 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700/60',
};
