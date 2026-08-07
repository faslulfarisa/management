'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';

const schema = z.object({
  attendance_date: z.string().min(1, 'Date is required'),
  requested_clock_in: z.string().optional(),
  requested_clock_out: z.string().optional(),
  reason: z.string().min(5, 'Please provide a reason (at least 5 chars)'),
});

type FormData = z.infer<typeof schema>;

interface CorrectionRequestSheetProps {
  open: boolean;
  onClose: () => void;
  prefillDate?: string;
}

export function CorrectionRequestSheet({ open, onClose, prefillDate }: CorrectionRequestSheetProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { attendance_date: prefillDate ?? '' },
  });

  const submit = useMutation({
    mutationFn: (data: FormData) => employeeApi.submitCorrectionRequest(data),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['employee-pending-requests'] });
      setTimeout(() => {
        setSuccess(false);
        reset();
        onClose();
      }, 1500);
    },
  });

  const handleClose = () => {
    reset();
    setSuccess(false);
    onClose();
  };

  return (
    <BottomSheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <BottomSheetContent title="Attendance Correction">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Request submitted</p>
            <p className="text-xs text-muted-foreground mt-1">Your correction request is under review.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => submit.mutate(d))} className="px-5 pb-8 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Date</label>
              <Input type="date" {...register('attendance_date')} className="h-11" />
              {errors.attendance_date && <p className="text-xs text-destructive">{errors.attendance_date.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Clock In</label>
                <Input type="time" {...register('requested_clock_in')} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Clock Out</label>
                <Input type="time" {...register('requested_clock_out')} className="h-11" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reason</label>
              <textarea
                {...register('reason')}
                rows={3}
                placeholder="Briefly explain the correction needed…"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
            </div>

            {submit.isError && (
              <p className="text-xs text-destructive">Submission failed. Please try again.</p>
            )}

            <Button type="submit" disabled={submit.isPending} className="w-full h-11">
              {submit.isPending ? 'Submitting…' : 'Submit Request'}
            </Button>
          </form>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
