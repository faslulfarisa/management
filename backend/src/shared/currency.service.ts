import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
import {
  CURRENCY_BY_CODE,
  DEFAULT_CURRENCY_CODE,
  type CurrencyDefinition,
} from './currency.constants';

export interface CurrencySnapshot {
  currencyCode: string;
  currencySymbol: string;
  currencyMetadata: CurrencyDefinition;
  exchangeRate: string | null;
  baseCurrency: string;
  exchangeRateToBase: string | null;
  exchangeRateSource: string;
  exchangeRateAsOf: string;
  snapshot: Record<string, any>;
}

@Injectable()
export class CurrencyService {
  constructor(private readonly db: DatabaseService) {}

  getDefaultCurrency(): CurrencyDefinition {
    return CURRENCY_BY_CODE.get(DEFAULT_CURRENCY_CODE)!;
  }

  normalizeCurrencyCode(code?: string | null): string {
    const normalized = (code || DEFAULT_CURRENCY_CODE).trim().toUpperCase();
    if (!CURRENCY_BY_CODE.has(normalized)) {
      throw new BadRequestException(`Unsupported currency code '${normalized}'`);
    }
    return normalized;
  }

  getDefinition(code?: string | null): CurrencyDefinition {
    return CURRENCY_BY_CODE.get(this.normalizeCurrencyCode(code))!;
  }

  snapshot(code?: string | null, baseCode?: string | null, source = 'static'): CurrencySnapshot {
    const currency = this.getDefinition(code);
    const baseCurrency = this.getDefinition(baseCode || currency.code);
    const sameCurrency = currency.code === baseCurrency.code;
    const exchangeRateToBase = sameCurrency ? '1' : null;
    const exchangeRateAsOf = new Date().toISOString();
    const snapshot = {
      currency: currency.code,
      currencySymbol: currency.symbol,
      currencyMetadata: currency,
      baseCurrency: baseCurrency.code,
      exchangeRate: exchangeRateToBase,
      exchangeRateToBase,
      exchangeRateSource: source,
      exchangeRateAsOf,
    };
    return {
      currencyCode: currency.code,
      currencySymbol: currency.symbol,
      currencyMetadata: currency,
      exchangeRate: exchangeRateToBase,
      baseCurrency: baseCurrency.code,
      exchangeRateToBase,
      exchangeRateSource: source,
      exchangeRateAsOf,
      snapshot,
    };
  }

  async getTenantCurrency(tenantId: string): Promise<CurrencyDefinition> {
    const { rows } = await this.db.query(
      'SELECT COALESCE(default_currency, currency) AS currency FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId],
    );
    return this.getDefinition(rows[0]?.currency);
  }

  async getTenantCurrencySnapshot(tenantId: string, overrideCode?: string | null): Promise<CurrencySnapshot> {
    const tenantCurrency = await this.getTenantCurrency(tenantId);
    if (overrideCode) {
      return this.snapshot(overrideCode, tenantCurrency.code, 'tenant_override');
    }
    return this.snapshot(tenantCurrency.code, tenantCurrency.code, 'organization_default');
  }
}
