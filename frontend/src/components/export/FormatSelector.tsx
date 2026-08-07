'use client';

import { FileText, FileSpreadsheet, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExportFormat } from './types';

interface FormatSelectorProps {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
}

const FORMAT_OPTIONS: { format: ExportFormat; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  {
    format: 'csv',
    label: 'CSV',
    desc: 'Standard CSV, opens in any spreadsheet app',
    icon: FileDown,
    color: 'text-blue-600',
  },
  {
    format: 'xlsx',
    label: 'Excel',
    desc: 'Formatted .xlsx with headers and auto-fit columns',
    icon: FileSpreadsheet,
    color: 'text-green-600',
  },
  {
    format: 'pdf',
    label: 'PDF',
    desc: 'Professional PDF with branding and page numbers',
    icon: FileText,
    color: 'text-red-500',
  },
];

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {FORMAT_OPTIONS.map(({ format, label, desc, icon: Icon, color }) => (
        <button
          key={format}
          type="button"
          onClick={() => onChange(format)}
          className={cn(
            'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all',
            value === format
              ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm'
              : 'border-border hover:border-primary/30 hover:bg-muted/30',
          )}
        >
          <Icon className={cn('w-5 h-5', color)} />
          <span className="text-xs font-semibold">{label}</span>
          <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{desc}</span>
        </button>
      ))}
    </div>
  );
}
