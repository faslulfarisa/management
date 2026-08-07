// Username + default-password generation for Bulk User Import.
// Kept as plain functions (no DI) so the same rules can run in a preview
// pass and the actual import without round-tripping through a service.

export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

/** Returns one message per violated rule — empty array means the password is policy-compliant. */
export function validatePasswordPolicy(password: string): string[] {
  const errors: string[] = [];
  const pw = password || '';
  if (pw.length < PASSWORD_POLICY.minLength) errors.push(`At least ${PASSWORD_POLICY.minLength} characters`);
  if (pw.length > PASSWORD_POLICY.maxLength) errors.push(`At most ${PASSWORD_POLICY.maxLength} characters`);
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(pw)) errors.push('At least one uppercase letter');
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(pw)) errors.push('At least one lowercase letter');
  if (PASSWORD_POLICY.requireNumber && !/\d/.test(pw)) errors.push('At least one number');
  if (PASSWORD_POLICY.requireSpecialChar && !/[^A-Za-z0-9]/.test(pw)) errors.push('At least one special character');
  return errors;
}

/** lowercase, accent-stripped, alphanumeric-only — "John D'Souza" -> "johndsouza" */
export function slugifyUsername(fullName: string): string {
  return (fullName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function leadCap(part: string): string {
  const clean = (part || '').replace(/[^A-Za-z0-9]/g, '');
  if (!clean) return '';
  return clean[0].toUpperCase() + clean.slice(1);
}

/** "Rahul" + "Joy" -> "RahulJoy@1234". Satisfies PASSWORD_POLICY as long as the name has letters. */
export function generateDefaultPassword(firstName: string, lastName: string): string {
  const base = `${leadCap(firstName)}${leadCap(lastName)}`;
  return `${base}@1234`;
}
