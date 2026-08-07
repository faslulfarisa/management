import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BackButton } from './back-button';
import { useNavigationHistoryStore } from '@/store/navigation-history.store';

const pushMock = vi.fn();
let pathnameMock = '/dashboard/hr/employees/123';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => pathnameMock,
}));

describe('BackButton', () => {
  beforeEach(() => {
    pushMock.mockClear();
    useNavigationHistoryStore.getState().reset();
    pathnameMock = '/dashboard/hr/employees/123';
  });

  it('renders nothing on the dashboard root', () => {
    pathnameMock = '/dashboard';
    const { container } = render(<BackButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on a top-level module page', () => {
    pathnameMock = '/dashboard/hr/employees';
    useNavigationHistoryStore.getState().push('/dashboard/hr/employees', 'Employees');

    const { container } = render(<BackButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no navigation history yet on a top-level page', () => {
    pathnameMock = '/dashboard/hr/attendance';
    const { container } = render(<BackButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pops the trail and navigates to the previous page when history exists', () => {
    const { push } = useNavigationHistoryStore.getState();
    push('/dashboard/hr/employees', 'Employees');
    push('/dashboard/hr/employees/123', 'Employee Details');

    render(<BackButton />);
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(pushMock).toHaveBeenCalledWith('/dashboard/hr/employees');
    expect(useNavigationHistoryStore.getState().trail).toHaveLength(1);
  });

  it('falls back to the derived parent path when there is no trail history', () => {
    render(<BackButton />);
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(pushMock).toHaveBeenCalledWith('/dashboard/hr/employees');
  });

  it('disappears once the user returns to the parent module page (no reopening the detail page)', () => {
    const { push } = useNavigationHistoryStore.getState();
    push('/dashboard/hr/employees', 'Employees');
    push('/dashboard/hr/employees/123', 'Employee Details');

    const { rerender, container } = render(<BackButton />);
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/hr/employees');

    // simulate the router navigating to Employees and the tracker recording it
    pathnameMock = '/dashboard/hr/employees';
    useNavigationHistoryStore.getState().push('/dashboard/hr/employees', 'Employees');
    rerender(<BackButton />);

    expect(container).toBeEmptyDOMElement();
  });
});
