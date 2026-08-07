export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

export function getPasswordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (s <= 2) return { score: s, label: 'Weak', color: 'bg-red-500' };
  if (s <= 4) return { score: s, label: 'Fair', color: 'bg-amber-500' };
  return { score: s, label: 'Strong', color: 'bg-emerald-500' };
}
