import { Building2 } from 'lucide-react';

/**
 * Shared left-side branding panel for every (auth) page. Centralizing this
 * (instead of the copy-pasted gradient block each page used to carry) keeps
 * the indigo/slate enterprise palette consistent across login, registration,
 * and password-recovery screens.
 */
export function AuthHeroPanel({
  headline,
  description,
  children,
}: {
  headline: React.ReactNode;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden p-12 text-white"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #312e81 80%, #3730a3 100%)' }}
    >
      {/* decorative glows — cyan + emerald, no gold/amber */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-cyan-400 opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-emerald-500 opacity-15 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
      />

      <div className="relative z-10">
        <AuthBrandMark variant="dark" />
      </div>

      <div className="relative z-10 space-y-8 max-w-md">
        <div>
          <h1 className="text-4xl font-bold leading-tight">{headline}</h1>
          <p className="mt-4 text-white/70 leading-relaxed">{description}</p>
        </div>
        {children}
      </div>

      <div className="relative z-10 text-xs text-white/50">
        © {new Date().getFullYear()} Spinach Informatics. All rights reserved.
      </div>
    </div>
  );
}

export function AuthBrandMark({
  variant = 'dark',
  title = 'AI-HRMS',
  subtitle = 'Human Resource Management System',
}: {
  variant?: 'dark' | 'light';
  title?: string;
  subtitle?: string;
}) {
  const isDark = variant === 'dark';
  return (
    <div className="flex items-center gap-3">
      <div
        className={
          isDark
            ? 'flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-indigo-950 shadow-lg'
            : 'flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white'
        }
      >
        <Building2 className={isDark ? 'h-6 w-6' : 'h-5 w-5'} />
      </div>
      <div>
        <div className={isDark ? 'text-xl font-bold tracking-tight' : 'text-lg font-bold tracking-tight text-foreground'}>
          {title}
        </div>
        <div className={isDark ? 'text-xs text-white/70' : 'text-xs text-muted-foreground'}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

export function HeroFeature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15 backdrop-blur">
        {icon}
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-white/65">{desc}</div>
      </div>
    </div>
  );
}

export function HeroStep({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white ring-1 ring-white/15 backdrop-blur">
        {number}
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-white/65">{desc}</div>
      </div>
    </div>
  );
}
