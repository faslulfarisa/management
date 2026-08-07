'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useNavigationHistoryStore } from '@/store/navigation-history.store';
import { isTopLevelRoute } from '@/lib/navigation/top-level-routes';

function getFallbackParentPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'branch-admin') {
    if (segments.length <= 3) return '/branch-admin';
    return '/' + segments.slice(0, -1).join('/');
  }
  if (segments.length <= 3) return '/dashboard';
  return '/' + segments.slice(0, -1).join('/');
}

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname() ?? '/dashboard';
  const pop = useNavigationHistoryStore((s) => s.pop);

  // A top-level module page is the root of its own workflow — there is no
  // parent page to return to, so the back button disappears here.
  if (isTopLevelRoute(pathname)) return null;

  const handleClick = () => {
    const path = pop();
    if (path) {
      router.push(path);
      return;
    }
    router.push(getFallbackParentPath(pathname));
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      aria-label="Go back"
      className="gap-1.5 shrink-0"
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
}
