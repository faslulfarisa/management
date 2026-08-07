// Temporary subscription-plan limit defaults, used until the full
// billing/subscription module assigns a plan to every tenant.
//
// When a tenant has no active row in `tenant_subscriptions`, these
// defaults apply (equivalent to the "Free" plan). Once the billing
// module is live, limits come from `subscription_plans.max_active_branches`
// and these constants only act as the fallback for un-subscribed tenants.

// Free plan: only 1 branch may be operationally active at a time.
export const DEFAULT_MAX_ACTIVE_BRANCHES = 1;
