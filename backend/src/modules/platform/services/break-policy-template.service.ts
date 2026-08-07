import { BadRequestException, Injectable } from '@nestjs/common';
import { DEFAULT_BREAK_LIMITS, PUNCH_OUT_REASONS } from '../../hr/constants/punch-out-reasons';

export const BREAK_POLICY_TEMPLATE_TYPE = 'break_policy';

export const BREAK_POLICY_CATEGORIES = [
  'paid_break',
  'unpaid_break',
  'official_duty',
  'emergency',
  'medical',
  'training',
  'meeting',
  'personal',
  'other',
] as const;

export type BreakPolicyCategory = typeof BREAK_POLICY_CATEGORIES[number];

export interface BreakPolicyType {
  name: string;
  code: string;
  category: BreakPolicyCategory;
  allowed_minutes: number | null;
  paid: boolean;
  max_uses_per_day: number | null;
  max_total_minutes_per_day: number | null;
  allow_extension: boolean;
  max_extension_minutes: number | null;
  requires_employee_reason: boolean;
  requires_manager_approval: boolean;
  requires_hr_approval: boolean;
  allow_early_return: boolean;
  allow_multiple_sessions: boolean;
  visible_to_employees: boolean;
  active: boolean;
  color: string | null;
  icon: string | null;
  sort_order: number;
  grace_minutes: number;
  warning_threshold_minutes: number | null;
  critical_threshold_minutes: number | null;
  auto_overdue: boolean;
  unlimited_duration: boolean;
  daily_maximum_minutes: number | null;
  weekly_maximum_minutes: number | null;
}

export interface BreakPolicyConfig {
  break_types: BreakPolicyType[];
  overdue_actions: {
    notify_employee: boolean;
    notify_manager: boolean;
    notify_branch_admin: boolean;
    notify_org_admin: boolean;
    notify_hr: boolean;
    escalation_after_minutes: number | null;
    escalation_levels: string[];
    automatic_attendance_flag: boolean;
    automatic_payroll_deduction: boolean;
    automatic_attendance_request: boolean;
  };
  notifications: {
    warning_timing_minutes: number | null;
    escalation_timing_minutes: number | null;
    recipients: string[];
    template_codes: string[];
  };
  limits?: Record<string, { allowed_minutes: number | null; paid: boolean }>;
}

const DEFAULT_CATEGORY_BY_CODE: Record<string, BreakPolicyCategory> = {
  tea_break: 'paid_break',
  lunch_break: 'paid_break',
  prayer_break: 'paid_break',
  personal_break: 'personal',
  official_outside: 'official_duty',
  emergency_leave: 'emergency',
  other: 'other',
};

const FALLBACK_BREAK_TYPES: BreakPolicyType[] = PUNCH_OUT_REASONS
  .filter((reason) => reason.category !== 'final_logout')
  .map((reason, index) => {
    const limit = DEFAULT_BREAK_LIMITS[reason.code] ?? { allowed_minutes: null, paid: false };
    return {
      name: reason.label,
      code: reason.code,
      category: DEFAULT_CATEGORY_BY_CODE[reason.code] ?? 'other',
      allowed_minutes: limit.allowed_minutes,
      paid: limit.paid,
      max_uses_per_day: null,
      max_total_minutes_per_day: null,
      allow_extension: false,
      max_extension_minutes: null,
      requires_employee_reason: reason.code === 'other',
      requires_manager_approval: false,
      requires_hr_approval: false,
      allow_early_return: true,
      allow_multiple_sessions: true,
      visible_to_employees: true,
      active: true,
      color: null,
      icon: null,
      sort_order: index + 1,
      grace_minutes: 0,
      warning_threshold_minutes: limit.allowed_minutes,
      critical_threshold_minutes: null,
      auto_overdue: true,
      unlimited_duration: limit.allowed_minutes == null,
      daily_maximum_minutes: null,
      weekly_maximum_minutes: null,
    };
  });

@Injectable()
export class BreakPolicyTemplateService {
  getDefaultConfig(): BreakPolicyConfig {
    return this.validateConfig({ break_types: FALLBACK_BREAK_TYPES });
  }

  validateConfig(config: any = {}): BreakPolicyConfig {
    const legacyLimits = this.normalizeLegacyLimits(config.limits);
    const sourceTypes = Array.isArray(config.break_types)
      ? config.break_types
      : this.breakTypesFromLegacyLimits(legacyLimits);

    const breakTypes = sourceTypes.map((item: any, index: number) => this.normalizeBreakType(item, index));
    const activeCodes = new Set<string>();
    for (const breakType of breakTypes) {
      if (activeCodes.has(breakType.code)) {
        throw new BadRequestException(`Duplicate break code '${breakType.code}' in break policy template`);
      }
      activeCodes.add(breakType.code);
    }

    return {
      break_types: breakTypes.sort((a, b) => a.sort_order - b.sort_order),
      limits: this.toLegacyLimits(breakTypes),
      overdue_actions: {
        notify_employee: config.overdue_actions?.notify_employee !== false,
        notify_manager: config.overdue_actions?.notify_manager !== false,
        notify_branch_admin: Boolean(config.overdue_actions?.notify_branch_admin),
        notify_org_admin: Boolean(config.overdue_actions?.notify_org_admin),
        notify_hr: Boolean(config.overdue_actions?.notify_hr),
        escalation_after_minutes: this.optionalNumber(config.overdue_actions?.escalation_after_minutes),
        escalation_levels: Array.isArray(config.overdue_actions?.escalation_levels) ? config.overdue_actions.escalation_levels : [],
        automatic_attendance_flag: config.overdue_actions?.automatic_attendance_flag !== false,
        automatic_payroll_deduction: Boolean(config.overdue_actions?.automatic_payroll_deduction),
        automatic_attendance_request: Boolean(config.overdue_actions?.automatic_attendance_request),
      },
      notifications: {
        warning_timing_minutes: this.optionalNumber(config.notifications?.warning_timing_minutes),
        escalation_timing_minutes: this.optionalNumber(config.notifications?.escalation_timing_minutes),
        recipients: Array.isArray(config.notifications?.recipients) ? config.notifications.recipients : ['employee', 'manager'],
        template_codes: Array.isArray(config.notifications?.template_codes) ? config.notifications.template_codes : [],
      },
    };
  }

