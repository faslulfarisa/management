export interface CurrencyDefinition {
  code: string;
  name: string;
  symbol: string;
  country: string;
  locale: string;
  decimalPrecision: number;
  thousandsSeparator: string;
  decimalSeparator: string;
}

export const DEFAULT_CURRENCY_CODE = 'INR';

export const SUPPORTED_CURRENCIES: CurrencyDefinition[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'India', locale: 'en-IN', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States', locale: 'en-US', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'EUR', name: 'Euro', symbol: '€', country: 'European Union', locale: 'de-DE', decimalPrecision: 2, thousandsSeparator: '.', decimalSeparator: ',' },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', country: 'United Kingdom', locale: 'en-GB', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', country: 'United Arab Emirates', locale: 'en-AE', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س', country: 'Saudi Arabia', locale: 'en-SA', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق', country: 'Qatar', locale: 'en-QA', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', country: 'Australia', locale: 'en-AU', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', country: 'Canada', locale: 'en-CA', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', country: 'Japan', locale: 'ja-JP', decimalPrecision: 0, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$', country: 'Singapore', locale: 'en-SG', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', country: 'Malaysia', locale: 'ms-MY', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.' },
];

const CURRENCY_BY_CODE = new Map(SUPPORTED_CURRENCIES.map((currency) => [currency.code, currency]));

export function getCurrencyDefinition(code?: string | null): CurrencyDefinition {
  return CURRENCY_BY_CODE.get((code || DEFAULT_CURRENCY_CODE).toUpperCase()) ?? CURRENCY_BY_CODE.get(DEFAULT_CURRENCY_CODE)!;
}

export function formatCurrency(
  value: number | string | null | undefined,
  currencyCode?: string | null,
  options: Intl.NumberFormatOptions = {},
): string {
  const currency = getCurrencyDefinition(currencyCode);
  const amount = typeof value === 'string' ? Number(value) : value;
  const numericAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;

  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? currency.decimalPrecision,
    ...options,
  }).format(numericAmount);
}
