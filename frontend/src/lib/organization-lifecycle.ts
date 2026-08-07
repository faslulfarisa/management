// Frontend mirror of backend/src/shared/organization-lifecycle.constants.ts.
export const ORG_LIFECYCLE_STAGES = [
  'pending_review',
  'pending_approval',
  'onboarding',
  'active',
  'suspended',
  'archived',
] as const;

export type OrgLifecycleStage = (typeof ORG_LIFECYCLE_STAGES)[number];

export const ORG_LIFECYCLE_LABELS: Record<OrgLifecycleStage, string> = {
  pending_review: 'Pending Review',
  pending_approval: 'Pending Approval',
  onboarding: 'Onboarding',
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

/** Mirrors backend canTransitionLifecycleStage — UX-only, backend re-validates. */
export function canTransitionLifecycleStage(from: OrgLifecycleStage, to: OrgLifecycleStage): boolean {
  if (from === to) return false;
  if (from === 'archived') return false;
  return true;
}

export const ORG_LIFECYCLE_BADGE_CLASSES: Record<OrgLifecycleStage, string> = {
  pending_review: 'bg-violet-50 text-violet-700 border-violet-200',
  pending_approval: 'bg-amber-50 text-amber-700 border-amber-200',
  onboarding: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  archived: 'bg-slate-100 text-slate-500 border-slate-200',
};
