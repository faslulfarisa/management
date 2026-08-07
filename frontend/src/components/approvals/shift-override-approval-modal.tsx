'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2, UserCheck, AlertTriangle, AlertCircle, Info, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { shiftOverrideApi } from '@/lib/shift-override-api';
import api from '@/lib/api';

interface ShiftOverrideApprovalModalProps {
  isOpen: boolean;
  request: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ACTION_TYPES = [
  { value: 'assign_replacement', label: 'Assign Replacement Employee', desc: 'Find and assign an available employee to cover this shift' },
  { value: 'move_shift', label: 'Move to Another Shift Definition', desc: 'Assign a different standard shift to the employee for these dates' },
  { value: 'convert_to_leave', label: 'Convert to Approved Leave', desc: 'Convert the schedule to a paid or unpaid leave request' },
  { value: 'cancel_shift', label: 'Cancel Scheduled Shift (Off-Day)', desc: 'Remove all schedule expectations for these dates' },
  { value: 'override_hours', label: 'Set Custom Shift Hours', desc: 'Define ad-hoc start/end times and break parameters' },
];

const schema = z.object({
  action_type: z.string().min(1, 'Action type is required'),
  replacement_employee_id: z.string().optional(),
  target_shift_id: z.string().optional(),
  leave_type_id: z.string().optional(),
  custom_start_time: z.string().optional(),
  custom_end_time: z.string().optional(),
  custom_break_minutes: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(0).optional()),
  custom_grace_period_minutes: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(0).optional()),
  reason: z.string().min(3, 'Reason for approval is required'),
  remarks: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.action_type === 'assign_replacement' && !data.replacement_employee_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['replacement_employee_id'], message: 'Replacement employee is required' });
  }
  if (data.action_type === 'move_shift' && !data.target_shift_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_shift_id'], message: 'Target shift is required' });
  }
  if (data.action_type === 'convert_to_leave' && !data.leave_type_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['leave_type_id'], message: 'Leave type is required' });
  }
  if (data.action_type === 'override_hours' && (!data.custom_start_time || !data.custom_end_time)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['custom_start_time'], message: 'Start and end time are required' });
  }
});

type FormData = z.infer<typeof schema>;

