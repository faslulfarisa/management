'use client';

/* ── Themed helpers shared across the Notification Center tabs ─────────── */

export function StatCard({ label, value, sub, gradient, icon: Icon }: {
  label: string; value: string | number; sub?: string; gradient: string; icon: React.ElementType;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg animate-slide-up ${gradient}`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="relative z-10">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-3xl font-bold tracking-tight mb-0.5">{value}</p>
        <p className="text-sm font-medium opacity-90">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export function Spinner({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
      <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <p className="text-sm text-muted-foreground font-medium">{message}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Icon className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function TabBar({ tabs, active, onChange }: { tabs: { key: string; label: string; badge?: number }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit overflow-x-auto max-w-full">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
            active === t.key
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span className="ml-1.5 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Priority / type badges ──────────────────────────────────────────────── */

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function PriorityBadge({ priority }: { priority?: string | null }) {
  const key = priority || 'medium';
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[key] ?? PRIORITY_STYLES.medium}`}>
      {key}
    </span>
  );
}

const TYPE_STYLES: Record<string, string> = {
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-800 border-red-300',
  approval: 'bg-purple-50 text-purple-700 border-purple-200',
  system: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function TypeBadge({ type }: { type?: string | null }) {
  const key = type || 'info';
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${TYPE_STYLES[key] ?? TYPE_STYLES.info}`}>
      {key}
    </span>
  );
}

/* ── Misc ─────────────────────────────────────────────────────────────────── */

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Generic card wrapper used by every sub-category section within a tab. */
export function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="p-1.5">{children}</div>
    </div>
  );
}
