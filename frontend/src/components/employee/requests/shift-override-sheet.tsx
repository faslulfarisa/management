'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2, Calendar } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { shiftOverrideApi } from '@/lib/shift-override-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';

const REASON_CATEGORIES = [
  'Medical',
  'Personal Emergency',
  'Family Emergency',
  'Official Duty',
  'Training',
  'Business Travel',
  'Leave Conversion',
  'Transportation Issue',
  'Schedule Conflict',
  'Child Care',
  'Religious Event',
  'Weather',
  'Custom',
];

const PREFERRED_ACTIONS = [
  { value: 'assign_replacement', label: 'Assign another employee' },
  { value: 'swap_shift', label: 'Swap with another employee' },
  { value: 'move_shift', label: 'Move to another shift' },
  { value: 'convert_to_leave', label: 'Convert to Leave' },
  { value: 'cancel_shift', label: 'Cancel Shift' },
  { value: 'manager_decision', label: 'Manager Decision' },
];

const schema = z.object({
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  reason_category: z.string().min(1, 'Reason is required'),
  detailed_reason: z.string().min(5, 'Detailed reason must be at least 5 characters'),
  urgency: z.string().default('medium'),
  preferred_action: z.string().optional(),
  remarks: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ShiftOverrideSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShiftOverrideSheet({ open, onClose }: ShiftOverrideSheetProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [currentShift, setCurrentShift] = useState<{ name: string; time: string; id: string } | null>(null);
  const [loadingShift, setLoadingShift] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      start_date: '',
      end_date: '',
      reason_category: '',
      detailed_reason: '',
      urgency: 'medium',
      preferred_action: 'manager_decision',
      remarks: '',
    },
  });

  const startDate = watch('start_date');
  const endDate = watch('end_date');

  // Auto-fill end date when start date is selected
  useEffect(() => {
    if (startDate && !endDate) {
      setValue('end_date', startDate);
    }
  }, [startDate, endDate, setValue]);

  // Load current shift for the selected start date
  useEffect(() => {
    if (!startDate) {
      setCurrentShift(null);
      return;
    }

    const fetchShift = async () => {
      setLoadingShift(true);
      try {
        const data = await employeeApi.getTodayShift({ date: startDate });
        if (data) {
          setCurrentShift({
            name: data.shift_name,
            time: `${data.start_time.slice(0, 5)} - ${data.end_time.slice(0, 5)}`,
            id: data.shift_id || '',
          });
        } else {
          setCurrentShift({
            name: 'No active shift / Off Day',
            time: 'N/A',
            id: '',
          });
        }
      } catch (err) {
        setCurrentShift(null);
      } finally {
        setLoadingShift(false);
      }
    };

    fetchShift();
  }, [startDate]);

  const submitMutation = useMutation({
    mutationFn: (data: FormData) => {
      return shiftOverrideApi.submit({
        ...data,
        current_shift_id: currentShift?.id || undefined,
      });
    },
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['employee-pending-requests'] });
      setTimeout(() => {
        setSuccess(false);
        reset();
        onClose();
      }, 1800);
    },
  });

  const canSubmit = isValid && !!startDate && !!endDate && !loadingShift && !submitMutation.isPending;

  const handleClose = () => {
    reset();
    setSuccess(false);
    setCurrentShift(null);
    onClose();
  };

  return (
    <BottomSheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <BottomSheetContent title="Request Shift Override">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4 animate-bounce">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Override request submitted!</p>
            <p className="text-xs text-muted-foreground mt-1">Your shift override request has been sent for approval.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => submitMutation.mutate(d))} className="px-5 pb-8 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Start Date</label>
                <Input type="date" {...register('start_date')} className="h-11 rounded-lg border-gray-200" />
                {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">End Date</label>
                <Input type="date" {...register('end_date')} className="h-11 rounded-lg border-gray-200" />
                {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
              </div>
            </div>

            {startDate && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Current Scheduled Shift</p>
                  {loadingShift ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span className="text-xs text-gray-500">Fetching shift details...</span>
                    </div>
                  ) : currentShift ? (
                    <p className="text-xs font-semibold text-gray-700 mt-0.5">
                      {currentShift.name} <span className="text-gray-400 font-normal">({currentShift.time})</span>
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-gray-500 mt-0.5">Unknown / Off Day</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Reason</label>
                <select
                  {...register('reason_category')}
                  className="w-full h-11 px-3 text-xs font-medium rounded-lg border border-gray-200 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select Reason…</option>
                  {REASON_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.reason_category && <p className="text-xs text-destructive">{errors.reason_category.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Priority</label>
                <select
                  {...register('urgency')}
                  className="w-full h-11 px-3 text-xs font-medium rounded-lg border border-gray-200 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Preferred Action (Optional)</label>
              <select
                {...register('preferred_action')}
                className="w-full h-11 px-3 text-xs font-medium rounded-lg border border-gray-200 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PREFERRED_ACTIONS.map((act) => (
                  <option key={act.value} value={act.value}>
                    {act.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Reason Details</label>
              <textarea
                {...register('detailed_reason')}
                rows={3}
                placeholder="Explain why you are requesting this override..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.detailed_reason && <p className="text-xs text-destructive">{errors.detailed_reason.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Remarks / Comments (Optional)</label>
              <Input
                type="text"
                placeholder="Additional notes for your manager..."
                {...register('remarks')}
                className="h-11 rounded-lg border-gray-200"
              />
            </div>

            {submitMutation.isError && (
              <p className="text-xs text-destructive text-center font-medium">
                {(submitMutation.error as any)?.response?.data?.message || 'Submission failed. Please check inputs.'}
              </p>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full h-11 rounded-lg font-bold text-xs">
              {submitMutation.isPending ? (
                <div className="flex items-center gap-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </div>
              ) : (
                'Submit Override Request'
              )}
            </Button>
          </form>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
