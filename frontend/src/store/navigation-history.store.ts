import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isTopLevelRoute as isTopLevelRoutePath } from '@/lib/navigation/top-level-routes';
import { resolveLabel } from '@/lib/navigation/route-labels';

export interface NavigationTrailEntry {
  /** pathname + search string, e.g. "/dashboard/hr/employees?page=2" */
  path: string;
  label: string;
}

/**
 * Workflow-oriented navigation history.
 *
 * The trail always starts with the current top-level module page (if any),
 * followed by the child/detail pages drilled into from there. Returning to a
 * top-level module page — whether via push(), pop(), or a breadcrumb click —
 * clears every child page beneath it, so the back button workflow never
 * loops back into pages the user has already left.
 */
interface NavigationHistoryState {
  trail: NavigationTrailEntry[];
  /** Record a forward navigation to `path`. */
  push: (path: string, label: string) => void;
  /** Update the current (last) trail entry in place, e.g. for filter/tab changes. */
  replace: (path: string, label: string) => void;
  /** Remove the current page from history and return the previous page's path, or null if none. */
  pop: () => string | null;
  /** Truncate the trail back to the module-root page for `pathname`. */
  clearUntilModule: (pathname: string) => void;
  /** Truncate the trail to `index` and return that entry's path, or null if out of range. */
  goToIndex: (index: number) => string | null;
  /** Whether `pathname` is a top-level module page with no parent workflow page. */
  isTopLevelRoute: (pathname: string) => boolean;
  reset: () => void;
}

const MAX_TRAIL_LENGTH = 20;

function getPathname(path: string): string {
  const queryIndex = path.indexOf('?');
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

const sessionStorageAvailable = typeof window !== 'undefined';

export const useNavigationHistoryStore = create<NavigationHistoryState>()(
  persist(
    (set, get) => ({
      trail: [],

      push: (path, label) => {
        const pathname = getPathname(path);

        if (isTopLevelRoutePath(pathname)) {
          get().clearUntilModule(pathname);
          const { trail } = get();
          const last = trail[trail.length - 1];
          if (!last || last.path !== path || last.label !== label) {
            set({ trail: [...trail.slice(0, -1), { path, label }] });
          }
          return;
        }

        const { trail } = get();

        if (trail.length === 0) {
          set({ trail: [{ path, label }] });
          return;
        }

        const lastEntry = trail[trail.length - 1];
        if (getPathname(lastEntry.path) === pathname) {
          if (lastEntry.path === path && lastEntry.label === label) return;
          set({ trail: [...trail.slice(0, -1), { path, label }] });
          return;
        }

        // Re-visiting a page already in the trail (e.g. via sidebar) replaces
        // it and discards everything drilled into below it, preventing loops.
        const ancestorIndex = trail.findIndex((entry) => getPathname(entry.path) === pathname);
        if (ancestorIndex !== -1) {
          set({ trail: [...trail.slice(0, ancestorIndex), { path, label }] });
          return;
        }

        const nextTrail = [...trail, { path, label }];
        if (nextTrail.length > MAX_TRAIL_LENGTH) {
          nextTrail.splice(0, nextTrail.length - MAX_TRAIL_LENGTH);
        }
        set({ trail: nextTrail });
      },

      replace: (path, label) => {
        const { trail } = get();
        if (trail.length === 0) {
          set({ trail: [{ path, label }] });
          return;
        }
        set({ trail: [...trail.slice(0, -1), { path, label }] });
      },

      pop: () => {
        const { trail } = get();
        if (trail.length <= 1) return null;
        const nextTrail = trail.slice(0, -1);
        set({ trail: nextTrail });
        return nextTrail[nextTrail.length - 1].path;
      },

      clearUntilModule: (pathname) => {
        const { trail } = get();
        const index = trail.findIndex((entry) => getPathname(entry.path) === pathname);
        if (index !== -1) {
          set({ trail: trail.slice(0, index + 1) });
          return;
        }
        set({ trail: [{ path: pathname, label: resolveLabel(pathname) }] });
      },

      goToIndex: (index) => {
        const { trail } = get();
        if (index < 0 || index >= trail.length) return null;
        const nextTrail = trail.slice(0, index + 1);
        set({ trail: nextTrail });
        return nextTrail[nextTrail.length - 1].path;
      },

      isTopLevelRoute: (pathname) => isTopLevelRoutePath(pathname),

      reset: () => set({ trail: [] }),
    }),
    {
      name: 'navigation-history',
      storage: createJSONStorage(() =>
        sessionStorageAvailable ? sessionStorage : ({
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        } as unknown as Storage)
      ),
    }
  )
);
