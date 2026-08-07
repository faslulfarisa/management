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
  date: z.string().min(1, 'Date is required'),
  requested_shift: z.string().min(1, 'Requested shift is required'),
  reason: z.string().min(5, 'Please provide a reason'),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

type FormData = z.infer<typeof schema>;

interface ShiftChangeSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShiftChangeSheet({ open, onClose }: ShiftChangeSheetProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: '', requested_shift: '', reason: '', priority: 'normal' },
  });

  const submit = useMutation({
    mutationFn: (data: FormData) => employeeApi.submitShiftChangeRequest(data),
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

  const handleClose = () => { reset(); setSuccess(false); onClose(); };

  return (
    <BottomSheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <BottomSheetContent title="Shift Change Request">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Request submitted!</p>
            <p className="text-xs text-muted-foreground mt-1">Your shift change request is pending approval.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => submit.mutate(d))} className="px-5 pb-8 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Date</label>
              <Input type="date" {...register('date')} className="h-11" />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Requested Shift</label>
              <select
                {...register('requested_shift')}
                className="w-full h-11 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select shift…</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
                <option value="Off Day">Off Day</option>
              </select>
              {errors.requested_shift && <p className="text-xs text-destructive">{errors.requested_shift.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reason</label>
              <textarea
                {...register('reason')}
                rows={3}
                placeholder="Why do you need this shift change?"
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
