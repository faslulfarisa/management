import { BadRequestException } from '@nestjs/common';
import { HolidayPolicyTemplateService } from './holiday-policy-template.service';

describe('HolidayPolicyTemplateService', () => {
  let db: { query: jest.Mock };
  let auditLog: { log: jest.Mock };
  let service: HolidayPolicyTemplateService;

  beforeEach(() => {
    db = { query: jest.fn() };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new HolidayPolicyTemplateService(db as any, auditLog as any);
  });

  it('rejects duplicate holiday dates within one template', () => {
    expect(() => service.validateConfig({
      year: 2026,
      holidays: [
        { name: 'New Year', date: '2026-01-01', type: 'National Holiday' },
        { name: 'Company Holiday', date: '2026-01-01', type: 'Company Holiday' },
      ],
    })).toThrow(BadRequestException);
  });

  it('rejects invalid template years', () => {
    expect(() => service.validateConfig({ year: 99, holidays: [] })).toThrow(BadRequestException);
  });

  it('duplicates a holiday template for a new year without mutating the source config', async () => {
    const sourceConfig = {
      year: 2026,
      holidays: [{ name: 'New Year', date: '2026-01-01', type: 'National Holiday' }],
    };
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'tpl-1', name: 'Calendar 2026', description: '', notes: '', config: sourceConfig }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tpl-2', name: 'Calendar 2027' }] });

    const result = await service.duplicateTemplate('tenant-1', 'user-1', 'tpl-1', { year: 2027, name: 'Calendar 2027' });

    expect(result.id).toBe('tpl-2');
    expect(sourceConfig.holidays[0].date).toBe('2026-01-01');
    expect(db.query.mock.calls[1][1][3].year).toBe(2027);
    expect(db.query.mock.calls[1][1][3].holidays[0].date).toBe('2027-01-01');
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'template_duplicated' }));
  });

  it('correctly normalizes and preserves the restricted_holiday field in holiday entries', () => {
    const config = {
      year: 2026,
      holidays: [
        { name: 'Restricted Holiday', date: '2026-01-01', type: 'Restricted Holiday', restricted_holiday: true },
        { name: 'Regular Holiday', date: '2026-01-02', type: 'National Holiday', restricted_holiday: false },
      ],
    };
    const validated = service.validateConfig(config);
    expect(validated.holidays[0].restricted_holiday).toBe(true);
    expect(validated.holidays[1].restricted_holiday).toBe(false);
  });
});
