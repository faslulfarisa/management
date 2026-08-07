import { BankDetailsValidationService } from './bank-details-validation.service';

describe('BankDetailsValidationService', () => {
  let db: { query: jest.Mock };
  let service: BankDetailsValidationService;

  beforeEach(() => {
    db = { query: jest.fn() };
    service = new BankDetailsValidationService(db as any);
  });

  it('validates payroll run bank details using existing employee email columns', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          employee_id: 'emp-1',
          employee_code: 'EMP001',
          name: 'Aarav Sharma',
          email: 'aarav@example.com',
          branch_id: 'branch-1',
          net_salary: '25000.50',
          bank_account_id: 'bank-1',
          bank_name: 'HDFC',
          account_number_enc: 'enc:v1:AES256GCM:iv:tag:ct',
          verification_status: 'verified',
          upi_id: null,
        },
      ],
    });

    const result = await service.validatePayrollRun('run-1', 'tenant-1');

    expect(db.query.mock.calls[0][0]).toContain('e.personal_email AS email');
    expect(db.query.mock.calls[0][0]).not.toContain('e.work_email');
    expect(db.query.mock.calls[0][1]).toEqual(['run-1', 'tenant-1']);
    expect(result.total).toBe(1);
    expect(result.complete).toEqual([
      expect.objectContaining({
        employee_id: 'emp-1',
        email: 'aarav@example.com',
        account_number_masked: '****',
        net_salary: 25000.5,
        issue: null,
      }),
    ]);
    expect(result.missing).toEqual([]);
    expect(result.incomplete).toEqual([]);
  });

  it('classifies missing and non-verified primary accounts separately', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          employee_id: 'emp-1',
          employee_code: 'EMP001',
          name: 'Missing Account',
          email: null,
          branch_id: 'branch-1',
          net_salary: '10000',
          bank_account_id: null,
          bank_name: null,
          account_number_enc: null,
          verification_status: null,
          upi_id: null,
        },
        {
          employee_id: 'emp-2',
          employee_code: 'EMP002',
          name: 'Pending Account',
          email: 'pending@example.com',
          branch_id: 'branch-1',
          net_salary: '12000',
          bank_account_id: 'bank-2',
          bank_name: 'SBI',
          account_number_enc: '1234567890',
          verification_status: 'pending',
          upi_id: 'emp2@upi',
        },
      ],
    });

    const result = await service.validatePayrollRun('run-1', 'tenant-1');

    expect(result.total).toBe(2);
    expect(result.missing).toEqual([
      expect.objectContaining({ employee_id: 'emp-1', issue: 'missing_bank_account' }),
    ]);
    expect(result.incomplete).toEqual([
      expect.objectContaining({
        employee_id: 'emp-2',
        account_number_masked: '******7890',
        issue: 'unverified_account',
      }),
    ]);
  });
});
