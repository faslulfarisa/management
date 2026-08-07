'use client';

import { CheckCircle2 } from 'lucide-react';
import type { ExitTimelineEvent } from '@/types/exit';

export function ExitTimelineView({ events, loading }: { events: ExitTimelineEvent[]; loading?: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading timeline...</p>;
  if (!events.length) return <p className="text-sm text-muted-foreground py-4">No timeline events yet.</p>;

  return (
    <ol className="relative border-l border-border ml-3">
      {events.map((event, idx) => (
        <li key={event.id} className="mb-5 ml-5 last:mb-0">
          <span className="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 ring-2 ring-background">
            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
          </span>
          <p className="text-sm font-medium text-foreground">{event.label}</p>
          {event.description && <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(event.created_at).toLocaleString()}
            {event.actor_email ? ` · ${event.actor_email}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
