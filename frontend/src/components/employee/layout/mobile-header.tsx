'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

import { MobileTopTabSwitcher } from '@/components/employee/layout/mobile-top-tab-switcher';

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  className?: string;
}

export function MobileHeader({ title, showBack, rightAction, className }: MobileHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border flex flex-col">
      <div
        className={cn(
          'flex h-14 items-center gap-2 px-4',
          className,
        )}
      >
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -ml-1"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <h1 className={cn('flex-1 text-base font-semibold text-foreground', showBack && 'ml-0')}>
          {title}
        </h1>

        {rightAction && <div className="flex items-center gap-1">{rightAction}</div>}
      </div>
      <MobileTopTabSwitcher />
    </header>
  );
}
