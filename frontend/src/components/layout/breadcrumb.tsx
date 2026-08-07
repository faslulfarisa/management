'use client';

import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNavigationHistoryStore } from '@/store/navigation-history.store';

export function Breadcrumb() {
  const router = useRouter();
  const trail = useNavigationHistoryStore((s) => s.trail);
  const goToIndex = useNavigationHistoryStore((s) => s.goToIndex);

  if (trail.length === 0) return null;

  const isCollapsible = trail.length > 3;

  const handleNavigate = (index: number) => {
    const path = goToIndex(index);
    if (path) router.push(path);
  };

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 overflow-hidden">
      {trail.map((entry, index) => {
        const isLast = index === trail.length - 1;
        const isMiddle = index > 0 && index < trail.length - 1;

        return (
          <span
            key={`${entry.path}-${index}`}
            className={
              isMiddle && isCollapsible
                ? 'hidden sm:flex items-center gap-1.5 min-w-0'
                : 'flex items-center gap-1.5 min-w-0'
            }
          >
            {index > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            {isLast ? (
              <span
                aria-current="page"
                className="text-sm font-semibold text-foreground truncate max-w-[200px]"
              >
                {entry.label}
              </span>
            ) : (
              <button
                onClick={() => handleNavigate(index)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]"
              >
                {entry.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
