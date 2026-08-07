'use client';

import { useReportWebVitals } from 'next/web-vitals';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const TRACKED = new Set(['FCP', 'LCP', 'TTFB', 'INP']);

/** Ships Core Web Vitals to the backend, which feeds the Grafana performance dashboard. */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!TRACKED.has(metric.name)) return;

    const payload = JSON.stringify({ name: metric.name, value: metric.value });
    const url = `${API_URL}/health/web-vitals`;

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  });

  return null;
}
