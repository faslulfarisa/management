'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { Button } from '@/components/ui/button';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';

const schema = z.object({
  fine_id: z.string().min(1, 'Please select the fine you want to appeal'),
  requested_change: z.string().optional(),
  reason: z.string().min(10, 'Please provide a detailed reason for your appeal'),
  priority: z.enum(['low', 'normal', 'high']).optional(),
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
    defaultValues: { fine_id: '', requested_change: '', reason: '', priority: 'normal' },
  });

  const { data: fines = [], isLoading: finesLoading } = useQuery({
    queryKey: ['employee-fines'],
    queryFn: () => employeeApi.getMyFines({ limit: 100 }),
    enabled: open,
  });

  const appealableFines = fines.filter((fine) => !['rejected', 'cancelled'].includes(fine.status));

  const submit = useMutation({
    mutationFn: (data: FormData) => employeeApi.submitFineAppealRequest({
      fine_id: data.fine_id,
      reason: data.reason,
      requested_change: data.requested_change?.trim() || undefined,
    }),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['employee-pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['employee-submitted-requests'] });
      queryClient.invalidateQueries({ queryKey: ['employee-fines'] });
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
      <BottomSheetContent title="Fine Appeal">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Appeal submitted!</p>
            <p className="text-xs text-muted-foreground mt-1">Your appeal is pending review by branch and organization admins.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => submit.mutate(d))} className="px-5 pb-8 space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-xs text-red-700">
                Submit an appeal if you believe a fine imposed on you is incorrect. Select the fine and explain what should be reviewed.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Fine</label>
              <div className="relative">
                <select
                  {...register('fine_id')}
                  disabled={finesLoading || appealableFines.length === 0}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  <option value="">
                    {finesLoading ? 'Loading fines...' : appealableFines.length === 0 ? 'No appealable fines found' : 'Select a fine'}
                  </option>
                  {appealableFines.map((fine) => (
                    <option key={fine.id} value={fine.id} disabled={!!fine.active_appeal_id}>
                      {fine.title} - INR {Number(fine.fine_amount).toFixed(2)}
                      {fine.active_appeal_id ? ' (appeal pending)' : ''}
                    </option>
                  ))}
                </select>
                {finesLoading && (
                  <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {errors.fine_id && <p className="text-xs text-destructive">{errors.fine_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Requested Change</label>
              <textarea
                {...register('requested_change')}
                rows={2}
                placeholder="Amount reduction, waiver, correction, or other requested change"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reason for Appeal</label>
              <textarea
                {...register('reason')}
                rows={4}
                placeholder="Explain why you are disputing this fine..."
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

            <Button type="submit" disabled={submit.isPending || finesLoading} className="w-full h-11">
              {submit.isPending ? 'Submitting...' : 'Submit Appeal'}
            </Button>
          </form>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
