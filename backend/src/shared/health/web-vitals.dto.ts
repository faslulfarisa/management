import { IsIn, IsNumber } from 'class-validator';

// Time-based vitals only (ms) — CLS is a unitless layout-shift score and
// doesn't belong in a millisecond histogram.
export const WEB_VITAL_NAMES = ['FCP', 'LCP', 'TTFB', 'INP'] as const;
export type WebVitalName = typeof WEB_VITAL_NAMES[number];

export class WebVitalDto {
  @IsIn(WEB_VITAL_NAMES)
  name: WebVitalName;

  @IsNumber()
  value: number;
}
