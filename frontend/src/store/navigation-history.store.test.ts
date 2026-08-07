import { describe, it, expect, beforeEach } from 'vitest';
import { useNavigationHistoryStore } from './navigation-history.store';

describe('navigation-history.store', () => {
  beforeEach(() => {
    useNavigationHistoryStore.getState().reset();
  });

  it('starts with an empty trail', () => {
    expect(useNavigationHistoryStore.getState().trail).toEqual([]);
  });

  describe('push', () => {
    it('appends child pages drilled into from a module page', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');

      expect(useNavigationHistoryStore.getState().trail.map((e) => e.label)).toEqual([
        'Employees',
        'Employee Details',
      ]);
    });

    it('updates the last entry in place when only the search string changes', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees?page=2', 'Employees');

      const trail = useNavigationHistoryStore.getState().trail;
      expect(trail).toHaveLength(1);
      expect(trail[0].path).toBe('/dashboard/hr/employees?page=2');
    });

    it('does not grow the trail when push is called twice with identical args', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees', 'Employees');

      expect(useNavigationHistoryStore.getState().trail).toHaveLength(1);
    });

    it('preserves filters/pagination on the parent page when drilling into a detail page', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees?page=2&status=active', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');

      const trail = useNavigationHistoryStore.getState().trail;
      expect(trail[0].path).toBe('/dashboard/hr/employees?page=2&status=active');
    });

    it('clears child pages when returning to a top-level module page', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');
      push('/dashboard/hr/employees/123/attendance', 'Attendance');

      // user returns to the Employees module page (e.g. via the back button or sidebar)
      push('/dashboard/hr/employees', 'Employees');

      expect(useNavigationHistoryStore.getState().trail.map((e) => e.label)).toEqual(['Employees']);
    });

    it('does not grow the trail across repeated detail <-> module loops', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/456', 'Employee Details');
      push('/dashboard/hr/employees', 'Employees');

      expect(useNavigationHistoryStore.getState().trail.map((e) => e.label)).toEqual(['Employees']);
    });

    it('reuses an existing trail entry and drops everything below it when revisiting a non-top-level ancestor', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');
      push('/dashboard/hr/employees/123/attendance', 'Attendance');

      // user navigates back to the (non-top-level) detail page directly
      push('/dashboard/hr/employees/123', 'Employee Details');

      expect(useNavigationHistoryStore.getState().trail.map((e) => e.label)).toEqual([
        'Employees',
        'Employee Details',
      ]);
    });

    it('does not stack compliance tabs switched from the in-page tab bar', () => {
      const { push } = useNavigationHistoryStore.getState();
      // user was on another module, then clicks "Compliance" in the sidebar
      push('/dashboard/hr/fines', 'Fines & Deductions');
      push('/dashboard/compliance', 'Compliance');

      // switching tabs inside Compliance should replace, not stack
      push('/dashboard/compliance/company-documents', 'Company Documents');
      push('/dashboard/compliance/employee-documents', 'Employee Documents');
      push('/dashboard/compliance/tracker', 'Compliance Tracker');

      expect(useNavigationHistoryStore.getState().trail.map((e) => e.label)).toEqual([
        'Compliance Tracker',
      ]);
    });

    it('caps the trail length at 20 entries', () => {
      const { push } = useNavigationHistoryStore.getState();
      for (let i = 0; i < 25; i++) {
        push(`/dashboard/path-${i}`, `Path ${i}`);
      }

      const trail = useNavigationHistoryStore.getState().trail;
      expect(trail).toHaveLength(20);
      expect(trail[0].label).toBe('Path 5');
      expect(trail[19].label).toBe('Path 24');
    });
  });

  describe('replace', () => {
    it('updates the current entry without growing the trail', () => {
      const { push, replace } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees/123', 'Employee Details');
      replace('/dashboard/hr/employees/123?tab=documents', 'Employee Details');

      const trail = useNavigationHistoryStore.getState().trail;
      expect(trail).toHaveLength(1);
      expect(trail[0].path).toBe('/dashboard/hr/employees/123?tab=documents');
    });
  });

  describe('pop', () => {
    it('returns null when there is only one entry', () => {
      useNavigationHistoryStore.getState().push('/dashboard/hr/employees', 'Employees');
      expect(useNavigationHistoryStore.getState().pop()).toBeNull();
    });

    it('returns null for an empty trail', () => {
      expect(useNavigationHistoryStore.getState().pop()).toBeNull();
    });

    it('removes the current page and returns the previous page path', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');

      const result = useNavigationHistoryStore.getState().pop();

      expect(result).toBe('/dashboard/hr/employees');
      expect(useNavigationHistoryStore.getState().trail).toHaveLength(1);
    });

    it('does not let a second back press reopen a page already exited via back', () => {
      const { push, pop, isTopLevelRoute } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');

      // first back press: Employee Details -> Employees
      const target = pop();
      expect(target).toBe('/dashboard/hr/employees');

      // the router navigates, and the tracker records the resulting page
      push('/dashboard/hr/employees', 'Employees');

      // Employees is a top-level module page: the back button is hidden,
      // and even if invoked, there is nothing left to pop to.
      expect(isTopLevelRoute('/dashboard/hr/employees')).toBe(true);
      expect(useNavigationHistoryStore.getState().pop()).toBeNull();
    });
  });

  describe('clearUntilModule', () => {
    it('truncates the trail to an existing module entry', () => {
      const { push, clearUntilModule } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');

      clearUntilModule('/dashboard/hr/employees');

      expect(useNavigationHistoryStore.getState().trail.map((e) => e.label)).toEqual(['Employees']);
    });

    it('resets the trail to a fresh module entry when not present', () => {
      const { push, clearUntilModule } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees/123', 'Employee Details');

      clearUntilModule('/dashboard/hr/attendance');

      expect(useNavigationHistoryStore.getState().trail).toEqual([
        { path: '/dashboard/hr/attendance', label: 'Attendance' },
      ]);
    });
  });

  describe('goToIndex', () => {
    it('truncates the trail to the given index and returns its path', () => {
      const { push } = useNavigationHistoryStore.getState();
      push('/dashboard/hr/employees', 'Employees');
      push('/dashboard/hr/employees/123', 'Employee Details');
      push('/dashboard/hr/employees/123/attendance', 'Attendance');

      const result = useNavigationHistoryStore.getState().goToIndex(0);

      expect(result).toBe('/dashboard/hr/employees');
      expect(useNavigationHistoryStore.getState().trail).toHaveLength(1);
    });

    it('returns null for an out-of-range index', () => {
      useNavigationHistoryStore.getState().push('/dashboard/hr/employees', 'Employees');
      expect(useNavigationHistoryStore.getState().goToIndex(5)).toBeNull();
      expect(useNavigationHistoryStore.getState().goToIndex(-1)).toBeNull();
    });
  });

  describe('isTopLevelRoute', () => {
    it('identifies sidebar module pages as top-level', () => {
      const { isTopLevelRoute } = useNavigationHistoryStore.getState();
      expect(isTopLevelRoute('/dashboard')).toBe(true);
      expect(isTopLevelRoute('/dashboard/hr/employees')).toBe(true);
      expect(isTopLevelRoute('/dashboard/finance')).toBe(true);
    });

    it('treats detail/edit/sub-pages as non-top-level', () => {
      const { isTopLevelRoute } = useNavigationHistoryStore.getState();
      expect(isTopLevelRoute('/dashboard/hr/employees/123')).toBe(false);
      expect(isTopLevelRoute('/dashboard/hr/employees/123/edit')).toBe(false);
      expect(isTopLevelRoute('/dashboard/finance/invoices/123')).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears the trail', () => {
      useNavigationHistoryStore.getState().push('/dashboard/hr/employees', 'Employees');
      useNavigationHistoryStore.getState().reset();
      expect(useNavigationHistoryStore.getState().trail).toEqual([]);
    });
  });
});
