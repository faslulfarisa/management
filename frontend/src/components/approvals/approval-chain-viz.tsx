'use client';

import { ApprovalRequest } from '@/lib/approvals-api';
import { CheckCircle2, XCircle, Clock, Circle, ChevronRight } from 'lucide-react';

interface ApprovalChainVizProps {
  request: ApprovalRequest;
  /** Optional chain definition from branch_approval_chains — if not provided, derived from log */
  chainSteps?: Array<{ step: number; role: string }>;
}

function stepState(
  step: number,
  request: ApprovalRequest,
  chainSteps?: Array<{ step: number; role: string }>,
): 'approved' | 'rejected' | 'cancelled' | 'current' | 'future' {
  const logEntry = request.approval_log.find((e) => e.step === step);
  if (logEntry) {
    if (logEntry.action === 'approved') return 'approved';
    if (logEntry.action === 'rejected') return 'rejected';
    if (logEntry.action === 'cancelled') return 'cancelled';
  }
  const isTerminal = ['approved', 'rejected', 'cancelled', 'expired'].includes(request.status);
  if (!isTerminal && step === request.current_step) return 'current';
  return 'future';
}

const STATE_STYLES = {
  approved:  'border-emerald-400 bg-emerald-50 text-emerald-800',
  rejected:  'border-red-400 bg-red-50 text-red-800',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-500 line-through',
  current:   'border-slate-900 bg-white text-slate-900 shadow-sm',
  future:    'border-slate-200 bg-white text-slate-400',
};

const STATE_ICONS = {
  approved:  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  rejected:  <XCircle className="w-3.5 h-3.5 text-red-500" />,
  cancelled: <XCircle className="w-3.5 h-3.5 text-slate-400" />,
  current:   <Clock className="w-3.5 h-3.5 text-slate-700 animate-pulse" />,
  future:    <Circle className="w-3.5 h-3.5 text-slate-300" />,
};

export function ApprovalChainViz({ request, chainSteps }: ApprovalChainVizProps) {
  const totalSteps = request.total_steps ?? Math.max(request.current_step, request.approval_log.length);

  const steps = Array.from({ length: totalSteps }, (_, i) => {
    const stepNum = i + 1;
    const role = chainSteps?.find((s) => s.step === stepNum)?.role
      ?? request.approval_log.find((e) => e.step === stepNum)?.role
      ?? `Step ${stepNum}`;
    const state = stepState(stepNum, request, chainSteps);
    return { stepNum, role, state };
  });

  if (steps.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map(({ stepNum, role, state }, idx) => (
        <div key={stepNum} className="flex items-center gap-1">
          <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap ${STATE_STYLES[state]}`}>
            {STATE_ICONS[state]}
            <span>{role}</span>
          </div>
          {idx < steps.length - 1 && (
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
