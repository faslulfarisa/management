// Organization lifecycle pipeline tracked by the Internal Operations Portal.
// Stored on tenants.lifecycle_stage (see migrations 099/101), separate from
// tenants.status (login gate) and tenants.approval_status (self-registration
// approval workflow). This is an organization-management pipeline, not a
// sales/CRM funnel — stages run from initial review through to archival.
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

/**
 * Deliberately permissive: ops staff need to skip stages forward or back
 * (e.g. send an active org back to onboarding) rather than being forced
 * through every step. Only rule enforced: `archived` is terminal — matches
 * its "soft-deleted" semantics.
 */
export function canTransitionLifecycleStage(from: OrgLifecycleStage, to: OrgLifecycleStage): boolean {
  if (from === to) return false;
  if (from === 'archived') return false;
  return true;
}

/** tenants.status mirrors the lifecycle stage at its two operational ends. */
export function statusForLifecycleStage(stage: OrgLifecycleStage): 'pending' | 'active' | 'suspended' {
  if (stage === 'active') return 'active';
  if (stage === 'suspended' || stage === 'archived') return 'suspended';
  return 'pending';
}
