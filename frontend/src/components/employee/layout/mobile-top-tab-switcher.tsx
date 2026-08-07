'use client';

import { useRouter } from 'next/navigation';
import { User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminSection } from '@/hooks/use-admin-section';

export function MobileTopTabSwitcher() {
  const router = useRouter();
  const { isAdminDualContext, setSection } = useAdminSection();

  if (!isAdminDualContext) return null;

  const handleSwitchToBranch = () => {
    setSection('branch');
    router.push('/branch-admin');
  };

  return (
    <div
      className="md:hidden flex border-t border-border bg-white"
      role="tablist"
      aria-label="Switch operational context"
    >
      <button
        role="tab"
        aria-selected={true}
        className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors border-b-2 border-violet-600 text-violet-700 bg-violet-50/60"
      >
        <User className="h-4 w-4 shrink-0" />
        My Space
      </button>
      <button
        role="tab"
        aria-selected={false}
        onClick={handleSwitchToBranch}
        className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors text-muted-foreground hover:text-foreground bg-white"
      >
        <Building2 className="h-4 w-4 shrink-0" />
        Branch Mgmt
      </button>
    </div>
  );
}
