import { BadRequestException } from '@nestjs/common';
import { EmployeeConversionService } from './employee-conversion.service';

describe('EmployeeConversionService — convert() validation and EmployeeService delegation', () => {
  let db: { query: jest.Mock };
  let employeeService: { create: jest.Mock };
  let auditLog: { log: jest.Mock };
  let notifications: { emit: jest.Mock };
  let service: EmployeeConversionService;

  const baseApplication = {
    id: 'app-1', tenant_id: 't1', vacancy_id: null, converted_employee_id: null,
    status: 'hired', first_name: 'Jane', last_name: 'Doe', candidate_email: 'jane@example.com', candidate_phone: '555-0100',
  };

  beforeEach(() => {
    db = { query: jest.fn() };
    employeeService = { create: jest.fn().mockResolvedValue({ id: 'emp-1', employee_code: 'EMP001' }) };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new EmployeeConversionService(db as any, employeeService as any, auditLog as any, notifications as any);
  });

  it('blocks conversion when the application was already converted', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...baseApplication, converted_employee_id: 'emp-existing' }] }) // application lookup
      .mockResolvedValueOnce({ rows: [] }) // offers lookup
      .mockResolvedValueOnce({ rows: [] }); // preboarding lookup

    await expect(service.convert('app-1', 't1', 'user-1', {})).rejects.toThrow(BadRequestException);
    expect(employeeService.create).not.toHaveBeenCalled();
  });

  it('blocks conversion when the application status is not hired', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...baseApplication, status: 'shortlisted' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.convert('app-1', 't1', 'user-1', {})).rejects.toThrow(BadRequestException);
    expect(employeeService.create).not.toHaveBeenCalled();
  });

  it('blocks conversion when no date of joining is available from overrides, preboarding, or the offer', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...baseApplication }] })
      .mockResolvedValueOnce({ rows: [] }) // no accepted offer
      .mockResolvedValueOnce({ rows: [] }); // no preboarding row

    await expect(service.convert('app-1', 't1', 'user-1', {})).rejects.toThrow(BadRequestException);
    expect(employeeService.create).not.toHaveBeenCalled();
  });

  it('calls EmployeeService.create with merged candidate/offer/preboarding data and stamps converted_employee_id/converted_at', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...baseApplication }] }) // application lookup
      .mockResolvedValueOnce({ rows: [{ employment_type_id: 'et-1', designation: 'Engineer', joining_date: '2026-01-01' }] }) // accepted offer
      .mockResolvedValueOnce({ rows: [{ bank_details: { bank_name: 'Test Bank' }, emergency_contact: {}, joining_date: null }] }) // preboarding
      .mockResolvedValueOnce({ rows: [] }); // UPDATE applications

    const employee = await service.convert('app-1', 't1', 'user-1', {});

    expect(employee).toEqual({ id: 'emp-1', employee_code: 'EMP001' });
    expect(employeeService.create).toHaveBeenCalledWith(
      't1', 'user-1',
      expect.objectContaining({
        first_name: 'Jane', last_name: 'Doe', personal_email: 'jane@example.com',
        date_of_joining: '2026-01-01', bank_name: 'Test Bank', employment_type_id: 'et-1',
      }),
    );
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'converted_to_employee', entityId: 'app-1' }));
    // No vacancy on this application -> no recruiter/hiring-manager notification lookup or emit.
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('lets explicit overrides take precedence over candidate/offer/preboarding defaults', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...baseApplication }] })
      .mockResolvedValueOnce({ rows: [{ employment_type_id: 'et-1', designation: 'Engineer', joining_date: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.convert('app-1', 't1', 'user-1', { date_of_joining: '2026-03-15', first_name: 'Janet' } as any);

    expect(employeeService.create).toHaveBeenCalledWith(
      't1', 'user-1',
      expect.objectContaining({ first_name: 'Janet', date_of_joining: '2026-03-15' }),
    );
  });
});
