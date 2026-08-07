'use client';

import { ApprovalLogEntry, ApprovalRequest } from '@/lib/approvals-api';
import { CheckCircle2, XCircle, AlertCircle, Clock, Circle } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface ApprovalTimelineProps {
  request: ApprovalRequest;
}

function stepIcon(action: ApprovalLogEntry['action']) {
  switch (action) {
    case 'approved':   return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case 'rejected':   return <XCircle className="w-5 h-5 text-red-500" />;
    case 'escalated':  return <AlertCircle className="w-5 h-5 text-amber-500" />;
    case 'cancelled':  return <XCircle className="w-5 h-5 text-slate-400" />;
  }
}

export function ApprovalTimeline({ request }: ApprovalTimelineProps) {
  const { approval_log, current_step, total_steps, status } = request;
  const completedSteps = new Set(approval_log.map((e) => e.step));

  const totalStepsCount = total_steps ?? Math.max(current_step, approval_log.length);
  const allSteps = Array.from({ length: totalStepsCount }, (_, i) => i + 1);
  const isTerminal = ['approved', 'rejected', 'cancelled', 'expired'].includes(status);

  return (
    <div className="space-y-0">
      {allSteps.map((step, idx) => {
        const logEntry = approval_log.find((e) => e.step === step);
        const isCompleted = !!logEntry;
        const isCurrent = !isTerminal && step === current_step && !completedSteps.has(step);
        const isFuture = !isCompleted && !isCurrent;
        const isLast = idx === allSteps.length - 1;

        return (
          <div key={step} className="flex gap-3">
            {/* Spine + node */}
            <div className="flex flex-col items-center">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                isCompleted
                  ? 'border-transparent bg-transparent'
                  : isCurrent
                  ? 'border-slate-900 bg-white animate-pulse'
                  : 'border-slate-200 bg-white'
              }`}>
                {isCompleted ? (
                  stepIcon(logEntry!.action)
                ) : isCurrent ? (
                  <Clock className="w-4 h-4 text-slate-700" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-300" />
                )}
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 my-1 ${isCompleted ? 'bg-emerald-200' : 'bg-slate-200'}`} style={{ minHeight: 24 }} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-5 flex-1 ${isLast ? 'pb-0' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isFuture ? 'text-slate-400' : 'text-slate-800'}`}>
                  Step {step}
                  {logEntry?.role && (
                    <span className="ml-1 text-xs font-normal text-slate-500">({logEntry.role})</span>
                  )}
                </span>
                {isCompleted && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    logEntry!.action === 'approved'  ? 'bg-emerald-50 text-emerald-700' :
                    logEntry!.action === 'rejected'  ? 'bg-red-50 text-red-700' :
                    logEntry!.action === 'escalated' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {logEntry!.action}
                  </span>
                )}
                {isCurrent && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                    awaiting
                  </span>
                )}
              </div>

              {isCompleted && (
                <div className="mt-1 space-y-0.5">
                  {logEntry!.reason && (
                    <p className="text-xs text-slate-600">{logEntry!.reason}</p>
                  )}
                  {logEntry!.remarks && (
                    <p className="text-xs text-slate-500 italic">{logEntry!.remarks}</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {formatDistanceToNow(parseISO(logEntry!.timestamp), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
