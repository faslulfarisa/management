'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HistoricalAttendanceImportRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/biometrics/historical-attendance-import');
  }, [router]);

  return null;
}
