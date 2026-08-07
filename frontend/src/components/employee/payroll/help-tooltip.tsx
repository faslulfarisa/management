'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { HelpCircle } from 'lucide-react';
import { getPayrollHelp } from '@/lib/payroll-help';
import { cn } from '@/lib/utils';

interface HelpTooltipProps {
  /** Payroll line-item label, e.g. "PF" or "Professional Tax" — looked up in the help dictionary. */
  label?: string;
  /** Explicit help text, overrides the dictionary lookup. */
  text?: string;
  className?: string;
}

/**
 * Small "?" affordance that shows a plain-English explanation of a payroll term
 * on hover (desktop) or tap (mobile). Renders nothing if no help text is found.
 */
export function HelpTooltip({ label, text, className }: HelpTooltipProps) {
  const content = text ?? (label ? getPayrollHelp(label) : null);
  if (!content) return null;

  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn('inline-flex items-center justify-center text-gray-300 hover:text-gray-500 transition-colors', className)}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="sr-only">What is this?</span>
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            align="center"
            sideOffset={6}
            className="z-50 max-w-[240px] rounded-lg bg-gray-900 px-3 py-2 text-[11px] leading-snug text-white shadow-lg animate-in fade-in-0 zoom-in-95"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-gray-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
