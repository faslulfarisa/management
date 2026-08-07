// Internal (platform staff) roles — Marketing / Sales / Technical / Finance /
// Customer Success / Customer Support teams, plus the standalone
// `platform_super_admin` role, who manage the AI-HRMS platform itself across
// every customer organization. Kept strictly separate from the customer-side
// hierarchy in user-hierarchy.constants.ts: internal staff have no tenant
// membership and no branch/org AccessScope.
export const INTERNAL_ROLES = [
  'marketing_executive',
  'marketing_manager',
  'sales_executive',
  'sales_manager',
  'technical_executive',
  'technical_manager',
  'finance_executive',
  'finance_manager',
  'customer_success_executive',
  'customer_success_manager',
  'customer_support_executive',
  'customer_support_manager',
  'platform_super_admin',
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export type InternalTeam = 'marketing' | 'sales' | 'technical' | 'finance' | 'customer_success' | 'customer_support' | 'platform';

export const TEAM_BY_INTERNAL_ROLE: Record<InternalRole, InternalTeam> = {
  marketing_executive: 'marketing',
  marketing_manager: 'marketing',
  sales_executive: 'sales',
  sales_manager: 'sales',
  technical_executive: 'technical',
  technical_manager: 'technical',
  finance_executive: 'finance',
  finance_manager: 'finance',
  customer_success_executive: 'customer_success',
  customer_success_manager: 'customer_success',
  customer_support_executive: 'customer_support',
  customer_support_manager: 'customer_support',
  // Not a team/tier role — a standalone full-access platform identity (the
  // replacement for the old is_super_admin bypass into /operations).
  platform_super_admin: 'platform',
};

export const INTERNAL_ROLE_LABELS: Record<InternalRole, string> = {
  marketing_executive: 'Marketing Executive',
  marketing_manager: 'Marketing Manager',
  sales_executive: 'Sales Executive',
  sales_manager: 'Sales Manager',
  technical_executive: 'Technical Executive',
  technical_manager: 'Technical Manager',
  finance_executive: 'Finance Executive',
  finance_manager: 'Finance Manager',
  customer_success_executive: 'Customer Success Executive',
  customer_success_manager: 'Customer Success Manager',
  customer_support_executive: 'Customer Support Executive',
  customer_support_manager: 'Customer Support Manager',
  platform_super_admin: 'Platform Super Admin',
};
