'use client';

import { AdminChrome } from '@/components/layout/admin-chrome';

export default function BranchAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
