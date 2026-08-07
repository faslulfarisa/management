'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';

const schema = z.object({
  leave_type_id: z.string().min(1, 'Select a leave type'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  reason: z.string().min(5, 'Please provide a reason'),
  duration: z.enum(['full_day', 'half_day']).default('full_day'),
  priority: z.enum(['low', 'normal', 'high']).optional(),
}).refine((d) => d.end_date >= d.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
}).refine((d) => !(d.duration === 'half_day' && d.start_date !== d.end_date), {
  message: 'Half day leave must be for a single date',
  path: ['end_date'],
});

type FormData = z.infer<typeof schema>;

interface LeaveApplySheetProps {
  open: boolean;
  onClose: () => void;
}

export function LeaveApplySheet({ open, onClose }: LeaveApplySheetProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);

  const { data: leaveTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => employeeApi.getLeaveTypes(),
    staleTime: 1000,
  });

  const { data: balances } = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => employeeApi.getLeaveBalances(),
    staleTime: 1000,
  });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { leave_type_id: '', start_date: '', end_date: '', reason: '', duration: 'full_day', priority: 'normal' },
  });

  const leaveTypeId = watch('leave_type_id');
  const startDate = watch('start_date');
  const endDate = watch('end_date');
  const duration = watch('duration');

  // If half day is selected, automatically sync end_date to match start_date
  useEffect(() => {
    if (duration === 'half_day' && startDate && startDate !== endDate) {
      setValue('end_date', startDate);
    }
  }, [duration, startDate, endDate, setValue]);

  const days = startDate && endDate && endDate >= startDate
    ? (duration === 'half_day' ? 0.5 : differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1)
    : null;

  const selectedBalance = (balances ?? []).find((b) => b.leave_type_id === leaveTypeId);
  const noPolicyAssigned = Boolean(balances && balances.length === 0);

  // When a leave type is chosen but no balance record exists at all, that means
  // HR hasn't allocated this leave type for the employee yet.
  const noBalanceRecord = Boolean(leaveTypeId && balances !== undefined && !selectedBalance);

  const insufficientBalance = Boolean(
    selectedBalance && days != null && days > selectedBalance.available,
  );

  const submit = useMutation({
    mutationFn: (data: FormData) => employeeApi.applyLeave(data),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['employee-leave-balances'] });
      queryClient.invalidateQueries({ queryKey: ['employee-leave-history'] });
      queryClient.invalidateQueries({ queryKey: ['employee-pending-requests'] });
      setTimeout(() => {
        setSuccess(false);
        reset();
        onClose();
      }, 1600);
    },
  });

  const handleClose = () => { reset(); setSuccess(false); onClose(); };

  return (
    <BottomSheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <BottomSheetContent title="Apply for Leave">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Leave applied!</p>
            <p className="text-xs text-muted-foreground mt-1">Your request is pending approval.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => submit.mutate(d))} className="px-5 pb-8 space-y-4">
            {/* Leave type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Leave Type</label>
              <select
                {...register('leave_type_id')}
                className="w-full h-11 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select type…</option>
                {(leaveTypes ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {errors.leave_type_id && <p className="text-xs text-destructive">{errors.leave_type_id.message}</p>}
              {selectedBalance && (
                <p className="text-xs text-muted-foreground">
                  Available balance: <span className="font-semibold text-foreground">{selectedBalance.available} {selectedBalance.available === 1 ? 'day' : 'days'}</span>
                </p>
              )}
            </div>

            {/* Leave Duration */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Leave Duration</label>
              <select
                {...register('duration')}
                className="w-full h-11 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="full_day">Full Day</option>
                <option value="half_day">Half Day</option>
              </select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">From</label>
                <Input type="date" {...register('start_date')} className="h-11" />
                {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">To</label>
                <Input type="date" {...register('end_date')} className="h-11" />
                {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
              </div>
            </div>

            {days != null && (
              <p className="text-xs text-muted-foreground">
                Duration: <span className="font-semibold text-foreground">{days} {days === 1 ? 'day' : 'days'}</span>
              </p>
            )}
            {insufficientBalance && (
              <p className="text-xs text-destructive">
                Insufficient balance — only {selectedBalance?.available} {selectedBalance?.available === 1 ? 'day' : 'days'} available for this leave type.
              </p>
            )}

            {/* No-balance advisory — shown before submit */}
            {noBalanceRecord && (
              <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">
                    {noPolicyAssigned ? 'Leave policy template required' : 'Leave type unavailable'}
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {noPolicyAssigned
                      ? 'You cannot request leave until HR assigns a leave policy template to you.'
                      : 'Your assigned leave policy template does not include this leave type.'}
                  </p>
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reason</label>
              <textarea
                {...register('reason')}
                rows={3}
                placeholder="Briefly describe your reason…"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Priority</label>
              <select
                {...register('priority')}
                className="w-full h-11 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="low">Low</option>
                <option value="normal">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* API error — shown after a failed submit */}
            {submit.isError && (() => {
              const msg: string =
                (submit.error as any)?.response?.data?.message ||
                (submit.error as any)?.response?.data?.error ||
                'Submission failed. Please try again.';
              const isPolicyError = msg.includes('No active leave policy template')
                || msg.includes('No leave balance is available')
                || msg.includes('not available under your assigned leave policy template');
              return isPolicyError ? (
                <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Leave request unavailable</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {msg}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{msg}</p>
                </div>
              );
            })()}

            <Button type="submit" disabled={submit.isPending || insufficientBalance || noBalanceRecord} className="w-full h-11">
              {submit.isPending ? 'Submitting…' : 'Submit Request'}
            </Button>
          </form>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