  private normalizeBreakType(item: any, index: number): BreakPolicyType {
    const name = String(item.name ?? item.break_name ?? '').trim();
    const code = String(item.code ?? item.break_code ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!name) throw new BadRequestException('Break type name is required');
    if (!code) throw new BadRequestException(`Break code is required for '${name}'`);

    const category = BREAK_POLICY_CATEGORIES.includes(item.category)
      ? item.category
      : (item.paid === false ? 'unpaid_break' : DEFAULT_CATEGORY_BY_CODE[code] ?? 'paid_break');
    const unlimited = Boolean(item.unlimited_duration) || item.allowed_minutes == null;

    return {
      name,
      code,
      category,
      allowed_minutes: unlimited ? null : this.requiredNonNegativeNumber(item.allowed_minutes, `${name} allowed minutes`),
      paid: item.paid ?? category !== 'unpaid_break',
      max_uses_per_day: this.optionalNumber(item.max_uses_per_day),
      max_total_minutes_per_day: this.optionalNumber(item.max_total_minutes_per_day ?? item.daily_maximum_minutes),
      allow_extension: Boolean(item.allow_extension),
      max_extension_minutes: this.optionalNumber(item.max_extension_minutes),
      requires_employee_reason: Boolean(item.requires_employee_reason),
      requires_manager_approval: Boolean(item.requires_manager_approval),
      requires_hr_approval: Boolean(item.requires_hr_approval),
      allow_early_return: item.allow_early_return !== false,
      allow_multiple_sessions: item.allow_multiple_sessions !== false,
      visible_to_employees: item.visible_to_employees !== false,
      active: item.active !== false,
      color: item.color || null,
      icon: item.icon || null,
      sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index + 1,
      grace_minutes: this.optionalNumber(item.grace_minutes) ?? 0,
      warning_threshold_minutes: this.optionalNumber(item.warning_threshold_minutes),
      critical_threshold_minutes: this.optionalNumber(item.critical_threshold_minutes),
      auto_overdue: item.auto_overdue !== false,
      unlimited_duration: unlimited,
      daily_maximum_minutes: this.optionalNumber(item.daily_maximum_minutes ?? item.max_total_minutes_per_day),
      weekly_maximum_minutes: this.optionalNumber(item.weekly_maximum_minutes),
    };
  }

  private normalizeLegacyLimits(limits: any) {
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return null;
    const normalized: Record<string, { allowed_minutes: number | null; paid: boolean }> = {};
    for (const [code, limit] of Object.entries(limits as Record<string, any>)) {
      normalized[code] = {
        allowed_minutes: limit?.allowed_minutes == null ? null : this.requiredNonNegativeNumber(limit.allowed_minutes, `${code} allowed minutes`),
        paid: Boolean(limit?.paid),
      };
    }
    return normalized;
  }

  private breakTypesFromLegacyLimits(limits: Record<string, { allowed_minutes: number | null; paid: boolean }> | null) {
    if (!limits) return FALLBACK_BREAK_TYPES;
    return Object.entries({ ...DEFAULT_BREAK_LIMITS, ...limits }).map(([code, limit], index) => {
      const fallback = FALLBACK_BREAK_TYPES.find((item) => item.code === code);
      return {
        ...(fallback ?? {}),
        name: fallback?.name ?? this.titleize(code),
        code,
        category: DEFAULT_CATEGORY_BY_CODE[code] ?? (limit.paid ? 'paid_break' : 'unpaid_break'),
        allowed_minutes: limit.allowed_minutes,
        paid: limit.paid,
        sort_order: fallback?.sort_order ?? index + 1,
      };
    });
  }

  private toLegacyLimits(breakTypes: BreakPolicyType[]) {
    return Object.fromEntries(
      breakTypes.map((breakType) => [
        breakType.code,
        { allowed_minutes: breakType.allowed_minutes, paid: breakType.paid },
      ]),
    );
  }

  private optionalNumber(value: any): number | null {
    if (value == null || value === '') return null;
    return this.requiredNonNegativeNumber(value, 'Break policy value');
  }

  private requiredNonNegativeNumber(value: any, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${label} must be a non-negative number`);
    }
    return Math.round(parsed);
  }

  private titleize(code: string) {
    return code.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
