'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type MobileAdminRouteFallbackProps = {
  desktopHref: string;
};

export function MobileAdminRouteFallback({ desktopHref }: MobileAdminRouteFallbackProps) {
  const router = useRouter();

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      router.replace(desktopHref);
    }
  }, [desktopHref, router]);

  return null;
}