export function ShiftOverrideApprovalModal({ isOpen, request, onClose, onSuccess }: ShiftOverrideApprovalModalProps) {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<string>('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [shiftDefinitions, setShiftDefinitions] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [validatingReplacement, setValidatingReplacement] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    available: boolean;
    warnings: string[];
    conflicts: string[];
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      action_type: '',
      reason: '',
      remarks: '',
      custom_break_minutes: 60,
      custom_grace_period_minutes: 15,
    },
  });

  const selectedAction = watch('action_type');
  const selectedReplacementId = watch('replacement_employee_id');

  // Sync state with watch
  useEffect(() => {
    if (selectedAction) {
      setActiveAction(selectedAction);
    }
  }, [selectedAction]);

  // Load supporting lists
  useEffect(() => {
    if (isOpen) {
      // Fetch all employees
      api.get('/employees').then((res) => {
        setEmployees(res.data.data || []);
      });
      // Fetch shift definitions
      api.get('/shifts/definitions').then((res) => {
        setShiftDefinitions(res.data.data || []);
      });
      // Fetch leave types
      api.get('/leaves/types').then((res) => {
        setLeaveTypes(res.data.data || []);
      }).catch(() => {
        // Fallback or ignore if endpoint differs
      });
    }
  }, [isOpen]);

  // Validate replacement employee when selected
  useEffect(() => {
    if (selectedAction === 'assign_replacement' && selectedReplacementId && request) {
      setValidatingReplacement(true);
      shiftOverrideApi
        .validateReplacement(selectedReplacementId, request.start_date, request.end_date)
        .then((res) => {
          setValidationResult(res);
        })
        .catch(() => {
          setValidationResult(null);
        })
        .finally(() => {
          setValidatingReplacement(false);
        });
    } else {
      setValidationResult(null);
    }
  }, [selectedReplacementId, selectedAction, request]);

  const approveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const actionPayload = {
        reason: data.reason,
        remarks: data.remarks,
        ...(data.action_type === 'assign_replacement' ? { replacement_employee_id: data.replacement_employee_id } : {}),
        ...(data.action_type === 'move_shift' ? { target_shift_id: data.target_shift_id } : {}),
        ...(data.action_type === 'convert_to_leave' ? { metadata: { leave_type_id: data.leave_type_id } } : {}),
        ...(data.action_type === 'override_hours' ? {
          custom_start_time: data.custom_start_time,
          custom_end_time: data.custom_end_time,
          custom_break_minutes: data.custom_break_minutes,
          custom_grace_period_minutes: data.custom_grace_period_minutes,
        } : {}),
      };

      return shiftOverrideApi.approve(request.id, data.action_type, {
        ...actionPayload,
      });
    },
    onSuccess: () => {
      reset();
      onSuccess();
    },
  });

  const handleClose = () => {
    reset();
    setActiveAction('');
    setValidationResult(null);
    onClose();
  };

  const filteredEmployees = employees.filter((emp) => {
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const code = (emp.employee_code || '').toLowerCase();
    return (
      emp.id !== request?.employee_id && // Cannot replace with oneself
      (fullName.includes(searchQuery.toLowerCase()) || code.includes(searchQuery.toLowerCase()))
    );
  });

  if (!request) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh] rounded-2xl p-6">
        <DialogHeader className="border-b border-gray-100 pb-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-slate-800">
              Approve Shift Override Request
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Info card of request */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mt-2 space-y-2">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Employee:</span>
            <span className="font-semibold text-slate-700">{request.first_name} {request.last_name} ({request.employee_code})</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Requested Period:</span>
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              {request.start_date} to {request.end_date}
            </span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Urgency:</span>
            <span className="font-semibold capitalize text-amber-600">{request.urgency}</span>
          </div>
          <div className="border-t border-slate-200/60 pt-2 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Reason:</p>
            <p className="mt-0.5 text-slate-700 italic">"{request.detailed_reason}"</p>
          </div>
        </div>

        <form onSubmit={handleSubmit((d) => approveMutation.mutate(d))} className="space-y-4 mt-3">
          {/* Action selection */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Choose Resolution Action</label>
            <select
              {...register('action_type')}
              className="w-full h-11 px-3 text-xs font-semibold rounded-lg border border-gray-200 bg-background focus:ring-2 focus:ring-slate-900 focus:outline-none"
            >
              <option value="">Select an action…</option>
              {ACTION_TYPES.map((act) => (
                <option key={act.value} value={act.value}>
                  {act.label}
                </option>
              ))}
            </select>
            {errors.action_type && <p className="text-xs text-red-500 font-semibold">{errors.action_type.message}</p>}
          </div>

          {/* Render contextual fields based on activeAction */}
          {activeAction === 'assign_replacement' && (
            <div className="space-y-3 border-l-2 border-amber-500 pl-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Search Replacement Employee</label>
                <div className="relative">
                  <Input
                    placeholder="Search by name or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Candidate</label>
                <select
                  {...register('replacement_employee_id')}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-gray-200 bg-background focus:outline-none"
                >
                  <option value="">Select replacement employee…</option>
                  {filteredEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_code})
                    </option>
                  ))}
                </select>
                {errors.replacement_employee_id && <p className="text-xs text-red-500 font-semibold">{errors.replacement_employee_id.message}</p>}
              </div>

              {/* Validation Feedback */}
              {validatingReplacement && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Checking replacement availability...
                </div>
              )}

              {validationResult && (
                <div className="rounded-lg p-3 text-xs space-y-2 border">
                  {validationResult.available ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 font-semibold bg-emerald-50 border-emerald-100 p-2 rounded-md">
                      <UserCheck className="h-4 w-4" />
                      Candidate is available for these dates!
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5 text-red-600 font-semibold bg-red-50 border-red-100 p-2 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p>Conflicts detected:</p>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] font-normal">
                          {validationResult.conflicts.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {validationResult.warnings.length > 0 && (
                    <div className="flex items-start gap-1.5 text-amber-600 bg-amber-50 border-amber-100 p-2 rounded-md">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Warnings:</p>
                        <ul className="list-disc pl-4 mt-0.5 text-[11px]">
                          {validationResult.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeAction === 'move_shift' && (
            <div className="space-y-2 border-l-2 border-blue-500 pl-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Target Shift</label>
                <select
                  {...register('target_shift_id')}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-gray-200 bg-background focus:outline-none"
                >
                  <option value="">Select shift definition…</option>
                  {shiftDefinitions.map((sd) => (
                    <option key={sd.id} value={sd.id}>
                      {sd.name} ({sd.start_time.slice(0, 5)} - {sd.end_time.slice(0, 5)})
                    </option>
                  ))}
                </select>
                {errors.target_shift_id && <p className="text-xs text-red-500 font-semibold">{errors.target_shift_id.message}</p>}
              </div>
            </div>
          )}

          {activeAction === 'convert_to_leave' && (
            <div className="space-y-2 border-l-2 border-emerald-500 pl-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Leave Type Mapping</label>
                <select
                  {...register('leave_type_id')}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-gray-200 bg-background focus:outline-none"
                >
                  <option value="">Select leave type…</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} ({lt.code})
                    </option>
                  ))}
                </select>
                {errors.leave_type_id && <p className="text-xs text-red-500 font-semibold">{errors.leave_type_id.message}</p>}
                <p className="text-[10px] text-slate-400 mt-1">
                  * Approving this action automatically generates an approved leave request in the Leave Management module.
                </p>
              </div>
            </div>
          )}

          {activeAction === 'cancel_shift' && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg flex gap-2 items-start border-l-2 border-l-red-500">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Shift Cancellation</p>
                <p className="text-[11px] text-red-600 mt-0.5">
                  The employee will be dynamically relieved from duty on these dates. This will mark the days as Off-Days, preventing auto-absent tracking.
                </p>
              </div>
            </div>
          )}

          {activeAction === 'override_hours' && (
            <div className="space-y-3 border-l-2 border-orange-500 pl-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Time</label>
                  <Input type="time" {...register('custom_start_time')} className="h-10 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Time</label>
                  <Input type="time" {...register('custom_end_time')} className="h-10 text-xs" />
                </div>
              </div>
              {errors.custom_start_time && <p className="text-xs text-red-500 font-semibold">{errors.custom_start_time.message}</p>}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Break (Mins)</label>
                  <Input type="number" {...register('custom_break_minutes')} className="h-10 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grace Period (Mins)</label>
                  <Input type="number" {...register('custom_grace_period_minutes')} className="h-10 text-xs" />
                </div>
              </div>
            </div>
          )}

          {/* Standard Reason & Remarks */}
          <div className="space-y-1.5 border-t border-gray-100 pt-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approval Reason / Notes</label>
            <textarea
              {...register('reason')}
              rows={2}
              placeholder="e.g. Approved replacement employee assigned."
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            {errors.reason && <p className="text-xs text-red-500 font-semibold">{errors.reason.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Remarks (Optional)</label>
            <Input
              placeholder="Additional internal notes..."
              {...register('remarks')}
              className="h-10 text-xs"
            />
          </div>

          {approveMutation.isError && (
            <p className="text-xs text-red-500 text-center font-bold">
              {(approveMutation.error as any)?.response?.data?.message || 'Resolution failed. Check details.'}
            </p>
          )}

          <DialogFooter className="gap-2 border-t border-gray-100 pt-3">
            <Button type="button" variant="outline" onClick={handleClose} className="h-10 text-xs font-bold">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={approveMutation.isPending || (activeAction === 'assign_replacement' && !validationResult?.available)}
              className="h-10 text-xs font-bold bg-slate-950 hover:bg-slate-900 text-white rounded-lg"
            >
              {approveMutation.isPending ? (
                <div className="flex items-center gap-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Approving...
                </div>
              ) : (
                'Resolve & Approve'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
