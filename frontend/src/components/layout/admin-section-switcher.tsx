'use client';

/**
 * AdminSectionSwitcher (desktop)
 *
 * A pill-shaped toggle rendered in the admin Header and in the
 * employee-side shell header for admin / branch_admin users.
 *
 * Features a smooth sliding indicator that follows the active tab.
 *
 * Invisible to org_admin, employee, and platform users.
 */

import { cn } from '@/lib/utils';
import { User, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAdminSection } from '@/hooks/use-admin-section';

const SECTION_OPTIONS = [
  {
    id: 'my-space' as const,
    label: 'My Space',
    icon: User,
    activeColor: 'text-violet-700',
    iconColor: 'text-violet-600',
    title: 'Your personal employee activities',
  },
  {
    id: 'branch' as const,
    label: 'Branch Mgmt',
    icon: Building2,
    activeColor: 'text-blue-700',
    iconColor: 'text-blue-600',
    title: 'Administrative functions for your assigned branch(es)',
  },
];

export function AdminSectionSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const { isAdminDualContext, activeSection, setSection } = useAdminSection();

  if (!isAdminDualContext) return null;

  const handleSwitch = (sectionId: typeof SECTION_OPTIONS[number]['id']) => {
    if (sectionId === activeSection) return;
    setSection(sectionId);
    if (sectionId === 'my-space') {
      router.push('/home');
    } else {
      router.push('/branch-admin');
    }
  };

  return (
    <div
      className={cn(
        'relative flex items-center gap-0 rounded-xl border border-border bg-muted/50 p-0.5 shadow-sm',
        className,
      )}
      role="tablist"
      aria-label="Switch operational context"
    >
      {/* Sliding background pill */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-lg bg-white shadow-sm',
          'transition-[left] duration-200 ease-out',
          activeSection === 'my-space' ? 'left-0.5' : 'left-[calc(50%+1px)]',
        )}
      />

      {SECTION_OPTIONS.map(({ id, label, icon: Icon, activeColor, iconColor, title }) => {
        const isActive = activeSection === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            title={title}
            onClick={() => handleSwitch(id)}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded-lg px-3 py-1.5',
              'text-xs font-semibold transition-colors duration-200',
              'flex-1 justify-center',
              isActive ? activeColor : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-colors duration-200',
                isActive ? iconColor : 'text-muted-foreground',
              )}
            />
            <span className="hidden sm:inline whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
