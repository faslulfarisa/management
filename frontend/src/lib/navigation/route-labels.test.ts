import { describe, it, expect } from 'vitest';
import { resolveLabel } from './route-labels';

describe('resolveLabel', () => {
  it('resolves the dashboard root', () => {
    expect(resolveLabel('/dashboard')).toBe('Dashboard');
  });

  it('resolves static module routes', () => {
    expect(resolveLabel('/dashboard/hr/employees')).toBe('Employees');
    expect(resolveLabel('/dashboard/finance/gst')).toBe('GST Dashboard');
    expect(resolveLabel('/dashboard/system/settings/integrations')).toBe('Settings · Integrations');
  });

  it('resolves nested static routes over their parent', () => {
    expect(resolveLabel('/dashboard/platform/audit-logs')).toBe('Audit Logs');
    expect(resolveLabel('/dashboard/platform')).toBe('Organization');
  });

  it('labels "new" pages from their parent list page', () => {
    expect(resolveLabel('/dashboard/hr/employees/new')).toBe('New Employee');
  });

  it('labels "edit" pages from their grandparent list page', () => {
    expect(resolveLabel('/dashboard/hr/employees/64f1c2a9b8e4a23456789abc/edit')).toBe('Edit Employee');
  });

  it('labels ID-based detail pages as "{Parent} Details"', () => {
    expect(resolveLabel('/dashboard/hr/employees/64f1c2a9b8e4a23456789abc')).toBe('Employee Details');
    expect(resolveLabel('/dashboard/finance/invoices/12345')).toBe('Invoice Details');
  });

  it('humanizes unknown kebab-case segments', () => {
    expect(resolveLabel('/dashboard/hr/employees/64f1c2a9b8e4a23456789abc/attendance-correction')).toBe(
      'Attendance Correction'
    );
  });
});
