import { getPasswordStrength } from '@/lib/password-strength';

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = getPasswordStrength(password);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength.score ? strength.color : 'bg-muted'}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${
        strength.label === 'Strong' ? 'text-emerald-600' :
        strength.label === 'Fair'   ? 'text-amber-600'   : 'text-red-600'
      }`}>
        {strength.label} password
      </p>
    </div>
  );
}
