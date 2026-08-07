export const EMPLOYEE_STATUSES = [
  'active',
  'probation',
  'confirmed',
  'on_leave',
  'suspended',
  'inactive',
  'resigned',
  'terminated',
  'retired',
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const ATTENDANCE_WORKFORCE_STATUSES = [
  'active',
  'probation',
  'confirmed',
] as const satisfies readonly EmployeeStatus[];

export const ATTENDANCE_WORKFORCE_STATUS_SQL =
  `ARRAY[${ATTENDANCE_WORKFORCE_STATUSES.map((status) => `'${status}'`).join(', ')}]::text[]`;
