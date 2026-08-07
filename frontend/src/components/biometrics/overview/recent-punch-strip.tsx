'use client';

import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePunchFeed } from '@/hooks/use-punch-feed';
import { OnlineDot } from '@/components/biometrics/ui/status-badge';
import { cn } from '@/lib/utils';
import type { PunchBroadcast } from '@/types/biometrics';
import { formatDistanceToNowStrict } from 'date-fns';

const DIRECTION_STYLES: Record<string, string> = {
  IN:      'badge-online',
  OUT:     'badge-offline',
  UNKNOWN: 'bg-slate-100 text-slate-500 border border-slate-200',
};

const SOURCE_LABELS: Record<string, string> = {
  biometric_device:   'Bio',
  face_device:        'Face',
  fingerprint_device: 'FP',
  card_device:        'Card',
  mobile_terminal:    'Mobile',
  laptop_terminal:    'Laptop',
  kiosk_terminal:     'Kiosk',
};

function PunchRow({ punch, isNew }: { punch: PunchBroadcast; isNew: boolean }) {
  const dirClass = DIRECTION_STYLES[punch.punchType?.toUpperCase()] ?? DIRECTION_STYLES.UNKNOWN;
  const timeAgo = formatDistanceToNowStrict(new Date(punch.timestamp), { addSuffix: true });
  const source = SOURCE_LABELS[punch.attendanceSource ?? ''] ?? punch.provider;

  return (
    <div
      className={cn(
        'grid items-center gap-2 px-4 py-2.5 border-b border-slate-100 text-xs',
        'hover:bg-slate-50 transition-colors',
        isNew && 'animate-row-flash',
      )}
      style={{ gridTemplateColumns: '1.5fr 1fr 64px 80px 80px' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <OnlineDot online />
        <span className="font-mono font-semibold text-slate-800 truncate">{punch.employeeCode}</span>
        {punch.employeeName && (
          <span className="text-slate-500 truncate hidden sm:block">{punch.employeeName}</span>
        )}
      </div>
      <span className="text-slate-500 truncate">{source}</span>
      <span
        className={cn(
          'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
          dirClass,
        )}
      >
        {punch.punchType}
      </span>
      <span className="text-slate-400 text-[10px]">{timeAgo}</span>
      {punch.isLate && (
        <span className="badge-warn inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold">Late</span>
      )}
      {!punch.isLate && <span />}
    </div>
  );
}

export function RecentPunchStrip({ limit = 120 }: { limit?: number }) {
  const { punches, autoscroll } = usePunchFeed();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  const sliced = punches.slice(0, limit);

  const virtualizer = useVirtualizer({
    count: sliced.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  useEffect(() => {
    if (autoscroll && parentRef.current && punches.length !== prevLengthRef.current) {
      parentRef.current.scrollTop = 0;
    }
    prevLengthRef.current = punches.length;
  }, [punches.length, autoscroll]);

  if (sliced.length === 0) {
    return (
      <div className="ops-panel flex items-center justify-center h-40">
        <p className="text-sm text-slate-600">Waiting for punch events…</p>
      </div>
    );
  }

  return (
    <div className="ops-panel overflow-hidden">
      {/* Header */}
      <div
        className="grid items-center gap-2 px-4 py-2 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-widest text-slate-500"
        style={{ gridTemplateColumns: '1.5fr 1fr 64px 80px 80px' }}
      >
        <span>Employee</span>
        <span>Source</span>
        <span>Dir</span>
        <span>When</span>
        <span>Status</span>
      </div>

      <div ref={parentRef} className="overflow-auto" style={{ height: 320 }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
            >
              <PunchRow punch={sliced[row.index]} isNew={row.index === 0} />
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400">
        {punches.length} events in buffer
      </div>
    </div>
  );
}
