'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Country as CountryT, State as StateT, City as CityT } from 'country-state-city';
import { Input } from '@/components/ui/input';
import SearchableSelect from './SearchableSelect';

type Csc = { Country: typeof CountryT; State: typeof StateT; City: typeof CityT };

export interface AddressValue {
  line1?: string;
  line2?: string;
  country?: string;
  countryCode?: string;
  state?: string;
  stateCode?: string;
  city?: string;
  pincode?: string;
  /** Legacy free-text address from records created before structured addresses. */
  text?: string;
}

interface Props {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  disabled?: boolean;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">{children}</label>;
}

/** Present/Permanent address block: street lines + cascading Country -> State -> City selects. */
export default function AddressFields({ value, onChange, disabled }: Props) {
  const seededRef = useRef(false);
  // country-state-city bundles a multi-MB world city dataset — load it on demand
  // in a separate chunk instead of inflating this route's First Load JS.
  const [csc, setCsc] = useState<Csc | null>(null);

  useEffect(() => {
    import('country-state-city').then(setCsc);
  }, []);

  // Backward-compat: seed line1 from legacy `{ text: "..." }` address records once.
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

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="md:col-span-2">
        <FieldLabel>Address Line 1</FieldLabel>
        <Input
          value={value.line1 || ''}
          disabled={disabled}
          placeholder="Street, Area, Landmark"
          onChange={e => set({ line1: e.target.value })}
        />
      </div>
      <div>
        <FieldLabel>Address Line 2</FieldLabel>
        <Input
          value={value.line2 || ''}
          disabled={disabled}
          placeholder="Apartment, Building (optional)"
          onChange={e => set({ line2: e.target.value })}
        />
      </div>
      <div>
        <FieldLabel>Country</FieldLabel>
        <SearchableSelect
          value={value.countryCode || ''}
          options={countries.map(c => ({ value: c.isoCode, label: c.name, flag: c.flag }))}
          onChange={code => {
            const c = countries.find(x => x.isoCode === code);
            set({ countryCode: code, country: c?.name || '', stateCode: '', state: '', city: '' });
          }}
          placeholder="Select country"
          searchPlaceholder="Search countries…"
          disabled={disabled}
        />
      </div>
      <div>
        <FieldLabel>State / Province</FieldLabel>
        <SearchableSelect
          value={value.stateCode || ''}
          options={states.map(s => ({ value: s.isoCode, label: s.name }))}
          onChange={code => {
            const s = states.find(x => x.isoCode === code);
            set({ stateCode: code, state: s?.name || '', city: '' });
          }}
          placeholder={value.countryCode ? 'Select state' : 'Select country first'}
          searchPlaceholder="Search states…"
          disabled={disabled || !value.countryCode}
          emptyMessage="No states found for this country"
        />
      </div>
      <div>
        <FieldLabel>City</FieldLabel>
        <SearchableSelect
          value={value.city || ''}
          options={cities.map(c => ({ value: c.name, label: c.name }))}
          onChange={city => set({ city })}
          placeholder={value.stateCode ? 'Select city' : 'Select state first'}
          searchPlaceholder="Search cities…"
          disabled={disabled || !value.stateCode}
          emptyMessage="No cities found for this state"
        />
      </div>
      <div>
        <FieldLabel>Pincode / ZIP</FieldLabel>
        <Input
          value={value.pincode || ''}
          disabled={disabled}
          placeholder="Postal code"
          onChange={e => set({ pincode: e.target.value })}
        />
      </div>
    </div>
  );
}
