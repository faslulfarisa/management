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

const EXPENSE_CATEGORIES = [
  'Travel',
  'Food & Meals',
  'Accommodation',
  'Equipment',
  'Stationery',
  'Medical',
  'Communication',
  'Other',
];

const schema = z.object({
  category: z.string().min(1, 'Select a category'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(5, 'Please describe the expense'),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

type FormData = z.infer<typeof schema>;

interface ExpenseSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ExpenseSheet({ open, onClose }: ExpenseSheetProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: '', amount: undefined, date: today, description: '', priority: 'normal' },
  });

  const submit = useMutation({
    mutationFn: (data: FormData) => employeeApi.submitExpenseRequest(data),
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
      <BottomSheetContent title="Expense Request">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Expense submitted!</p>
            <p className="text-xs text-muted-foreground mt-1">Your expense request is pending approval.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => submit.mutate(d))} className="px-5 pb-8 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Category</label>
              <select
                {...register('category')}
                className="w-full h-11 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select category…</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Amount</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="0"
                  {...register('amount')}
                  className="h-11"
                />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Date</label>
                <Input type="date" {...register('date')} className="h-11" />
                {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
              </div>
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                {...register('description')}
                rows={3}
                placeholder="Describe the expense and purpose…"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
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
