'use client';

import { Calendar, FilePen, ArrowLeftRight, Clock, Receipt, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RequestType = 'leave' | 'correction' | 'shift_change' | 'overtime' | 'expense' | 'fine_appeal';

interface RequestTypeOption {
  type: RequestType;
  label: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
}

const options: RequestTypeOption[] = [
  { type: 'leave',       label: 'Leave',          Icon: Calendar,       color: 'text-primary',     bg: 'bg-primary/10'    },
  { type: 'correction',  label: 'Attendance Fix',  Icon: FilePen,        color: 'text-orange-600',  bg: 'bg-orange-100'    },
  { type: 'shift_change',label: 'Shift Change',   Icon: ArrowLeftRight, color: 'text-purple-600',  bg: 'bg-purple-100'    },
  { type: 'overtime',    label: 'Overtime',        Icon: Clock,          color: 'text-emerald-600', bg: 'bg-emerald-100'   },
  { type: 'expense',     label: 'Expense',         Icon: Receipt,        color: 'text-amber-600',   bg: 'bg-amber-100'     },
  { type: 'fine_appeal', label: 'Fine Appeal',     Icon: Shield,         color: 'text-red-600',     bg: 'bg-red-100'       },
];

interface RequestTypeSelectorProps {
  onSelect: (type: RequestType) => void;
}

export function RequestTypeSelector({ onSelect }: RequestTypeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {options.map(({ type, label, Icon, color, bg }) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3.5 hover:bg-muted/50 active:scale-95 transition-all"
        >
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', bg)}>
            <Icon className={cn('h-5 w-5', color)} />
          </div>
          <span className="text-[11px] font-medium text-foreground text-center leading-tight">{label}</span>
        </button>
      ))}
    </div>
  );
}
