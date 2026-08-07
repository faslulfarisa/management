import { BadRequestException } from '@nestjs/common';
import { SubscriptionManagementService } from './subscription-management.service';

describe('SubscriptionManagementService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = { sub: '22222222-2222-4222-8222-222222222222' };

  let db: { query: jest.Mock; transaction: jest.Mock };
  let client: { query: jest.Mock };
  let auditLog: { log: jest.Mock; findAll: jest.Mock };
  let billingEngine: { calculateSubscriptionPrice: jest.Mock };
  let currencyService: { getTenantCurrencySnapshot: jest.Mock };
  let service: SubscriptionManagementService;

  beforeEach(() => {
    client = { query: jest.fn() };
    db = {
      query: jest.fn(),
      transaction: jest.fn((fn) => fn(client)),
    };
    auditLog = { log: jest.fn(), findAll: jest.fn() };
    billingEngine = { calculateSubscriptionPrice: jest.fn() };
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
    service = new SubscriptionManagementService(db as any, auditLog as any, billingEngine as any, currencyService as any);
  });

  it('assigns one-off custom subscriptions without using the catalog pricing engine', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: tenantId, name: 'Acme Hotels' }] });
    client.query
      .mockResolvedValueOnce({ rows: [] }) // offer redemption lookup
      .mockResolvedValueOnce({ rows: [] }) // replace active subscriptions
      .mockResolvedValueOnce({ rows: [{ id: '33333333-3333-4333-8333-333333333333', tenant_id: tenantId, subscription_source: 'custom' }] })
      .mockResolvedValueOnce({ rows: [] }) // delete modules
      .mockResolvedValueOnce({ rows: [] }) // delete features
      .mockResolvedValueOnce({ rows: [] }) // delete resources
      .mockResolvedValueOnce({ rows: [] }); // clear trial marker

    const result = await service.assign(
      tenantId,
      {
        mode: 'custom',
        customPlanName: 'Enterprise White Glove',
        billingCycle: 'monthly',
        subscriptionSource: 'custom',
        currentPeriodStart: '2026-07-01T00:00:00.000Z',
        currentPeriodEnd: '2026-08-01T00:00:00.000Z',
        nextBillingDate: '2026-08-01T00:00:00.000Z',
        amount: 25000,
        resourceQuantities: {},
      },
      actor,
    );

    expect(result.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(billingEngine.calculateSubscriptionPrice).not.toHaveBeenCalled();
    expect(client.query.mock.calls[1][0]).toContain('UPDATE tenant_subscriptions');
    expect(client.query.mock.calls[2][1]).toEqual(expect.arrayContaining([tenantId, null, 'monthly']));
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      userId: actor.sub,
      entityType: 'subscription',
      action: 'subscription_assigned',
    }));
  });

  it('rejects subscription dates where the end is before the start', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: tenantId, name: 'Acme Hotels' }] });

    await expect(service.assign(
      tenantId,
      {
        mode: 'custom',
        customPlanName: 'Trial Override',
        billingCycle: 'monthly',
        subscriptionSource: 'free_trial',
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-07-01T00:00:00.000Z',
        nextBillingDate: '2026-08-01T00:00:00.000Z',
        amount: 0,
        resourceQuantities: {},
      },
      actor,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(db.transaction).not.toHaveBeenCalled();
  });
});
