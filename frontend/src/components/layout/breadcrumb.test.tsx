import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb } from './breadcrumb';
import { useNavigationHistoryStore } from '@/store/navigation-history.store';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('Breadcrumb', () => {
  beforeEach(() => {
    pushMock.mockClear();
    useNavigationHistoryStore.getState().reset();
  });

  it('renders nothing when the trail is empty', () => {
    const { container } = render(<Breadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the trail with the last item non-clickable and current', () => {
    const { push } = useNavigationHistoryStore.getState();
    push('/dashboard/hr/employees', 'Employees');
    push('/dashboard/hr/employees/123', 'Employee Details');
    push('/dashboard/hr/employees/123/attendance', 'Attendance');

    render(<Breadcrumb />);

    const current = screen.getByText('Attendance');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).not.toBe('BUTTON');

    expect(screen.getByText('Employees').tagName).toBe('BUTTON');
    expect(screen.getByText('Employee Details').tagName).toBe('BUTTON');
  });

  it('navigates to the clicked breadcrumb entry and truncates the trail', () => {
    const { push } = useNavigationHistoryStore.getState();
    push('/dashboard/hr/employees', 'Employees');
    push('/dashboard/hr/employees/123', 'Employee Details');
    push('/dashboard/hr/employees/123/attendance', 'Attendance');

    render(<Breadcrumb />);

    fireEvent.click(screen.getByText('Employee Details'));

    expect(pushMock).toHaveBeenCalledWith('/dashboard/hr/employees/123');
    expect(useNavigationHistoryStore.getState().trail).toHaveLength(2);
  });

  it('does not reinsert a workflow page after navigating back to the module page via breadcrumb', () => {
    const { push, goToIndex } = useNavigationHistoryStore.getState();
    push('/dashboard/hr/employees', 'Employees');
    push('/dashboard/hr/employees/123', 'Employee Details');

    goToIndex(0);
    // simulate the tracker recording the resulting navigation
    push('/dashboard/hr/employees', 'Employees');

    expect(useNavigationHistoryStore.getState().trail.map((e) => e.label)).toEqual(['Employees']);
  });
});
