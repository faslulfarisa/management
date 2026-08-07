'use client';

/**
 * useAdminSection
 *
 * Thin hook that combines auth state with the admin section store.
 * Returns whether the current user is an admin/branch_admin who should
 * see the dual-context switcher, and the current active section.
 *
 * Safe to call from any component — returns isAdminDualContext=false
 * for org_admin, employee, and platform users.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useAdminSectionStore, type AdminSection } from '@/store/admin-section.store';

/** User types that get the My Space / Branch Management dual-context UI. */
const DUAL_CONTEXT_TYPES = new Set(['admin', 'branch_admin']);

export function useAdminSection() {
  const { userType, _hydrated } = useAuthStore();
  const { activeSection, setSection, initSection, resetSection } = useAdminSectionStore();

  const isAdminDualContext = DUAL_CONTEXT_TYPES.has(userType);

  // Restore persisted section once auth is hydrated.
  useEffect(() => {
    if (_hydrated && isAdminDualContext) {
      initSection();
    }
  }, [_hydrated, isAdminDualContext, initSection]);

  return {
    /** True only for admin and branch_admin user types. */
    isAdminDualContext,
    /** The currently active section. Always 'branch' for non-dual-context users. */
    activeSection: isAdminDualContext ? activeSection : 'branch' as AdminSection,
    /** Switch to a section (no-op for non-dual-context users). */
    setSection: isAdminDualContext ? setSection : (_s: AdminSection) => {},
    /** Reset section to 'branch' (call on logout). */
    resetSection,
  };
}
