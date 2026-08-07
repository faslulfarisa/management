/**
 * Admin Section Store
 *
 * Tracks whether an admin / branch_admin user is currently viewing
 * "My Space" (personal employee activities) or "Branch Management"
 * (administrative functions for their assigned branch(es)).
 *
 * Only meaningful for `admin` and `branch_admin` user types.
 * All other roles should ignore this store entirely.
 *
 * Persisted to sessionStorage so the selection survives page refresh
 * but resets when the browser tab is closed or the user logs out.
 */

import { create } from 'zustand';

export type AdminSection = 'my-space' | 'branch';

const SESSION_KEY = 'admin_active_section';

interface AdminSectionState {
  activeSection: AdminSection;
  setSection: (section: AdminSection) => void;
  /** Call once on mount (after auth hydration) to restore from sessionStorage. */
  initSection: () => void;
  /** Call on logout to clear persisted state. */
  resetSection: () => void;
}

export const useAdminSectionStore = create<AdminSectionState>((set) => ({
  // Default to 'branch' so first-time login behaviour is unchanged.
  activeSection: 'branch',

  setSection: (section: AdminSection) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, section);
    }
    set({ activeSection: section });
  },

  initSection: () => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(SESSION_KEY) as AdminSection | null;
    if (stored === 'my-space' || stored === 'branch') {
      set({ activeSection: stored });
    }
  },

  resetSection: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
    }
    set({ activeSection: 'branch' });
  },
}));
