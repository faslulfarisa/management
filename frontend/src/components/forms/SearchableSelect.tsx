'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

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
  loading?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  ariaLabel?: string;
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found',
  loading = false,
  clearable = true,
  disabled,
  readOnly,
  className = '',
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find(o => o.value === value) || null, [options, value]);
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(o => `${o.label} ${o.value}`.toLowerCase().includes(q));
  }, [options, search]);

  const positionDropdown = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const viewportPadding = 12;
    const preferredHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(preferredHeight, openAbove ? spaceAbove : spaceBelow));

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openAbove ? undefined : rect.bottom + 4,
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const isTriggerClick = containerRef.current?.contains(target);
      const isDropdownClick = dropdownRef.current?.contains(target);

      if (!isTriggerClick && !isDropdownClick) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      positionDropdown();
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, positionDropdown]);

  useEffect(() => {
    if (!open) return;
    const update = () => positionDropdown();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, positionDropdown]);

  const choose = (option: SearchableOption) => {
    onChange(option.value);
    setOpen(false);
    setSearch('');
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (disabled || readOnly) return;
    if (!open && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') {
      setOpen(false);
      setSearch('');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    }
  };

  const dropdown = open && mounted ? createPortal(
    <div
      ref={dropdownRef}
      onKeyDown={onKeyDown}
      className="z-[100] flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg"
      style={dropdownStyle}
    >
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/40 rounded-md">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            aria-label={searchPlaceholder}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" role="listbox">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground px-4">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground px-4">{emptyMessage}</div>
        ) : (
          filtered.map((opt, index) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(opt)}
              className={[
                'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2',
                index === activeIndex ? 'bg-muted/40' : 'hover:bg-muted/40',
                value === opt.value ? 'bg-primary/10 hover:bg-primary/15' : '',
              ].join(' ')}
            >
              <span className="truncate">{opt.flag ? `${opt.flag} ` : ''}{opt.label}</span>
              {value === opt.value && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => !disabled && !readOnly && setOpen(o => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          'w-full flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/30',
          disabled ? 'opacity-50 cursor-not-allowed' : readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-muted/20',
        ].join(' ')}
      >
        <span className="truncate text-left">
          {selected ? (
            <>{selected.flag ? `${selected.flag} ` : ''}{selected.label}</>
          ) : (
            <span className="text-muted-foreground">{loading ? 'Loading...' : placeholder}</span>
          )}
        </span>
        <span className="ml-2 flex shrink-0 items-center gap-1">
          {clearable && value && !disabled && !readOnly && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(event) => {
                event.stopPropagation();
                onChange('');
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {dropdown}
    </div>
  );
}
