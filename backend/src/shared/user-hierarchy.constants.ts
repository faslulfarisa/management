// Hierarchy + scope user types. Kept strictly separate from the
// roles/positions permission-customization system (HR Manager, Finance Manager, etc.).
//
// super_admin is never stored in user_tenants.user_type — it lives on
// users.is_super_admin and is global (not org-scoped).
export const USER_TYPES = ['org_admin', 'branch_admin', 'admin', 'employee'] as const;
export type StoredUserType = (typeof USER_TYPES)[number];
export type UserType = 'super_admin' | StoredUserType;

export const ALL_USER_TYPES: UserType[] = ['super_admin', ...USER_TYPES];

// Lower rank = more privileged.
export const HIERARCHY_RANK: Record<UserType, number> = {
  super_admin: 0,
  org_admin: 1,
  branch_admin: 2,
  admin: 3,
  employee: 4,
};

export function normalizeStoredUserType(userType?: string | null): StoredUserType {
  if (userType === 'super_admin') return 'org_admin';
  if (USER_TYPES.includes(userType as StoredUserType)) return userType as StoredUserType;
  return 'employee';
}
