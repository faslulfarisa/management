'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
} from 'date-fns';
import { cn } from '@/lib/utils';
import type { FilterField, FilterOptions, FilterState } from './types';

export interface ReportFiltersProps {
  value: FilterState;
  onChange: (f: FilterState) => void;
  fields: FilterField[];
  options?: FilterOptions;
  onReset: () => void;
}

type DatePreset = { label: string; from: string; to: string };

function getDatePresets(): DatePreset[] {
  const today = new Date();
  return [
    {
      label: 'Today',
      from: format(today, 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd'),
    },
    {
      label: 'This Week',
      from: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    },
    {
      label: 'This Month',
      from: format(startOfMonth(today), 'yyyy-MM-dd'),
      to: format(endOfMonth(today), 'yyyy-MM-dd'),
    },
    {
      label: 'Last Month',
      from: format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd'),
      to: format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd'),
    },
  ];
}

const ATTENDANCE_STATUSES = [
  { id: 'present',  name: 'Present'   },
  { id: 'absent',   name: 'Absent'    },
  { id: 'late',     name: 'Late'      },
  { id: 'half_day', name: 'Half Day'  },
  { id: 'on_leave', name: 'On Leave'  },
];

const VERIFY_METHODS = [
  { id: 'face',        name: 'Face'        },
  { id: 'fingerprint', name: 'Fingerprint' },
  { id: 'card',        name: 'Card'        },
  { id: 'pin',         name: 'PIN'         },
  { id: 'manual',      name: 'Manual'      },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  name: format(new Date(2000, i, 1), 'MMMM'),
}));

function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value?: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="border border-border rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground min-w-[140px]"
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

export function ReportFilters({ value, onChange, fields, options = {}, onReset }: ReportFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateMode, setDateMode] = useState<'preset' | 'custom'>('preset');
  const presets = getDatePresets();

  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  const activePreset = presets.find(p => p.from === value.date_from && p.to === value.date_to);

  // Determine which fields go in the primary bar vs advanced panel
  const primaryFields: FilterField[] = ['date_range', 'branch', 'department'];
  const advancedFields: FilterField[] = fields.filter(f => !primaryFields.includes(f));
  const hasPrimary = fields.some(f => primaryFields.includes(f));
  const hasAdvanced = advancedFields.length > 0;

  return (
    <div className="bg-white border border-border rounded-2xl px-4 py-3 shadow-sm space-y-3">
      {/* Primary filter row */}
      {hasPrimary && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Date range */}
          {fields.includes('date_range') && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick chips */}
              <div className="flex gap-1">
                {presets.map(p => (
                  <button
                    key={p.label}
                    onClick={() => { set({ date_from: p.from, date_to: p.to }); setDateMode('preset'); }}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-lg border transition-all whitespace-nowrap',
                      activePreset?.label === p.label && dateMode === 'preset'
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setDateMode('custom')}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-lg border transition-all',
                    dateMode === 'custom'
                      ? 'bg-primary text-white border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  Custom
                </button>
              </div>
              {/* Custom date inputs */}
              {dateMode === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={value.date_from ?? ''}
                    onChange={e => set({ date_from: e.target.value })}
                    className="border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="date"
                    value={value.date_to ?? ''}
                    onChange={e => set({ date_to: e.target.value })}
                    className="border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}
            </div>
          )}

          {/* Branch */}
          {fields.includes('branch') && (options.branches?.length ?? 0) > 0 && (
            <NativeSelect
              value={value.branch_id}
              onChange={v => set({ branch_id: v || undefined })}
              options={options.branches!}
              placeholder="All Branches"
            />
          )}

          {/* Department */}
          {fields.includes('department') && (options.departments?.length ?? 0) > 0 && (
            <NativeSelect
              value={value.department_id}
              onChange={v => set({ department_id: v || undefined })}
              options={options.departments!}
              placeholder="All Departments"
            />
          )}

          <div className="flex-1" />

          {/* Advanced toggle */}
          {hasAdvanced && (
            <button
              onClick={() => setShowAdvanced(s => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Advanced
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Reset */}
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-1.5 hover:bg-muted transition-all"
          >
            Reset
          </button>
        </div>
      )}

      {/* Advanced filter panel */}
      {hasAdvanced && showAdvanced && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border/50">
          {fields.includes('designation') && (options.designations?.length ?? 0) > 0 && (
            <NativeSelect
              value={value.designation_id}
              onChange={v => set({ designation_id: v || undefined })}
              options={options.designations!}
              placeholder="All Designations"
            />
          )}

          {fields.includes('employee') && (options.employees?.length ?? 0) > 0 && (
            <NativeSelect
              value={value.employee_id}
              onChange={v => set({ employee_id: v || undefined })}
              options={options.employees!}
              placeholder="All Employees"
            />
          )}

          {fields.includes('shift') && (options.shifts?.length ?? 0) > 0 && (
            <NativeSelect
              value={value.shift_id}
              onChange={v => set({ shift_id: v || undefined })}
              options={options.shifts!}
              placeholder="All Shifts"
            />
          )}

          {fields.includes('attendance_status') && (
            <NativeSelect
              value={value.attendance_status}
              onChange={v => set({ attendance_status: v || undefined })}
              options={ATTENDANCE_STATUSES}
              placeholder="All Statuses"
            />
          )}

          {fields.includes('leave_type') && (options.leaveTypes?.length ?? 0) > 0 && (
            <NativeSelect
              value={value.leave_type_id}
              onChange={v => set({ leave_type_id: v || undefined })}
              options={options.leaveTypes!}
              placeholder="All Leave Types"
            />
          )}

          {fields.includes('verification_method') && (
            <NativeSelect
              value={value.verification_method}
              onChange={v => set({ verification_method: v || undefined })}
              options={VERIFY_METHODS}
              placeholder="All Methods"
            />
          )}

          {fields.includes('device') && (options.devices?.length ?? 0) > 0 && (
            <NativeSelect
              value={value.device_id}
              onChange={v => set({ device_id: v || undefined })}
              options={options.devices!}
              placeholder="All Devices"
            />
          )}

          {fields.includes('payroll_cycle') && (
            <div className="flex items-center gap-2">
              <NativeSelect
                value={value.payroll_month != null ? String(value.payroll_month) : ''}
                onChange={v => set({ payroll_month: v ? Number(v) : undefined })}
                options={MONTHS}
                placeholder="Month"
              />
              <input
                type="number"
                min={2020}
                max={2099}
                placeholder="Year"
                value={value.payroll_year ?? ''}
                onChange={e => set({ payroll_year: e.target.value ? Number(e.target.value) : undefined })}
                className="border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-24"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
