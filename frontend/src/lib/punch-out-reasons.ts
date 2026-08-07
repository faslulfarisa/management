/**
 * Catalog of punch-out reasons shown to employees. Mirrors
 * backend/src/modules/hr/constants/punch-out-reasons.ts — keep both in sync.
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
