import { Check } from 'lucide-react';

const STEPS = ['Account', 'Verify Email', 'Organization', 'Submitted'];

/**
 * Macro progress indicator for the whole signup journey, spanning multiple
 * pages (account → verify-email → organization wizard → pending). The
 * organization wizard page additionally has its own micro-stepper for its
 * internal sub-steps.
 */
export function RegistrationProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="mb-8 flex items-center" aria-label={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]}`}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                  done
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : active
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-border text-muted-foreground'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </div>
              <span className={`text-[11px] font-medium whitespace-nowrap ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {n < STEPS.length && <div className={`mx-2 h-0.5 flex-1 ${done ? 'bg-indigo-600' : 'bg-border'}`} />}
          </div>
        );
      })}
    </div>
  );
}
