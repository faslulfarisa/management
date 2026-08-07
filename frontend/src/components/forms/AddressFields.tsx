'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { City as CityT, Country as CountryT, State as StateT } from 'country-state-city';
import { Input } from '@/components/ui/input';
import SearchableSelect from './SearchableSelect';

type Csc = { Country: typeof CountryT; State: typeof StateT; City: typeof CityT };

export interface AddressValue {
  line1?: string;
  line2?: string;
  landmark?: string;
  country?: string;
  countryCode?: string;
  state?: string;
  stateCode?: string;
  city?: string;
  pincode?: string;
  postal_code?: string;
  notes?: string;
  text?: string;
}

interface Props {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  showLine2?: boolean;
  showLandmark?: boolean;
  showPostalCode?: boolean;
  showCountry?: boolean;
  showNotes?: boolean;
  postalCodeKey?: 'pincode' | 'postal_code';
  labelPrefix?: string;
  className?: string;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
      {children}{required ? <span className="text-destructive"> *</span> : null}
    </label>
  );
}

function postalCodeOf(value: AddressValue) {
  return value.postal_code ?? value.pincode ?? '';
}

export default function AddressFields({
  value,
  onChange,
  disabled,
  readOnly,
  required,
  showLine2 = true,
  showLandmark = false,
  showPostalCode = true,
  showCountry = true,
  showNotes = false,
  postalCodeKey,
  labelPrefix,
  className = '',
}: Props) {
  const seededRef = useRef(false);
  const [csc, setCsc] = useState<Csc | null>(null);

  useEffect(() => {
    import('country-state-city').then(setCsc);
  }, []);

  useEffect(() => {
    if (!seededRef.current && !value.line1 && value.text) {
      seededRef.current = true;
      onChange({ ...value, line1: value.text });
    }
  }, [value, onChange]);

  const countries = useMemo(() => csc?.Country.getAllCountries() ?? [], [csc]);
  const states = useMemo(
    () => (csc && value.countryCode ? csc.State.getStatesOfCountry(value.countryCode) : []),
    [csc, value.countryCode],
  );
  const cities = useMemo(
    () => (csc && value.countryCode && value.stateCode ? csc.City.getCitiesOfState(value.countryCode, value.stateCode) : []),
    [csc, value.countryCode, value.stateCode],
  );

  const set = useCallback((patch: Partial<AddressValue>) => onChange({ ...value, ...patch }), [onChange, value]);

  useEffect(() => {
    if (!csc || value.countryCode || !value.country) return;
    const country = countries.find(item => item.name.toLowerCase() === value.country?.toLowerCase());
    if (country) set({ countryCode: country.isoCode });
  }, [csc, countries, set, value.country, value.countryCode]);

  useEffect(() => {
    if (!csc || value.stateCode || !value.state || !value.countryCode) return;
    const state = states.find(item => item.name.toLowerCase() === value.state?.toLowerCase());
    if (state) set({ stateCode: state.isoCode });
  }, [csc, states, set, value.countryCode, value.state, value.stateCode]);

  const setPostalCode = (postalCode: string) => {
    const key = postalCodeKey ?? (Object.prototype.hasOwnProperty.call(value, 'postal_code') ? 'postal_code' : 'pincode');
    set({ [key]: postalCode } as Partial<AddressValue>);
  };

  const inputDisabled = disabled || readOnly;
  const prefix = labelPrefix ? `${labelPrefix} ` : '';

  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${className}`}>
      <div className={showLine2 ? 'md:col-span-2' : 'md:col-span-3'}>
        <FieldLabel required={required}>{prefix}Address Line 1</FieldLabel>
        <Input
          value={value.line1 || ''}
          disabled={inputDisabled}
          placeholder="Street, area"
          onChange={e => set({ line1: e.target.value })}
        />
      </div>
      {showLine2 && (
        <div>
          <FieldLabel>{prefix}Address Line 2</FieldLabel>
          <Input
            value={value.line2 || ''}
            disabled={inputDisabled}
            placeholder="Apartment, building"
            onChange={e => set({ line2: e.target.value })}
          />
        </div>
      )}
      {showLandmark && (
        <div>
          <FieldLabel>Landmark</FieldLabel>
          <Input
            value={value.landmark || ''}
            disabled={inputDisabled}
            placeholder="Nearby landmark"
            onChange={e => set({ landmark: e.target.value })}
          />
        </div>
      )}
      {showCountry && (
        <div>
          <FieldLabel required={required}>Country</FieldLabel>
          <SearchableSelect
            value={value.countryCode || ''}
            options={countries.map(c => ({ value: c.isoCode, label: c.name, flag: c.flag }))}
            onChange={code => {
              const country = countries.find(x => x.isoCode === code);
              set({ countryCode: code, country: country?.name || '', stateCode: '', state: '', city: '' });
            }}
            placeholder="Select country"
            searchPlaceholder="Search countries..."
            loading={!csc}
            disabled={disabled}
            readOnly={readOnly}
            ariaLabel="Country"
          />
        </div>
      )}
      <div>
        <FieldLabel required={required}>State / Province</FieldLabel>
        <SearchableSelect
          value={value.stateCode || ''}
          options={states.map(s => ({ value: s.isoCode, label: s.name }))}
          onChange={code => {
            const state = states.find(x => x.isoCode === code);
            set({ stateCode: code, state: state?.name || '', city: '' });
          }}
          placeholder={value.countryCode ? 'Select state' : 'Select country first'}
          searchPlaceholder="Search states..."
          loading={!!value.countryCode && !csc}
          disabled={disabled || !value.countryCode}
          readOnly={readOnly}
          emptyMessage="No states found for this country"
          ariaLabel="State or province"
        />
      </div>
      <div>
        <FieldLabel required={required}>City</FieldLabel>
        <SearchableSelect
          value={value.city || ''}
          options={cities.map(c => ({ value: c.name, label: c.name }))}
          onChange={city => set({ city })}
          placeholder={value.stateCode ? 'Select city' : 'Select state first'}
          searchPlaceholder="Search cities..."
          loading={!!value.stateCode && !csc}
          disabled={disabled || !value.stateCode}
          readOnly={readOnly}
          emptyMessage="No cities found for this state"
          ariaLabel="City"
        />
      </div>
      {showPostalCode && (
        <div>
          <FieldLabel required={required}>ZIP / Postal Code</FieldLabel>
          <Input
            value={postalCodeOf(value)}
            disabled={inputDisabled}
            placeholder="Postal code"
            onChange={e => setPostalCode(e.target.value)}
          />
        </div>
      )}
      {showNotes && (
        <div className="md:col-span-3">
          <FieldLabel>Location Notes</FieldLabel>
          <Input
            value={value.notes || ''}
            disabled={inputDisabled}
            placeholder="Delivery instructions, floor, gate, etc."
            onChange={e => set({ notes: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
