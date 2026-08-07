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
  date: z.string().min(1, 'Date of fine is required'),
  reason: z.string().min(10, 'Please provide a detailed reason for your appeal'),
});

type FormData = z.infer<typeof schema>;

interface FineAppealSheetProps {
  open: boolean;
  onClose: () => void;
}

export function FineAppealSheet({ open, onClose }: FineAppealSheetProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: '', reason: '' },
  });

  const submit = useMutation({
    mutationFn: (data: FormData) => employeeApi.submitFineAppealRequest(data),
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
      <BottomSheetContent title="Fine Appeal">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Appeal submitted!</p>
            <p className="text-xs text-muted-foreground mt-1">Your appeal is pending review by HR.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => submit.mutate(d))} className="px-5 pb-8 space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-xs text-red-700">
                Submit an appeal if you believe a fine imposed on you is incorrect. Provide the date the fine was issued and your reason for disputing it.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Date of Fine</label>
              <Input type="date" {...register('date')} className="h-11" />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reason for Appeal</label>
              <textarea
                {...register('reason')}
                rows={4}
                placeholder="Explain why you are disputing this fine…"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
            </div>

            {submit.isError && (
              <p className="text-xs text-destructive">Submission failed. Please try again.</p>
            )}

            <Button type="submit" disabled={submit.isPending} className="w-full h-11">
              {submit.isPending ? 'Submitting…' : 'Submit Appeal'}
            </Button>
          </form>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
