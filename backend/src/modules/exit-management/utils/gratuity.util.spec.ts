import { calculateGratuity, calculateYearsOfService } from './gratuity.util';

describe('gratuity.util', () => {
  describe('calculateYearsOfService()', () => {
    it('computes fractional years between joining and last working date', () => {
      expect(calculateYearsOfService('2020-01-01', '2026-01-01')).toBeCloseTo(6, 1);
    });
  });

  describe('calculateGratuity()', () => {
    it('is not eligible under the default 5-year threshold', () => {
      const result = calculateGratuity(50000, '2023-01-01', '2026-01-01');
      expect(result.eligible).toBe(false);
      expect(result.amount).toBe(0);
    });

    it('calculates gratuity using the Payment of Gratuity Act formula at exactly 5 years', () => {
      // 15 * 50000 * 5 / 26 = 144230.77
      const result = calculateGratuity(50000, '2021-01-01', '2026-01-01');
      expect(result.eligible).toBe(true);
      expect(result.amount).toBeCloseTo(144230.77, 1);
    });

    it('rounds up to the next year of service when the remainder is 6+ months', () => {
      // ~5.5 years of service -> rounds to 6 years for the formula
      const result = calculateGratuity(50000, '2020-07-01', '2026-01-01');
      expect(result.eligible).toBe(true);
      // 15 * 50000 * 6 / 26 = 173076.92
      expect(result.amount).toBeCloseTo(173076.92, 1);
    });

    it('respects a custom eligibility threshold from policy config', () => {
      const result = calculateGratuity(50000, '2024-01-01', '2026-01-01', { minYearsOfService: 1 });
      expect(result.eligible).toBe(true);
      expect(result.amount).toBeGreaterThan(0);
    });

    it('returns zero amount when ineligible regardless of basic salary', () => {
      const result = calculateGratuity(1_000_000, '2025-06-01', '2026-01-01');
      expect(result.eligible).toBe(false);
      expect(result.amount).toBe(0);
    });
  });
});
