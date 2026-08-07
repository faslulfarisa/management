/**
 * Plain-English explanations for payroll terms, shown via help tooltips
 * on the employee payroll pages. Purely client-side reference content —
 * does not affect any payroll calculation.
 */
export const PAYROLL_HELP: Record<string, string> = {
  'basic salary': 'The fixed core part of your salary, before any allowances or deductions.',
  basic: 'The fixed core part of your salary, before any allowances or deductions.',
  hra: 'House Rent Allowance — a portion of your salary meant to help cover rental costs.',
  da: 'Dearness Allowance — an amount paid to help offset the impact of inflation.',
  conveyance: 'An allowance to help cover your commuting/travel costs to work.',
  medical: 'An allowance toward medical expenses.',
  'special allowance': 'An additional fixed payment that tops up your salary, beyond the standard components.',
  allowance: 'An extra fixed payment added on top of your basic salary.',
  bonus: 'An extra one-time payment, usually for performance, festivals, or special occasions.',
  incentive: 'An extra reward payment, often linked to performance or targets.',
  overtime: 'Extra pay for approved hours worked beyond your regular shift.',
  ot: 'Extra pay for approved hours worked beyond your regular shift.',
  pf: 'Provident Fund — a retirement savings contribution deducted from your pay and invested for your future.',
  'provident fund': 'A retirement savings contribution deducted from your pay and invested for your future.',
  esi: 'Employee State Insurance — a small contribution that gives you access to medical and cash benefits during illness or injury.',
  tds: 'Tax Deducted at Source — income tax deducted in advance by your employer, as required by law.',
  'income tax': 'Tax Deducted at Source — income tax deducted in advance by your employer, as required by law.',
  gratuity: 'A long-term benefit paid by your employer when you leave after a qualifying period of service — usually not deducted monthly, but sometimes shown for reference.',
  'professional tax': 'A small state government tax on salaried employees, deducted monthly as per local rules.',
  'leave deduction': 'An amount deducted for unpaid leave or absences beyond your available leave balance.',
  'leave': 'An amount deducted for unpaid leave or absences beyond your available leave balance.',
  fine: 'A deduction applied for a policy violation, such as repeated late arrivals.',
  'late': 'A deduction applied for arriving after your shift\'s grace period.',
  'net salary': 'The amount you actually receive — your earnings minus all deductions.',
  'net pay': 'The amount you actually receive — your earnings minus all deductions.',
  'gross salary': 'Your total earnings before any deductions are made.',
  'total deductions': 'The sum of all amounts subtracted from your gross salary.',
};

/**
 * Looks up a help description for a payroll line-item label using
 * case-insensitive substring matching against PAYROLL_HELP keys.
 */
export function getPayrollHelp(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (PAYROLL_HELP[normalized]) return PAYROLL_HELP[normalized];

  for (const [key, value] of Object.entries(PAYROLL_HELP)) {
    if (normalized.includes(key)) return value;
  }
  return null;
}
