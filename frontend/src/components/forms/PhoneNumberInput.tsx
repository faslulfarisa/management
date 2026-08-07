'use client';

import { forwardRef, useMemo, useState, type InputHTMLAttributes } from 'react';
import PhoneInput, {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumber,
  type Country,
} from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';
import './phone-number-input.css';
import {
  getExpectedNationalNumberLength,
  getNationalPhoneDigits,
  limitPhoneInputTextToCountryDigits,
  limitPhoneNumberToCountryDigits,
  validatePhoneNumber,
} from '@/lib/contact-validation';

interface Props {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: Country;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  error?: string;
  helperText?: string;
  validate?: boolean;
  className?: string;
  ariaLabel?: string;
}

export default function PhoneNumberInput({
  value,
  onChange,
  defaultCountry = 'IN',
  required = false,
  disabled = false,
  readOnly = false,
  placeholder = 'Enter phone number',
  error,
  helperText,
  validate = false,
  className = '',
  ariaLabel,
}: Props) {
  const [selectedCountry, setSelectedCountry] = useState<Country | undefined>(() => detectCountryFromValue(value, defaultCountry) || defaultCountry);
  const activeCountry = selectedCountry || defaultCountry;
  const inputKey = useMemo(() => `${activeCountry || 'intl'}-${defaultCountry}`, [activeCountry, defaultCountry]);
  const LimitedPhoneInput = useMemo(
    () => createLimitedPhoneInput(activeCountry),
    [activeCountry],
  );
  const validationError = validate ? validatePhoneNumber(value, { required, defaultCountry }) : '';
  const displayError = error || validationError;

  const handleChange = (nextValue?: string) => {
    const candidateValue = nextValue || '';
    const normalizedValue = limitPhoneNumberToCountryDigits(candidateValue, selectedCountry || defaultCountry);
    const detectedCountry = detectCountryFromValue(normalizedValue, selectedCountry || defaultCountry);

    if (detectedCountry && detectedCountry !== selectedCountry) {
      setSelectedCountry(detectedCountry);
    } else if (!normalizedValue && selectedCountry !== defaultCountry) {
      setSelectedCountry(defaultCountry);
    }

    onChange(normalizedValue);
  };

  return (
    <div className={className}>
      <PhoneInput
        key={inputKey}
        international
        flags={flags}
        defaultCountry={activeCountry}
        countrySelectProps={{ unicodeFlags: false, 'aria-label': 'Country calling code' } as any}
        value={value || undefined}
        onChange={handleChange}
        onCountryChange={country => setSelectedCountry(country || defaultCountry)}
        inputComponent={LimitedPhoneInput}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        className={`ai-hrms-phone-input ${displayError ? 'PhoneInput--error' : ''}`}
      />
      {displayError ? (
        <p className="mt-1 text-xs text-destructive">{displayError}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}

function detectCountryFromValue(value: string | null | undefined, preferredCountry?: Country): Country | undefined {
  const normalizedValue = value?.trim();
  if (!normalizedValue?.startsWith('+')) return undefined;

  const parsedCountry = parsePhoneNumber(normalizedValue)?.country;
  if (parsedCountry) return parsedCountry;

  const digits = normalizedValue.replace(/[^\d+]/g, '').slice(1);
  if (!digits) return undefined;

  const matches = getCountries()
    .map(country => ({ country, callingCode: getCountryCallingCode(country) }))
    .filter(({ callingCode }) => digits.startsWith(callingCode))
    .sort((a, b) => b.callingCode.length - a.callingCode.length);

  if (!matches.length) return undefined;

  const preferredMatch = preferredCountry
    ? matches.find(({ country }) => country === preferredCountry)
    : undefined;

  return preferredMatch?.country || matches[0].country;
}

function createLimitedPhoneInput(country?: Country) {
  return forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function LimitedPhoneInput(
    { onBeforeInput, onChange, onPaste, ...props },
    ref,
  ) {
    const maxNationalDigits = country ? getExpectedNationalNumberLength(country) : undefined;

    const trimInputValue = (input: HTMLInputElement) => {
      const limitedValue = limitPhoneInputTextToCountryDigits(input.value, country);
      if (limitedValue === input.value) return;

      input.value = limitedValue;
      const caretPosition = limitedValue.length;
      requestAnimationFrame(() => {
        input.setSelectionRange(caretPosition, caretPosition);
      });
    };

    return (
      <input
        {...props}
        ref={ref}
        onBeforeInput={(event) => {
          onBeforeInput?.(event);
          if (event.defaultPrevented || !maxNationalDigits) return;

          const incomingDigits = ((event.nativeEvent as InputEvent).data || '').replace(/\D/g, '').length;
          if (!incomingDigits) return;

          const input = event.currentTarget;
          const selectionStart = input.selectionStart ?? input.value.length;
          const selectionEnd = input.selectionEnd ?? selectionStart;
          const selectedDigits = getNationalPhoneDigits(input.value.slice(selectionStart, selectionEnd), country).length;
          const nextDigitCount = getNationalPhoneDigits(input.value, country).length - selectedDigits + incomingDigits;

          if (nextDigitCount > maxNationalDigits) {
            event.preventDefault();
          }
        }}
        onChange={(event) => {
          trimInputValue(event.currentTarget);
          onChange?.(event);
        }}
        onPaste={(event) => {
          onPaste?.(event);
          requestAnimationFrame(() => trimInputValue(event.currentTarget));
        }}
      />
    );
  });
}
