'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { User, Building2 } from 'lucide-react';
import { useAdminSection } from '@/hooks/use-admin-section';

/**
 * AdminContextBanner
 *
 * A compact section-switcher pill rendered inside the employee-side shell
 * (desktop sidebar top, mobile bottom-of-header) when an admin / branch_admin
 * user is viewing My Space. Allows switching back to Branch Management
 * without logging out or navigating away manually.
 *
 * Invisible to regular employees and org_admin users.
 */
export function AdminContextBanner({ className }: { className?: string }) {
  const router = useRouter();
  const { isAdminDualContext, activeSection, setSection } = useAdminSection();

  if (!isAdminDualContext) return null;

  const handleSwitch = (section: 'my-space' | 'branch') => {
    if (section === activeSection) return;
    setSection(section);
    if (section === 'my-space') {
      router.push('/home');
    } else {
      router.push('/branch-admin');
    }
  };

  return (
    <div
      className={cn(
        'relative flex items-center rounded-xl border border-border bg-muted/50 p-0.5',
        className,
      )}
      role="tablist"
      aria-label="Switch operational context"
    >
      {/* Sliding pill indicator */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-lg bg-white shadow-sm',
          'transition-[left] duration-200 ease-out',
          activeSection === 'my-space' ? 'left-0.5' : 'left-[calc(50%+1px)]',
        )}
      />
      <button
        role="tab"
        aria-selected={activeSection === 'my-space'}
        onClick={() => handleSwitch('my-space')}
        className={cn(
          'relative z-10 flex flex-1 items-center justify-center gap-1.5',
          'rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors duration-200',
          activeSection === 'my-space'
            ? 'text-violet-700'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <User className={cn(
          'h-3 w-3 shrink-0 transition-colors duration-200',
          activeSection === 'my-space' ? 'text-violet-600' : 'text-muted-foreground',
        )} />
        My Space
      </button>
      <button
        role="tab"
        aria-selected={activeSection === 'branch'}
        onClick={() => handleSwitch('branch')}
        className={cn(
          'relative z-10 flex flex-1 items-center justify-center gap-1.5',
          'rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors duration-200',
          activeSection === 'branch'
            ? 'text-blue-700'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Building2 className={cn(
          'h-3 w-3 shrink-0 transition-colors duration-200',
          activeSection === 'branch' ? 'text-blue-600' : 'text-muted-foreground',
        )} />
        Branch Mgmt
      </button>
    </div>
  );
}
