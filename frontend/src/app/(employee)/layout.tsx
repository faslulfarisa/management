import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { EmployeeWebShell } from '@/components/employee/web/employee-web-shell';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <EmployeeGuard>
      <EmployeeWebShell>{children}</EmployeeWebShell>
    </EmployeeGuard>
  );
}
