import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

export function ComingSoonPanel({
  icon: Icon = Construction,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="ops-panel flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm">{description}</p>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-violet-500 bg-violet-50 border border-violet-200 rounded-full px-3 py-1">
        Coming soon
      </span>
    </div>
  );
}
