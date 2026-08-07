'use client';

import { useState, useEffect } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReportFilters } from './ReportFilters';
import type { FilterField, FilterOptions, FilterState } from './types';

export interface MobileFilterSheetProps {
  value: FilterState;
  onChange: (f: FilterState) => void;
  fields: FilterField[];
  options?: FilterOptions;
  onReset: () => void;
  activeFilterCount?: number;
}

export function MobileFilterSheet({
  value,
  onChange,
  fields,
  options,
  onReset,
  activeFilterCount = 0,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);

  // Prevent body scroll while sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleReset = () => {
    onReset();
    setOpen(false);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-xl text-sm font-medium text-foreground shadow-sm"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filters
        {activeFilterCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-primary text-white text-xs rounded-full leading-none">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />

      {/* Bottom sheet */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ maxHeight: '85dvh', overflowY: 'auto' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-muted rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Filters</h3>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter content */}
        <div className="px-4 py-4">
          <ReportFilters
            value={value}
            onChange={onChange}
            fields={fields}
            options={options}
            onReset={handleReset}
          />
        </div>

        {/* Apply button */}
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={() => setOpen(false)}
            className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
