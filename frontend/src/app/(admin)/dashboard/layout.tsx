'use client';

import { AdminChrome } from '@/components/layout/admin-chrome';

// Org selection is a standalone, full-screen page that renders before any
// org context exists — it must not be wrapped in the org-scoped sidebar/header shell.
const NO_CHROME_PATHS = ['/dashboard/select-org'];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdminChrome noChromePaths={NO_CHROME_PATHS}>{children}</AdminChrome>;
}
