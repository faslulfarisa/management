export type UserStatus =
  | 'active'
  | 'inactive'
  | 'locked'
  | 'suspended'
  | 'resigned'
  | 'terminated'
  | 'retired'
  | 'on_leave';

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  locked: 'Locked',
  suspended: 'Suspended',
  resigned: 'Resigned',
  terminated: 'Terminated',
  retired: 'Retired',
  on_leave: 'On Leave',
};

export const USER_STATUS_BADGE: Record<UserStatus, { emoji: string; className: string }> = {
  active:     { emoji: '🟢', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  inactive:   { emoji: '⚪', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  locked:     { emoji: '🔒', className: 'bg-red-50 text-red-700 border-red-200' },
  suspended:  { emoji: '🟡', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  resigned:   { emoji: '⚪', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  terminated: { emoji: '🔴', className: 'bg-red-50 text-red-700 border-red-200' },
  retired:    { emoji: '⚪', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  on_leave:   { emoji: '🟡', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export interface DeactivationReason {
  id: string;
  category: string;
  code: string;
  label: string;
  maps_to_status: UserStatus;
  login_message: string;
  requires_notes: boolean;
}

export const REASON_CATEGORY_LABELS: Record<string, string> = {
  employment: 'Employment Related',
  administrative: 'Administrative',
  operational: 'Operational',
  security: 'Security',
  other: 'Other',
};

export const REASON_CATEGORY_ORDER = ['employment', 'administrative', 'operational', 'security', 'other'];
