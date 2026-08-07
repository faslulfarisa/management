'use client';

import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';
import './phone-number-input.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** International phone input with country flag, code selector and searchable country list. Defaults to India (+91). */
export default function PhoneNumberInput({ value, onChange, placeholder, disabled, className = '' }: Props) {
  return (
    <PhoneInput
      international
      flags={flags}
      defaultCountry="IN"
      countrySelectProps={{ unicodeFlags: false }}
      value={value || undefined}
      onChange={v => onChange(v || '')}
      placeholder={placeholder || 'Enter phone number'}
      disabled={disabled}
      className={`ai-hrms-phone-input ${className}`}
    />
  );
}
