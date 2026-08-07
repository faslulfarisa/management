import { BreakPolicyTemplateService } from './break-policy-template.service';

describe('BreakPolicyTemplateService', () => {
  let service: BreakPolicyTemplateService;

  beforeEach(() => {
    service = new BreakPolicyTemplateService();
  });

  it('builds a default policy from the legacy break limits', () => {
    const config = service.validateConfig({});

    expect(config.break_types.some((item) => item.code === 'tea_break')).toBe(true);
    expect(config.limits?.tea_break).toEqual({ allowed_minutes: 15, paid: true });
    expect(config.break_types.find((item) => item.code === 'end_of_shift')).toBeUndefined();
  });

  it('normalizes legacy limits into break types for backward compatibility', () => {
    const config = service.validateConfig({
      limits: {
        tea_break: { allowed_minutes: 20, paid: true },
        custom_unpaid: { allowed_minutes: 5, paid: false },
      },
    });

    expect(config.break_types.find((item) => item.code === 'tea_break')?.allowed_minutes).toBe(20);
    expect(config.break_types.find((item) => item.code === 'custom_unpaid')).toMatchObject({
      name: 'Custom Unpaid',
      category: 'unpaid_break',
      paid: false,
    });
  });

  it('rejects duplicate break codes', () => {
    expect(() => service.validateConfig({
      break_types: [
        { name: 'Tea', code: 'tea_break', allowed_minutes: 10 },
        { name: 'Tea Duplicate', code: 'tea_break', allowed_minutes: 10 },
      ],
    })).toThrow("Duplicate break code 'tea_break'");
  });
});
