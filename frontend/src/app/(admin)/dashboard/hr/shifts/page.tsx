'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ShiftsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/hr/schedules');
  }, [router]);
  return null;
}
