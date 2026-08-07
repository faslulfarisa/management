import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VacancyService } from './vacancy.service';

describe('VacancyService — lifecycle state-machine guards', () => {
  let db: { query: jest.Mock };
  let notifications: { emit: jest.Mock };
  let currency: { getTenantCurrencySnapshot: jest.Mock; getDefinition: jest.Mock };
  let service: VacancyService;

  beforeEach(() => {
    db = { query: jest.fn() };
    notifications = { emit: jest.fn().mockResolvedValue(undefined) };
    currency = {
      getTenantCurrencySnapshot: jest.fn().mockResolvedValue({ currencyCode: 'INR', currencySymbol: '₹', exchangeRate: null }),
      getDefinition: jest.fn().mockReturnValue({ code: 'INR', symbol: '₹' }),
    };
    service = new VacancyService(db as any, notifications as any, currency as any);
  });

  it('blocks editing a vacancy once it has left draft/rejected (e.g. already open)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'vac-1', tenant_id: 't1', status: 'open' }] }); // getRaw

    await expect(service.update('vac-1', 't1', 'user-1', { title: 'New Title' })).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the vacancy does not exist for this tenant', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.getRaw('missing', 't1')).rejects.toThrow(NotFoundException);
  });

  it('only allows deleting a vacancy while it is still a draft', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'vac-1', tenant_id: 't1', status: 'pending_approval' }] }); // getRaw

    await expect(service.softDelete('vac-1', 't1')).rejects.toThrow(BadRequestException);
  });

  it('rejects closing a vacancy that is not open/on_hold/reopened', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'vac-1', tenant_id: 't1', status: 'draft' }] }); // getRaw

    await expect(service.close('vac-1', 't1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects reopening a vacancy that is not closed', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'vac-1', tenant_id: 't1', status: 'open' }] }); // getRaw

    await expect(service.reopen('vac-1', 't1', 'user-1')).rejects.toThrow(BadRequestException);
  });
});
