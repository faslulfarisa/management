/**
 * Catalog of punch-out reasons shown to employees and used to classify
 * break-session behaviour. Mirrored in the frontend at
 * frontend/src/lib/punch-out-reasons.ts — keep both in sync.
 *
 * Categories:
 * - temporary_break:   keeps the attendance session active, starts a break
 *                       timer, expects a punch-back-in.
 * - official_outside:  same as temporary_break but represents field work.
 * - emergency:         same as temporary_break, additionally raises an
 *                       attendance_requests entry for HR visibility.
 * - final_logout:      closes the attendance session for the day (existing
 *                       clockOut behaviour).
 */
export type PunchOutReasonCategory =
  | 'temporary_break'
  | 'official_outside'
  | 'emergency'
  | 'final_logout';

export interface PunchOutReason {
  code: string;
  label: string;
  category: PunchOutReasonCategory;
}

export const PUNCH_OUT_REASONS: PunchOutReason[] = [
  { code: 'tea_break', label: 'Tea Break', category: 'temporary_break' },
  { code: 'lunch_break', label: 'Lunch Break', category: 'temporary_break' },
  { code: 'prayer_break', label: 'Prayer Break', category: 'temporary_break' },
  { code: 'personal_break', label: 'Personal Break', category: 'temporary_break' },
  { code: 'official_outside', label: 'Official Work Outside', category: 'official_outside' },
  { code: 'emergency_leave', label: 'Emergency Leave', category: 'emergency' },
  { code: 'end_of_shift', label: 'End of Shift / Leaving for the Day', category: 'final_logout' },
  { code: 'other', label: 'Other', category: 'temporary_break' },
];

export const PUNCH_OUT_REASON_MAP: Record<string, PunchOutReason> = Object.fromEntries(
  PUNCH_OUT_REASONS.map((r) => [r.code, r]),
);

export function getPunchOutReason(code?: string | null): PunchOutReason | null {
  if (!code) return null;
  return PUNCH_OUT_REASON_MAP[code] ?? null;
}

/**
 * Default per-break-type allowance, used when a tenant has not configured
 * a 'break_policy' template. allowed_minutes: null means unlimited.
 */
export const DEFAULT_BREAK_LIMITS: Record<string, { allowed_minutes: number | null; paid: boolean }> = {
  tea_break: { allowed_minutes: 15, paid: true },
  lunch_break: { allowed_minutes: 45, paid: true },
  prayer_break: { allowed_minutes: 10, paid: true },
  personal_break: { allowed_minutes: 10, paid: false },
  official_outside: { allowed_minutes: null, paid: true },
  emergency_leave: { allowed_minutes: null, paid: false },
  other: { allowed_minutes: null, paid: false },
};
