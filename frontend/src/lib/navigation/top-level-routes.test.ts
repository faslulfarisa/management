import { describe, it, expect } from 'vitest';
import { isTopLevelRoute } from './top-level-routes';

describe('isTopLevelRoute', () => {
  it('returns true for sidebar module landing pages', () => {
    expect(isTopLevelRoute('/dashboard')).toBe(true);
    expect(isTopLevelRoute('/dashboard/hr/employees')).toBe(true);
    expect(isTopLevelRoute('/dashboard/hr/attendance')).toBe(true);
    expect(isTopLevelRoute('/dashboard/hr/payroll')).toBe(true);
    expect(isTopLevelRoute('/dashboard/hr/leave')).toBe(true);
    expect(isTopLevelRoute('/dashboard/hr/recruitment')).toBe(true);
    expect(isTopLevelRoute('/dashboard/finance')).toBe(true);
    expect(isTopLevelRoute('/dashboard/reports')).toBe(true);
    expect(isTopLevelRoute('/dashboard/system/settings')).toBe(true);
    expect(isTopLevelRoute('/dashboard/platform')).toBe(true);
  });

  it('returns true for every compliance tab (tabs should not stack in the breadcrumb)', () => {
    expect(isTopLevelRoute('/dashboard/compliance')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/company-documents')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/employee-documents')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/tracker')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/licenses-certifications')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/government-registrations')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/policies')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/expiring')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/renewals')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/templates')).toBe(true);
    expect(isTopLevelRoute('/dashboard/compliance/reports')).toBe(true);
  });

  it('returns false for detail, edit, and "new" pages', () => {
    expect(isTopLevelRoute('/dashboard/hr/employees/123')).toBe(false);
    expect(isTopLevelRoute('/dashboard/hr/employees/123/edit')).toBe(false);
    expect(isTopLevelRoute('/dashboard/hr/employees/new')).toBe(false);
    expect(isTopLevelRoute('/dashboard/finance/invoices/123')).toBe(false);
  });

  it('returns false for non-sidebar sub-sections of a module', () => {
    expect(isTopLevelRoute('/dashboard/system/settings/integrations')).toBe(false);
  });
});
