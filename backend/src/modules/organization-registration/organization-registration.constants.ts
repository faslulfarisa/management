/**
 * Fields locked after an organization is approved (Phase 7). Editing any of
 * these via the organization-profile "core info" endpoint creates a change
 * request instead of applying directly, unless the caller is a super admin.
 * Keys are the camelCase request body keys; values are the `tenants` columns.
 */
export const PROTECTED_ORG_FIELDS: Record<string, string> = {
  legalName: 'legal_name',
  tradeName: 'trade_name',
  registrationNumber: 'registration_number',
  gstin: 'gstin',
  panNumber: 'pan_number',
  cinNumber: 'cin_number',
  companyType: 'company_type',
};

export const PROTECTED_ORG_FIELD_KEYS = Object.keys(PROTECTED_ORG_FIELDS);

export function splitProtectedFields<T extends Record<string, any>>(
  data: T,
): { protectedChanges: Partial<T>; directChanges: Partial<T> } {
  const protectedChanges: Partial<T> = {};
  const directChanges: Partial<T> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (PROTECTED_ORG_FIELD_KEYS.includes(key)) {
      (protectedChanges as any)[key] = value;
    } else {
      (directChanges as any)[key] = value;
    }
  }

  return { protectedChanges, directChanges };
}
