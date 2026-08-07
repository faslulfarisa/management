'use client';

import { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExportColumnDef } from './types';

interface ColumnSelectorProps {
  columns: ExportColumnDef[];
  selected: string[];
  onChange: (selected: string[]) => void;
  defaultColumns?: string[];
}

export function ColumnSelector({ columns, selected, onChange, defaultColumns }: ColumnSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(
    () =>
      searchTerm
        ? columns.filter((c) => c.header.toLowerCase().includes(searchTerm.toLowerCase()))
        : columns,
    [columns, searchTerm],
  );

  const toggleColumn = (key: string) => {
    onChange(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );
  };

  const selectAll = () => onChange(columns.map((c) => c.key));
  const clearAll = () => onChange([]);
  const restoreDefault = () => onChange(defaultColumns || columns.map((c) => c.key));

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {selected.length} of {columns.length} selected
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] font-medium text-primary hover:text-primary/80 px-2 py-0.5 rounded-md hover:bg-primary/5 transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md hover:bg-muted transition-colors"
          >
            Clear
          </button>
          {defaultColumns && (
            <button
              type="button"
              onClick={restoreDefault}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md hover:bg-muted transition-colors"
            >
              Default
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      {columns.length > 8 && (
        <input
          type="text"
          placeholder="Search columns..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
        />
      )}

      {/* Column list */}
      <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 -mr-1">
        {filtered.map((col) => {
          const isChecked = selected.includes(col.key);
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleColumn(col.key)}
              className={cn(
                'flex items-center gap-2.5 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all',
                isChecked
                  ? 'bg-primary/5 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
                  isChecked
                    ? 'bg-primary border-primary text-white'
                    : 'border-border',
                )}
              >
                {isChecked && <Check className="w-3 h-3" />}
              </span>
              <span className="truncate">{col.header}</span>
              {col.sensitive && (
                <span className="ml-auto text-[10px] text-amber-500 font-medium">Sensitive</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
