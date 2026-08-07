'use client';

import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePunchFeed } from '@/hooks/use-punch-feed';
import { OnlineDot } from '@/components/biometrics/ui/status-badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { PunchBroadcast } from '@/types/biometrics';

const DIR_STYLES: Record<string, string> = {
  IN:      'badge-online',
  OUT:     'badge-offline',
  UNKNOWN: 'bg-slate-100 text-slate-500 border border-slate-200',
};

const SOURCE_LABEL: Record<string, string> = {
  biometric_device:   'Biometric',
  face_device:        'Face',
  fingerprint_device: 'Fingerprint',
  card_device:        'Card / RFID',
  mobile_terminal:    'Mobile',
  laptop_terminal:    'Laptop',
  kiosk_terminal:     'Kiosk',
};

const METHOD_LABEL: Record<string, string> = {
  fingerprint: 'FP',
  face:        'Face',
  card:        'Card',
  password:    'PIN',
  hybrid:      'Hybrid',
  other:       'Other',
};

const COLS = [
  { key: 'time',     label: 'Time',          width: '120px'  },
  { key: 'employee', label: 'Employee',       width: '1fr'    },
  { key: 'dir',      label: 'Dir',            width: '56px'   },
  { key: 'source',   label: 'Source',         width: '110px'  },
  { key: 'method',   label: 'Method',         width: '72px'   },
  { key: 'provider', label: 'Provider',       width: '110px'  },
  { key: 'device',   label: 'Device',         width: '100px'  },
  { key: 'status',   label: 'Status',         width: '80px'   },
];

const GRID = COLS.map((c) => c.width).join(' ');

function PunchRow({ punch, isNew }: { punch: PunchBroadcast; isNew: boolean }) {
  const dir = (punch.punchType ?? 'UNKNOWN').toUpperCase();

  return (
    <div
      className={cn(
        'grid items-center gap-3 px-4 py-2.5 border-b border-slate-100 text-xs',
        'hover:bg-slate-50 transition-colors group',
        isNew && 'animate-row-flash',
      )}
      style={{ gridTemplateColumns: GRID }}
    >
      {/* Time */}
      <div className="flex items-center gap-1.5 min-w-0">
        <OnlineDot online />
        <span className="text-slate-500 tabular-nums">
          {format(new Date(punch.timestamp), 'HH:mm:ss')}
        </span>
      </div>

      {/* Employee */}
      <div className="min-w-0">
        <span className="font-mono font-semibold text-slate-800 truncate block">
          {punch.employeeCode}
        </span>
        {punch.employeeName && (
          <span className="text-slate-500 text-[10px] truncate block">{punch.employeeName}</span>
        )}
      </div>

      {/* Direction */}
      <span
        className={cn(
          'inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
          DIR_STYLES[dir] ?? DIR_STYLES.UNKNOWN,
        )}
      >
        {dir}
      </span>

      {/* Source */}
      <span className="text-slate-500 truncate">
        {SOURCE_LABEL[punch.attendanceSource ?? ''] ?? punch.attendanceSource ?? '—'}
      </span>

      {/* Verify method */}
      <span className="text-slate-500">
        {METHOD_LABEL[punch.verifyMethod ?? ''] ?? '—'}
      </span>

      {/* Provider */}
      <span className="text-slate-500 truncate">{punch.provider ?? '—'}</span>

      {/* Device / terminal */}
      <span className="text-slate-400 text-[10px] truncate font-mono">
        {punch.deviceId ?? punch.terminalId ?? '—'}
      </span>

      {/* Late / OT */}
      <div className="flex items-center gap-1">
        {punch.isLate && (
          <span className="badge-warn inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold">Late</span>
        )}
        {punch.isOvertime && (
          <span className="badge-purple inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold">OT</span>
        )}
      </div>
    </div>
  );
}

export function PunchFeedTable() {
  const { punches, autoscroll } = usePunchFeed();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: punches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  useEffect(() => {
    if (autoscroll && parentRef.current && punches.length !== prevLenRef.current) {
      parentRef.current.scrollTop = 0;
    }
    prevLenRef.current = punches.length;
  }, [punches.length, autoscroll]);

  if (punches.length === 0) {
    return (
      <div className="ops-panel flex items-center justify-center h-52">
        <p className="text-sm text-slate-600">Waiting for punch events…</p>
      </div>
    );
  }

  return (
    <div className="ops-panel overflow-hidden">
      {/* Column headers */}
      <div
        className="grid items-center gap-3 px-4 py-2 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-widest text-slate-500"
        style={{ gridTemplateColumns: GRID }}
      >
        {COLS.map((c) => <span key={c.key}>{c.label}</span>)}
      </div>

      {/* Virtualized body */}
      <div ref={parentRef} className="overflow-auto" style={{ height: 520 }}>
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
              <PunchRow punch={punches[row.index]} isNew={row.index === 0} />
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>{punches.length} events (last {500} kept)</span>
        <span>Scroll to top for newest</span>
      </div>
    </div>
  );
}
