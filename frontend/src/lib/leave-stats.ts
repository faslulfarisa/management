import { differenceInCalendarDays, endOfMonth, isAfter, isBefore, parseISO, startOfMonth } from 'date-fns';
import type { EmployeeLeaveRequest } from '@/types/employee';

function clampDate(date: Date, min: Date, max: Date) {
  if (isBefore(date, min)) return min;
  if (isAfter(date, max)) return max;
  return date;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function requestDaysInRange(request: EmployeeLeaveRequest, rangeStart: Date, rangeEnd: Date) {
  const leaveStart = parseISO(request.start_date);
  const leaveEnd = parseISO(request.end_date);

  if (isAfter(leaveStart, rangeEnd) || isBefore(leaveEnd, rangeStart)) return 0;

  const requestDays = toFiniteNumber(request.days);
  const totalCalendarDays = differenceInCalendarDays(leaveEnd, leaveStart) + 1;
  const overlapStart = clampDate(leaveStart, rangeStart, rangeEnd);
  const overlapEnd = clampDate(leaveEnd, rangeStart, rangeEnd);
  const overlapCalendarDays = differenceInCalendarDays(overlapEnd, overlapStart) + 1;

  if (totalCalendarDays <= 0 || overlapCalendarDays <= 0) return 0;
  if (overlapCalendarDays === totalCalendarDays && requestDays > 0) return requestDays;

  return requestDays > 0 ? (requestDays / totalCalendarDays) * overlapCalendarDays : overlapCalendarDays;
}

export function getApprovedLeaveDaysInCurrentMonth(
  requests: EmployeeLeaveRequest[] | undefined,
  referenceDate = new Date(),
) {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  return (requests ?? [])
    .filter((request) => request.status === 'approved')
    .reduce((total, request) => total + requestDaysInRange(request, monthStart, monthEnd), 0);
}

export function formatLeaveDays(days: number) {
  if (Number.isInteger(days)) return String(days);
  return days.toFixed(1).replace(/\.0$/, '');
}
