import { type Country } from 'react-phone-number-input';
import {
  getCountryCallingCode,
  getExampleNumber,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json';

export interface PhoneValidationOptions {
  required?: boolean;
  defaultCountry?: Country;
}

export interface AddressValidationOptions {
  required?: boolean;
  requiredFields?: Array<'line1' | 'country' | 'state' | 'city' | 'postalCode'>;
  postalCodePattern?: RegExp;
}

export interface AddressLike {
  line1?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  pincode?: string | null;
  postal_code?: string | null;
}

export function validatePhoneNumber(value: string | null | undefined, options: PhoneValidationOptions = {}) {
  const phone = value?.trim() ?? '';
  if (!phone) return options.required ? 'Phone number is required' : '';
  return '';
}

export function limitPhoneNumberToCountryDigits(value: string, country?: Country): string {
  if (!value || !country || !value.startsWith('+')) return value;

  const expectedLength = getExpectedNationalNumberLength(country);
  if (!expectedLength) return value;

  const callingCode = getCountryCallingCode(country as any);
  const prefix = `+${callingCode}`;
  if (!value.startsWith(prefix)) return value;

  const nationalDigits = value.slice(prefix.length).replace(/\D/g, '');
  if (nationalDigits.length <= expectedLength) return value;

  return `${prefix}${nationalDigits.slice(0, expectedLength)}`;
}

export function limitPhoneInputTextToCountryDigits(value: string, country?: Country): string {
  const expectedLength = country ? getExpectedNationalNumberLength(country) : undefined;
  if (!value || !country || !expectedLength) return value;

  const nationalDigits = getNationalPhoneDigits(value, country);
  if (nationalDigits.length <= expectedLength) return value;

  const callingCode = getCountryCallingCode(country as any);
  const prefix = value.trimStart().startsWith('+') ? `+${callingCode}` : callingCode;
  return `${prefix} ${nationalDigits.slice(0, expectedLength)}`;
}

export function getNationalPhoneDigits(value: string, country?: Country): string {
  const digits = value.replace(/\D/g, '');
  if (!country) return digits;

  const callingCode = getCountryCallingCode(country as any);
  return digits.startsWith(callingCode) ? digits.slice(callingCode.length) : digits;
}

export function getExpectedNationalNumberLength(country: Country): number | undefined {
  return getExampleNumber(country as any, examples)?.nationalNumber.length;
}

export function validateAddress(value: AddressLike, options: AddressValidationOptions = {}) {
  const requiredFields = options.requiredFields ?? (options.required ? ['line1', 'country', 'state', 'city', 'postalCode'] : []);
  const errors: Partial<Record<'line1' | 'country' | 'state' | 'city' | 'postalCode', string>> = {};

  const postalCode = value.postal_code ?? value.pincode ?? '';
  const values = {
    line1: value.line1 ?? '',
    country: value.country ?? '',
    state: value.state ?? '',
    city: value.city ?? '',
    postalCode,
  };

  requiredFields.forEach((field) => {
    if (!String(values[field]).trim()) errors[field] = 'Required';
  });

  if (postalCode && options.postalCodePattern && !options.postalCodePattern.test(postalCode)) {
    errors.postalCode = 'Enter a valid postal code';
  }

  return errors;
}
