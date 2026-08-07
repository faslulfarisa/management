'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  flag?: string;
}

interface Props {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

/** Generic client-side filtered combobox used for Country / State / City selection. */
export default function SearchableSelect({
  value, options, onChange, placeholder = 'Select…', searchPlaceholder = 'Search…',
  emptyMessage = 'No options found', disabled, className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find(o => o.value === value) || null, [options, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt: SearchableOption) => {
    onChange(opt.value);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={[
          'w-full flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/30',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/20',
        ].join(' ')}
      >
        <span className="truncate text-left">
          {selected ? (
            <>{selected.flag ? `${selected.flag} ` : ''}{selected.label}</>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/40 rounded-md">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground px-4">{emptyMessage}</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={[
                    'w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors',
                    value === opt.value ? 'bg-primary/10 hover:bg-primary/15' : '',
                  ].join(' ')}
                >
                  {opt.flag ? `${opt.flag} ` : ''}{opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
