'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function escapeSelector(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\#.:,[\]=]/g, '\\$&');
}

export function NotificationFocusHighlighter() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus') ?? searchParams.get('entity');

  useEffect(() => {
    if (!focusId) return;

    const id = escapeSelector(focusId);
    const selectors = [
      `[data-entity-id="${id}"]`,
      `[data-record-id="${id}"]`,
      `[data-id="${id}"]`,
      `#${id}`,
      `a[href*="${id}"]`,
      `button[value="${id}"]`,
    ];

    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(selectors.join(', '));
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      const previousTransition = target.style.transition;
      const previousOutline = target.style.outline;
      const previousBoxShadow = target.style.boxShadow;

      target.style.transition = 'outline-color 180ms ease, box-shadow 180ms ease';
      target.style.outline = '2px solid hsl(var(--primary))';
      target.style.boxShadow = '0 0 0 6px hsl(var(--primary) / 0.12)';

      window.setTimeout(() => {
        target.style.transition = previousTransition;
        target.style.outline = previousOutline;
        target.style.boxShadow = previousBoxShadow;
      }, 2400);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [focusId]);

  return null;
}
