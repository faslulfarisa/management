'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import {
  Plus, Calendar, FilePen, ArrowLeftRight, Clock, Receipt, Shield, ChevronDown,
} from 'lucide-react';
import { approvalsApi, ApprovalRequest } from '@/lib/approvals-api';
import { RequestDetailSheet } from '@/components/employee/requests/request-detail-sheet';
import { LeaveApplySheet } from '@/components/employee/leave/leave-apply-sheet';
import { CorrectionRequestSheet } from '@/components/employee/attendance/correction-request-sheet';
import { ShiftChangeSheet } from '@/components/employee/requests/shift-change-sheet';
import { OvertimeSheet } from '@/components/employee/requests/overtime-sheet';
import { ExpenseSheet } from '@/components/employee/requests/expense-sheet';
import { FineAppealSheet } from '@/components/employee/requests/fine-appeal-sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SheetId = 'leave' | 'correction' | 'shift_change' | 'overtime' | 'expense' | 'fine_appeal';

const newRequestOptions: { id: SheetId; label: string; Icon: React.ElementType; color: string; bg: string }[] = [
  { id: 'leave',        label: 'Leave Request',        Icon: Calendar,       color: 'text-primary',     bg: 'bg-primary/10'   },
  { id: 'correction',   label: 'Attendance Fix',        Icon: FilePen,        color: 'text-orange-600',  bg: 'bg-orange-100'   },
  { id: 'shift_change', label: 'Shift Change',          Icon: ArrowLeftRight, color: 'text-purple-600',  bg: 'bg-purple-100'   },
  { id: 'overtime',     label: 'Overtime Request',      Icon: Clock,          color: 'text-emerald-600', bg: 'bg-emerald-100'  },
  { id: 'expense',      label: 'Expense Claim',         Icon: Receipt,        color: 'text-amber-600',   bg: 'bg-amber-100'    },
  { id: 'fine_appeal',  label: 'Fine Appeal',           Icon: Shield,         color: 'text-red-600',     bg: 'bg-red-100'      },
];

const statusMap: Record<string, { label: string; cls: string }> = {
  pending:            { label: 'Pending',      cls: 'bg-amber-50   text-amber-700'   },
  under_review:       { label: 'In Review',    cls: 'bg-blue-50    text-blue-700'    },
  approved:           { label: 'Approved',     cls: 'bg-emerald-50 text-emerald-700' },
  partially_approved: { label: 'Part. Appr.',  cls: 'bg-emerald-50 text-emerald-700' },
  rejected:           { label: 'Rejected',     cls: 'bg-red-50     text-red-700'     },
  cancelled:          { label: 'Cancelled',    cls: 'bg-gray-100   text-gray-500'    },
  expired:            { label: 'Expired',      cls: 'bg-gray-100   text-gray-400'    },
};

const typeLabel: Record<string, string> = {
  leave_request:          'Leave',
  attendance_correction:  'Attendance Fix',
  shift_change:           'Shift Change',
  overtime:               'Overtime',
  expense:                'Expense',
  fine_appeal:            'Fine Appeal',
};

export function PortalRequests() {
  const [open, setOpen] = useState<SheetId | null>(null);
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['employee-submitted-requests'],
    queryFn: () => approvalsApi.getSubmitted({ limit: 50 }),
    staleTime: 60_000,
  });

  const requests = data?.data ?? [];

  return (
    <div>
      {/* Sticky page header */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Requests</h1>
        <div className="relative">
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Request
            <ChevronDown className="h-3 w-3 ml-0.5" />
          </Button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden py-1">
                {newRequestOptions.map(({ id, label, Icon, color, bg }) => (
                  <button
                    key={id}
                    onClick={() => { setOpen(id); setMenuOpen(false); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className={cn('flex h-6 w-6 items-center justify-center rounded-md shrink-0', bg)}>
                      <Icon className={cn('h-3.5 w-3.5', color)} />
                    </div>
                    <span className="text-[12px] font-medium text-gray-700">{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="p-6 max-w-[1100px]">
        {/* Requests table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">All Requests</p>
            <p className="text-[11px] text-gray-400">{requests.length} total</p>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-5 px-5 py-2 bg-gray-50 border-b border-gray-100">
            {['Request', 'Type', 'Submitted', 'Priority', 'Status'].map((col) => (
              <p key={col} className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{col}</p>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-5 px-5 py-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ))
            ) : requests.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="text-sm text-gray-400">No requests submitted yet</p>
                <p className="text-xs text-gray-400 mt-1">Use "New Request" to submit a leave, correction, or other request</p>
              </div>
            ) : requests.map((r) => {
              const s = statusMap[r.status];
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="grid grid-cols-5 w-full px-5 py-3 text-left hover:bg-gray-50 transition-colors items-center"
                >
                  <p className="text-[13px] font-medium text-gray-800 truncate pr-2">{r.title}</p>
                  <p className="text-[12px] text-gray-500">{typeLabel[r.workflow_type] ?? r.workflow_type}</p>
                  <p className="text-[12px] text-gray-400">
                    {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                  </p>
                  <span className={cn(
                    'inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full w-fit',
                    r.priority === 'high' ? 'bg-red-50 text-red-600' :
                    r.priority === 'urgent' ? 'bg-amber-50 text-amber-600' :
                    'bg-gray-100 text-gray-500',
                  )}>
                    {r.priority ? r.priority.charAt(0).toUpperCase() + r.priority.slice(1) : 'Normal'}
                  </span>
                  {s && (
                    <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full w-fit', s.cls)}>
                      {s.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sheets */}
      <LeaveApplySheet         open={open === 'leave'}        onClose={() => setOpen(null)} />
      <CorrectionRequestSheet  open={open === 'correction'}   onClose={() => setOpen(null)} />
      <ShiftChangeSheet        open={open === 'shift_change'} onClose={() => setOpen(null)} />
      <OvertimeSheet           open={open === 'overtime'}     onClose={() => setOpen(null)} />
      <ExpenseSheet            open={open === 'expense'}      onClose={() => setOpen(null)} />
      <FineAppealSheet         open={open === 'fine_appeal'}  onClose={() => setOpen(null)} />
      <RequestDetailSheet      request={selected}             onClose={() => setSelected(null)} />
    </div>
  );
}
