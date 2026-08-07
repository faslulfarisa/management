import { BadRequestException } from '@nestjs/common';
import { SubscriptionInvoiceService } from './subscription-invoice.service';

describe('SubscriptionInvoiceService', () => {
  let db: { query: jest.Mock; transaction: jest.Mock };
  let auditLog: { log: jest.Mock; findAll: jest.Mock };
  let currencyService: { getTenantCurrencySnapshot: jest.Mock };
  let service: SubscriptionInvoiceService;

  beforeEach(() => {
    db = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    auditLog = {
      log: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    };
    currencyService = {
      getTenantCurrencySnapshot: jest.fn().mockResolvedValue({
        currencyCode: 'INR',
        currencySymbol: 'INR',
        exchangeRate: '1',
        baseCurrency: 'INR',
        exchangeRateToBase: '1',
        exchangeRateSource: 'organization_default',
        exchangeRateAsOf: '2026-07-14T00:00:00.000Z',
        snapshot: { currency: 'INR', baseCurrency: 'INR', exchangeRate: '1' },
      }),
    };
    service = new SubscriptionInvoiceService(db as any, auditLog as any, currencyService as any);
  });

  it('creates a pending invoice from the active subscription with default tax', async () => {
    const tenantId = 'tenant-1';
    const subscription = { id: 'sub-1', tenant_id: tenantId, amount: '100.00' };
    const created = {
      id: 'invoice-1',
      tenant_id: tenantId,
      subscription_id: subscription.id,
      invoice_number: 'INV-0001',
      amount: '100.00',
      tax_amount: '18.00',
      total_amount: '118.00',
      status: 'pending',
    };
    const client = { query: jest.fn() };

    db.query.mockResolvedValueOnce({ rows: [{ id: tenantId }] });
    db.transaction.mockImplementation(async (callback) => callback(client));
    client.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM tenant_subscriptions')) return { rows: [subscription] };
      if (sql.includes('SELECT COUNT(*)::int')) return { rows: [{ count: 0 }] };
      if (sql.includes('SELECT 1 FROM subscription_invoices')) return { rows: [] };
      if (sql.includes('INSERT INTO subscription_invoices')) {
        expect(params?.[3]).toBe(100);
        expect(params?.[4]).toBe(18);
        expect(params?.[5]).toBe(118);
        return { rows: [created] };
      }
      return { rows: [] };
    });

    await expect(service.create({ tenantId, dueDate: '2026-07-20T00:00:00.000Z' }, { sub: 'user-1' })).resolves.toEqual(created);
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      entityType: 'subscription_invoice',
      entityId: created.id,
      action: 'subscription_invoice_created',
    }));
  });

  it('does not edit non-pending invoices', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'invoice-1', status: 'paid' }] });

    await expect(
      service.update('invoice-1', { amount: 50 }, { sub: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks pending invoices paid and records a completed payment transaction', async () => {
    const pending = { id: 'invoice-1', tenant_id: 'tenant-1', status: 'pending', total_amount: '118.00' };
    const paid = { ...pending, status: 'paid', payment_method: 'upi', payment_reference: 'TXN-1' };
    const payment = { id: 'payment-1', invoice_id: pending.id, status: 'completed' };
    const client = { query: jest.fn() };

    db.transaction.mockImplementation(async (callback) => callback(client));
    client.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FOR UPDATE')) return { rows: [pending] };
      if (sql.includes('UPDATE subscription_invoices')) return { rows: [paid] };
      if (sql.includes('INSERT INTO payment_transactions')) {
        expect(params).toEqual([
          'tenant-1',
          'invoice-1',
          '118.00',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          '{}',
          'manual',
          'TXN-1',
        ]);
        return { rows: [payment] };
      }
      return { rows: [] };
    });

    await expect(
      service.markPaid('invoice-1', { paymentMethod: 'upi', paymentReference: 'TXN-1' }, { sub: 'user-1' }),
    ).resolves.toEqual(paid);
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      action: 'subscription_invoice_paid',
    }));
  });

  it('does not void non-pending invoices', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'invoice-1', status: 'paid' }] });

    await expect(
      service.void('invoice-1', { reason: 'Duplicate' }, { sub: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
