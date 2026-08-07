'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Lock, Unlock, Info, AlertTriangle,
  IndianRupee, TrendingUp, Minus, Plus, RotateCcw, CheckCircle2,
} from 'lucide-react';

// ─── State-wise PT slabs ──────────────────────────────────────────────────────

const PT_STATES: Record<string, { name: string; slabs: Array<{ min: number; max: number; amount: number }> }> = {
  karnataka: { name: 'Karnataka', slabs: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: Infinity, amount: 200 }] },
  maharashtra: { name: 'Maharashtra', slabs: [{ min: 0, max: 7500, amount: 0 }, { min: 7501, max: 10000, amount: 175 }, { min: 10001, max: Infinity, amount: 200 }] },
  kerala: { name: 'Kerala', slabs: [{ min: 0, max: 11999, amount: 0 }, { min: 12000, max: 17999, amount: 120 }, { min: 18000, max: 29999, amount: 180 }, { min: 30000, max: Infinity, amount: 200 }] },
  tamil_nadu: { name: 'Tamil Nadu', slabs: [{ min: 0, max: 21000, amount: 0 }, { min: 21001, max: Infinity, amount: 208 }] },
  andhra_pradesh: { name: 'Andhra Pradesh', slabs: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: 19999, amount: 150 }, { min: 20000, max: Infinity, amount: 200 }] },
  telangana: { name: 'Telangana', slabs: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: 19999, amount: 150 }, { min: 20000, max: Infinity, amount: 200 }] },
  west_bengal: { name: 'West Bengal', slabs: [{ min: 0, max: 8499, amount: 0 }, { min: 8500, max: 9999, amount: 90 }, { min: 10000, max: 14999, amount: 110 }, { min: 15000, max: 24999, amount: 130 }, { min: 25000, max: 39999, amount: 150 }, { min: 40000, max: Infinity, amount: 200 }] },
  gujarat: { name: 'Gujarat', slabs: [{ min: 0, max: Infinity, amount: 0 }] },
  rajasthan: { name: 'Rajasthan', slabs: [{ min: 0, max: Infinity, amount: 0 }] },
  delhi: { name: 'Delhi (NCT)', slabs: [{ min: 0, max: Infinity, amount: 0 }] },
  uttar_pradesh: { name: 'Uttar Pradesh', slabs: [{ min: 0, max: Infinity, amount: 0 }] },
  haryana: { name: 'Haryana', slabs: [{ min: 0, max: Infinity, amount: 0 }] },
  punjab: { name: 'Punjab', slabs: [{ min: 0, max: Infinity, amount: 0 }] },
  madhya_pradesh: { name: 'Madhya Pradesh', slabs: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: Infinity, amount: 208 }] },
  odisha: { name: 'Odisha', slabs: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: Infinity, amount: 200 }] },
  assam: { name: 'Assam', slabs: [{ min: 0, max: 9999, amount: 0 }, { min: 10000, max: Infinity, amount: 208 }] },
  himachal_pradesh: { name: 'Himachal Pradesh', slabs: [{ min: 0, max: Infinity, amount: 0 }] },
};

function ptLookup(state: string, gross: number): number {
  const s = PT_STATES[state];
  if (!s) return 0;
  return s.slabs.find(sl => gross >= sl.min && gross <= sl.max)?.amount ?? 0;
}

// ─── Validation types ─────────────────────────────────────────────────────────

interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  detail: string;
}

// ─── Calculation engine ───────────────────────────────────────────────────────

interface CalcResult {
  monthlyCtc: number; annualCtc: number;
  basic: number; hra: number; da: number;
  conveyance: number; medical: number; food: number;
  travel: number; shift: number; bonus: number; special: number;
  gross: number;
  pfEmployer: number; esiEmployer: number; gratuity: number; lwfEmployer: number;
  pfEmployee: number; esiEmployee: number; profTax: number; tds: number; lwfEmployee: number;
  totalDeductions: number; netSalary: number; employerCost: number;
  esiEligible: boolean; deductionOverflow: boolean;
}

function computeSalary(c: Record<string, any>): CalcResult {
  const ov: Record<string, boolean> = c.manual_overrides ?? {};
  const mode: string = c.salary_input_mode || 'annual_ctc';

  // Monthly CTC derivation
  let monthlyCtc = 0;
  if (mode === 'annual_ctc') {
    monthlyCtc = (Number(c.annual_ctc_lpa) || 0) / 12;
  } else if (mode === 'monthly_ctc') {
    monthlyCtc = Number(c.monthly_ctc_input) || 0;
  } else {
    const pct = Number(c.basic_percent_of_ctc) || 40;
    const b = Number(c.basic_monthly_input) || 0;
    monthlyCtc = pct > 0 ? (b * 100) / pct : 0;
  }

  // ── Earnings ──────────────────────────────────────────────────────────────
  const basicPct = Number(c.basic_percent_of_ctc) || 40;
  const basic = ov.basic
    ? Number(c._basic) || 0
    : mode === 'basic_salary'
      ? Number(c.basic_monthly_input) || 0
      : Math.round((basicPct / 100) * monthlyCtc);

  const hraPct = Number(c.hra_percent_of_basic) || 40;
  const hra = ov.hra ? Number(c._hra) || 0 : Math.round((hraPct / 100) * basic);

  const daPct = Number(c.da_percent_of_basic) || 0;
  const da = ov.da ? Number(c._da) || 0 : Math.round((daPct / 100) * basic);

  const conveyance = ov.conveyance ? Number(c._conveyance) || 0 : (Number(c.conveyance_fixed) || 1600);
  const medical = ov.medical ? Number(c._medical) || 0 : (Number(c.medical_fixed) || 1250);
  const food = ov.food ? Number(c._food) || 0 : (Number(c.food_allowance_fixed) || 0);
  const travel = ov.travel ? Number(c._travel) || 0 : (Number(c.travel_allowance_fixed) || 0);
  const shift = ov.shift ? Number(c._shift) || 0 : (Number(c.shift_allowance_fixed) || 0);

  const bonusOn = c.bonus_applicable !== false;
  const bonusPct = Number(c.bonus_percent_of_basic) || 8.33;
  const bonus = bonusOn
    ? ov.bonus
      ? Number(c._bonus) || 0
      : c.bonus_type === 'fixed'
        ? Math.round((Number(c.bonus_fixed_annual) || 0) / 12)
        : Math.round((bonusPct / 100) * basic)
    : 0;

  // ── Employer contributions (needed to derive gross from CTC) ──────────────
  const pfOn = c.pf_applicable !== false;
  const pfEmplPct = Number(c.pf_employer_percent) || 12;
  const pfCap = Number(c.pf_wage_cap) || 15000;
  const pfCapOn = c.pf_cap_enabled !== false;
  const pfBase = pfCapOn ? Math.min(basic, pfCap) : basic;
  const pfEmployer = pfOn ? Math.round((pfEmplPct / 100) * pfBase) : 0;

  const gratOn = c.gratuity_applicable !== false;
  const gratPct = Number(c.gratuity_percent_of_basic) || 4.81;
  const gratuity = gratOn ? Math.round((gratPct / 100) * basic) : 0;

  const lwfOn = c.lwf_applicable || false;
  const lwfEmployer = lwfOn ? Number(c.lwf_employer) || 0 : 0;
  const lwfEmployeeAmt = lwfOn ? Number(c.lwf_employee) || 0 : 0;

  const esiOn = c.esi_applicable !== false;
  const esiCeiling = Number(c.esi_wage_ceiling) || 21000;
  const esiEmplPct = Number(c.esi_employer_percent) || 3.25;
  const esiEmpePct = Number(c.esi_employee_percent) || 0.75;

  // First-pass gross estimate (without ESI, to break the circular dependency)
  const baseSum = basic + hra + da + conveyance + medical + food + travel + shift + bonus;
  const fixedEmplCost = pfEmployer + gratuity + lwfEmployer;
  const estimatedGross = monthlyCtc - fixedEmplCost;
  const esiEligEst = esiOn && estimatedGross <= esiCeiling;
  const esiEmplEst = esiEligEst ? Math.round((esiEmplPct / 100) * estimatedGross) : 0;

  // Special allowance (balancing figure to hit CTC target)
  const targetGross = monthlyCtc - fixedEmplCost - esiEmplEst;
  const special = ov.special
    ? Number(c._special) || 0
    : c.special_allowance_auto !== false
      ? Math.max(0, Math.round(targetGross - baseSum))
      : (Number(c.special_allowance_fixed) ?? 0);

  const gross = baseSum + special;

  // Final ESI with actual gross
  const esiEligible = esiOn && gross <= esiCeiling;
  const esiEmployer = esiEligible ? Math.round((esiEmplPct / 100) * gross) : 0;
  const esiEmployee = esiEligible ? Math.round((esiEmpePct / 100) * gross) : 0;

  // ── Employee deductions ───────────────────────────────────────────────────
  const pfEmplEePct = Number(c.pf_employee_percent) || 12;
  const pfEmployee = pfOn ? Math.round((pfEmplEePct / 100) * pfBase) : 0;

  const ptOn = c.pt_applicable !== false;
  const ptState = c.pt_state || '';
  const ptManual = c.pt_manual_override || false;
  const profTax = ptOn
    ? ptManual ? Number(c.pt_monthly_amount) || 0 : ptLookup(ptState, gross)
    : 0;

  const tdsOn = c.tds_applicable || false;
  const tds = tdsOn ? Number(c.tds_monthly_estimated) || 0 : 0;

  const totalDeductions = pfEmployee + esiEmployee + profTax + tds + lwfEmployeeAmt;
  const netSalary = gross - totalDeductions;
  const employerCost = gross + pfEmployer + esiEmployer + gratuity + lwfEmployer;

  return {
    monthlyCtc: employerCost, annualCtc: employerCost * 12,
    basic, hra, da, conveyance, medical, food, travel, shift, bonus, special, gross,
    pfEmployer, esiEmployer, gratuity, lwfEmployer,
    pfEmployee, esiEmployee, profTax, tds, lwfEmployee: lwfEmployeeAmt,
    totalDeductions, netSalary, employerCost,
    esiEligible, deductionOverflow: totalDeductions > gross,
  };
}

// ─── Validation engine ────────────────────────────────────────────────────────

function computeValidation(calc: CalcResult, config: Record<string, any>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const mode: string = config.salary_input_mode || 'annual_ctc';
  let targetMonthly = 0;
  if (mode === 'annual_ctc') {
    targetMonthly = (Number(config.annual_ctc_lpa) || 0) / 12;
  } else if (mode === 'monthly_ctc') {
    targetMonthly = Number(config.monthly_ctc_input) || 0;
  } else {
    const basicPct = Number(config.basic_percent_of_ctc) || 40;
    const b = Number(config.basic_monthly_input) || 0;
    targetMonthly = basicPct > 0 ? (b * 100) / basicPct : 0;
  }

  if (targetMonthly <= 0) return issues;

  const tol = Math.max(2, Math.round(targetMonthly * 0.002)); // 0.2% rounding tolerance
  const ctcDiff = Math.round(calc.employerCost) - Math.round(targetMonthly);

  if (ctcDiff > tol) {
    issues.push({
      severity: 'error',
      code: 'ctc_excess',
      message: 'Total earnings exceed configured CTC.',
      detail: `Employer cost (${inr(calc.employerCost)}) is ${inr(ctcDiff)} above the ${inr(targetMonthly)}/month CTC target. Reduce one or more salary components or increase the CTC.`,
    });
  } else if (ctcDiff < -tol) {
    const specialAuto = config.special_allowance_auto !== false && !(config.manual_overrides ?? {}).special;
    issues.push({
      severity: 'warning',
      code: 'ctc_deficit',
      message: 'Employer contribution total no longer matches annual CTC.',
      detail: `Employer cost (${inr(calc.employerCost)}) is ${inr(-ctcDiff)} below the ${inr(targetMonthly)}/month CTC target. ${specialAuto ? 'Special allowance was reduced to ₹0 — fixed components may already exceed the CTC.' : 'Increase CTC or adjust salary components.'}`,
    });
  }

  if (calc.deductionOverflow) {
    issues.push({
      severity: 'error',
      code: 'deduction_overflow',
      message: 'Total deductions exceed gross salary.',
      detail: `Deductions (${inr(calc.totalDeductions)}) are greater than gross salary (${inr(calc.gross)}). Net salary is ${inr(calc.netSalary)}.`,
    });
  } else if (calc.netSalary < 0) {
    issues.push({
      severity: 'error',
      code: 'negative_net',
      message: 'Net salary calculation mismatch detected.',
      detail: `Net take-home is ${inr(calc.netSalary)}. Check that deductions do not exceed gross salary.`,
    });
  }

  if (calc.basic > calc.gross && calc.gross > 0) {
    issues.push({
      severity: 'error',
      code: 'basic_exceeds_gross',
      message: 'Salary structure is unbalanced. Please review edited components.',
      detail: `Basic salary (${inr(calc.basic)}) exceeds total gross salary (${inr(calc.gross)}). This indicates conflicting manual overrides.`,
    });
  }

  if (config.pf_applicable !== false) {
    const pfEmplPct = Number(config.pf_employer_percent) || 12;
    const pfEmpePct = Number(config.pf_employee_percent) || 12;
    if (pfEmplPct > 12) {
      issues.push({
        severity: 'warning',
        code: 'pf_employer_excess',
        message: 'Employer PF rate exceeds the statutory 12% maximum.',
        detail: `Employer PF is set to ${pfEmplPct}%. The statutory limit is 12%. Contributions above 12% become taxable in the employee's hands.`,
      });
    }
    if (pfEmpePct > 12) {
      issues.push({
        severity: 'warning',
        code: 'pf_employee_excess',
        message: 'Employee PF rate exceeds the statutory 12% maximum.',
        detail: `Employee PF is set to ${pfEmpePct}%. The statutory maximum is 12%.`,
      });
    }
  }

  if (config.tds_applicable && calc.gross > 0 && calc.tds > calc.gross * 0.5) {
    issues.push({
      severity: 'warning',
      code: 'tds_high',
      message: 'TDS amount appears unusually high relative to gross salary.',
      detail: `Monthly TDS of ${inr(calc.tds)} exceeds 50% of gross salary (${inr(calc.gross)}). Please verify the annual tax liability estimate.`,
    });
  }

  return issues;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function inr(v: number): string {
  if (!v) return '₹0';
  return '₹' + Math.round(v).toLocaleString('en-IN');
}

function inrAnnual(v: number): string {
  const a = (v || 0) * 12;
  if (a >= 100000) return '₹' + (a / 100000).toFixed(2) + 'L';
  return '₹' + Math.round(a).toLocaleString('en-IN');
}

function pct(v: number): string { return v + '%'; }

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, accent = 'violet' }: {
  checked: boolean; onChange: (v: boolean) => void; accent?: string;
}) {
  const bg = checked
    ? accent === 'red' ? 'bg-red-500' : accent === 'blue' ? 'bg-blue-500' : accent === 'emerald' ? 'bg-emerald-500' : 'bg-violet-500'
    : 'bg-slate-200';
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 ${bg}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHdr({ label, count, expanded, onToggle, className, overrideCount = 0 }: {
  label: string; count: number; expanded: boolean; onToggle: () => void; className: string;
  overrideCount?: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border font-semibold text-sm transition-colors ${className}`}
    >
      <span className="flex items-center gap-2">
        {label}
        <span className="text-[10px] font-normal opacity-60">{count} items</span>
        {overrideCount > 0 && (
          <span className="text-[9px] font-bold bg-amber-100 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">
            {overrideCount} manual
          </span>
        )}
      </span>
      {expanded ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
    </button>
  );
}

// ─── Balance status chip ──────────────────────────────────────────────────────

function BalanceStatusChip({ issues }: { issues: ValidationIssue[] }) {
  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');
  if (hasErrors) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Calculation Error
      </span>
    );
  }
  if (hasWarnings) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      Balanced
    </span>
  );
}

// ─── Validation panel ─────────────────────────────────────────────────────────

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-emerald-800">Salary structure balanced successfully.</p>
          <p className="text-[10px] text-emerald-600">All salary calculations are valid.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {issues.map(issue => (
        <div
          key={issue.code}
          className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border ${
            issue.severity === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${issue.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold ${issue.severity === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
              {issue.message}
            </p>
            <p className={`text-[10px] mt-0.5 leading-relaxed ${issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
              {issue.detail}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Percentage config + computed value row ────────────────────────────────────

function PctRow({
  label, formula, pctKey, pctValue, computedValue, overrideKey,
  isOverridden, annual, onPctChange, onOverrideValue, onResetOverride,
}: {
  label: string; formula: string; pctKey: string; pctValue: number;
  computedValue: number; overrideKey: string; isOverridden: boolean;
  annual: boolean;
  onPctChange: (key: string, val: number) => void;
  onOverrideValue: (key: string, val: number) => void;
  onResetOverride: (key: string) => void;
}) {
  const displayVal = annual ? inrAnnual(computedValue) : inr(computedValue);
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <p className="text-[10px] text-slate-400">{formula}</p>
      </div>
      {/* Pct input */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={0}
          max={100}
          step={0.01}
          value={pctValue}
          onChange={e => onPctChange(pctKey, Number(e.target.value))}
          className="w-14 text-right px-1.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
        <span className="text-[10px] text-slate-400">%</span>
      </div>
      {/* Computed value */}
      <div className="flex items-center gap-1 shrink-0">
        {isOverridden ? (
          <>
            <span className="text-[10px] text-amber-500 font-semibold">Manual</span>
            <input
              type="number"
              min={0}
              value={computedValue}
              onChange={e => onOverrideValue(overrideKey, Number(e.target.value))}
              className="w-20 text-right px-1.5 py-1 text-xs border border-amber-300 rounded-lg bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button type="button" onClick={() => onResetOverride(overrideKey)} title="Reset to auto" className="text-slate-400 hover:text-violet-600 transition-colors">
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-slate-800 w-20 text-right">{displayVal}</span>
            <button type="button" onClick={() => onOverrideValue(overrideKey, computedValue)} title="Override manually" className="text-slate-300 hover:text-amber-500 transition-colors">
              <Unlock className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Fixed amount row ─────────────────────────────────────────────────────────

function FixedRow({
  label, formula, fixedKey, fixedValue, computedValue, overrideKey,
  isOverridden, annual, onFixedChange, onOverrideValue, onResetOverride,
}: {
  label: string; formula: string; fixedKey: string; fixedValue: number;
  computedValue: number; overrideKey: string; isOverridden: boolean;
  annual: boolean;
  onFixedChange: (key: string, val: number) => void;
  onOverrideValue: (key: string, val: number) => void;
  onResetOverride: (key: string) => void;
}) {
  const displayVal = annual ? inrAnnual(computedValue) : inr(computedValue);
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <p className="text-[10px] text-slate-400">{formula}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-slate-400">₹</span>
        <input
          type="number"
          min={0}
          value={fixedValue}
          onChange={e => onFixedChange(fixedKey, Number(e.target.value))}
          className="w-20 text-right px-1.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isOverridden ? (
          <>
            <span className="text-[10px] text-amber-500 font-semibold">Manual</span>
            <input
              type="number"
              min={0}
              value={computedValue}
              onChange={e => onOverrideValue(overrideKey, Number(e.target.value))}
              className="w-20 text-right px-1.5 py-1 text-xs border border-amber-300 rounded-lg bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button type="button" onClick={() => onResetOverride(overrideKey)} title="Reset to auto" className="text-slate-400 hover:text-violet-600 transition-colors">
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-slate-800 w-20 text-right">{displayVal}</span>
            <button type="button" onClick={() => onOverrideValue(overrideKey, computedValue)} title="Override manually" className="text-slate-300 hover:text-amber-500 transition-colors">
              <Unlock className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Computed-only row (read-only display) ────────────────────────────────────

function ComputedRow({ label, value, formula, annual, accent = 'slate' }: {
  label: string; value: number; formula: string; annual: boolean; accent?: string;
}) {
  const displayVal = annual ? inrAnnual(value) : inr(value);
  const textCls = accent === 'violet' ? 'text-violet-700' : accent === 'red' ? 'text-red-600' : accent === 'emerald' ? 'text-emerald-700' : 'text-slate-800';
  return (
    <div className="flex items-center justify-between py-2.5 px-1">
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${textCls}`}>{label}</p>
        <p className="text-[10px] text-slate-400">{formula}</p>
      </div>
      <span className={`text-sm font-bold ${textCls}`}>{displayVal}</span>
    </div>
  );
}

// ─── Special allowance row ────────────────────────────────────────────────────

function SpecialAllowanceRow({ config, calc, annual, onChange }: {
  config: Record<string, any>;
  calc: CalcResult;
  annual: boolean;
  onChange: (updates: Record<string, any>) => void;
}) {
  const ov = config.manual_overrides ?? {};
  const isAuto = config.special_allowance_auto !== false && !ov.special;
  const displayVal = annual ? inrAnnual(calc.special) : inr(calc.special);

  const handleManualToggle = () => {
    if (isAuto) {
      onChange({
        _special: calc.special,
        manual_overrides: { ...ov, special: true },
        special_allowance_auto: false,
      });
    } else {
      const next = { ...ov };
      delete next.special;
      onChange({ manual_overrides: next, special_allowance_auto: true });
    }
  };

  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-slate-700">Special Allowance</p>
          {isAuto && (
            <span className="text-[9px] font-bold bg-violet-100 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded-full">AUTO</span>
          )}
        </div>
        <p className="text-[10px] text-slate-400">{isAuto ? 'Balancing figure to reach CTC target' : 'Manually specified'}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!isAuto ? (
          <>
            <span className="text-[10px] text-amber-500 font-semibold">Manual</span>
            <input
              type="number"
              min={0}
              value={config._special ?? calc.special}
              onChange={e => onChange({ _special: Number(e.target.value), manual_overrides: { ...ov, special: true }, special_allowance_auto: false })}
              className="w-20 text-right px-1.5 py-1 text-xs border border-amber-300 rounded-lg bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </>
        ) : (
          <span className="text-sm font-semibold text-slate-800 w-20 text-right">{displayVal}</span>
        )}
        <button type="button" onClick={handleManualToggle} title={isAuto ? 'Override manually' : 'Reset to auto'} className={`transition-colors ${isAuto ? 'text-slate-300 hover:text-amber-500' : 'text-amber-400 hover:text-violet-600'}`}>
          {isAuto ? <Unlock className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ calc, annual, issues }: { calc: CalcResult; annual: boolean; issues: ValidationIssue[] }) {
  const m = (v: number) => annual ? inrAnnual(v) : inr(v);
  const empContribs = calc.pfEmployer + calc.esiEmployer + calc.gratuity + calc.lwfEmployer;
  const annualLabel = calc.annualCtc >= 100000
    ? '₹' + (calc.annualCtc / 100000).toFixed(2) + 'L'
    : inr(calc.annualCtc);

  const items = [
    { label: 'Monthly CTC', value: inr(calc.employerCost), color: 'violet' },
    { label: 'Annual CTC', value: annualLabel, color: 'violet' },
    { label: 'Gross Salary', value: m(calc.gross), color: 'slate' },
    { label: 'Total Deductions', value: m(calc.totalDeductions), color: 'red' },
    { label: 'Net Take-Home', value: m(calc.netSalary), color: 'emerald' },
    { label: 'Employer Contrib.', value: m(empContribs), color: 'slate' },
  ];

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 overflow-hidden">
      <div className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 flex items-center justify-between">
        <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          Live Payroll Summary
        </span>
        <BalanceStatusChip issues={issues} />
      </div>
      <div className="grid grid-cols-6 divide-x divide-violet-200/60">
        {items.map(item => (
          <div key={item.label} className="px-2.5 py-3 text-center">
            <p className="text-[9px] font-semibold text-violet-500 uppercase tracking-wider mb-1 leading-tight">{item.label}</p>
            <p className={`text-sm font-bold ${
              item.color === 'violet' ? 'text-violet-800'
              : item.color === 'red' ? 'text-red-600'
              : item.color === 'emerald' ? 'text-emerald-700'
              : 'text-slate-700'
            }`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PF configuration panel ───────────────────────────────────────────────────

function PFConfig({ config, onChange }: { config: Record<string, any>; onChange: (u: Record<string, any>) => void }) {
  const pfOn = config.pf_applicable !== false;
  const pfEmplPct = Number(config.pf_employer_percent) || 12;
  const pfEmpePct = Number(config.pf_employee_percent) || 12;
  const pfCap = Number(config.pf_wage_cap) || 15000;
  const pfCapOn = config.pf_cap_enabled !== false;

  return (
    <div className={`rounded-xl border-2 transition-all ${pfOn ? 'border-blue-200' : 'border-slate-200'}`}>
      <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl ${pfOn ? 'bg-blue-50' : 'bg-slate-50'}`}>
        <div>
          <p className="text-xs font-bold text-slate-700">Provident Fund (PF)</p>
          <p className="text-[10px] text-slate-400">Employee + Employer PF contributions</p>
        </div>
        <Toggle checked={pfOn} onChange={v => onChange({ pf_applicable: v })} accent="blue" />
      </div>
      {pfOn && (
        <div className="px-4 py-4 space-y-3 bg-white border-t border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Employee PF %</label>
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="number" min={0} max={12} step={0.5} value={pfEmpePct}
                  onChange={e => onChange({ pf_employee_percent: Number(e.target.value) })}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-[10px] text-slate-400">%</span>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Employer PF %</label>
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="number" min={0} max={12} step={0.5} value={pfEmplPct}
                  onChange={e => onChange({ pf_employer_percent: Number(e.target.value) })}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-[10px] text-slate-400">%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-slate-100 bg-slate-50">
            <div>
              <p className="text-[11px] font-semibold text-slate-700">Cap PF at ₹15,000 Basic</p>
              <p className="text-[10px] text-slate-400">Limits PF computation to ₹15,000 basic wage</p>
            </div>
            <Toggle checked={pfCapOn} onChange={v => onChange({ pf_cap_enabled: v })} accent="blue" />
          </div>
          {!pfCapOn && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Custom Wage Cap (₹)</label>
              <input
                type="number" min={0} value={pfCap}
                onChange={e => onChange({ pf_wage_cap: Number(e.target.value) })}
                className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ESI configuration panel ──────────────────────────────────────────────────

function ESIConfig({ config, calc, onChange }: { config: Record<string, any>; calc: CalcResult; onChange: (u: Record<string, any>) => void }) {
  const esiOn = config.esi_applicable !== false;
  const ceiling = Number(config.esi_wage_ceiling) || 21000;
  const esiEmplPct = Number(config.esi_employer_percent) || 3.25;
  const esiEmpePct = Number(config.esi_employee_percent) || 0.75;

  return (
    <div className={`rounded-xl border-2 transition-all ${esiOn ? 'border-blue-200' : 'border-slate-200'}`}>
      <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl ${esiOn ? 'bg-blue-50' : 'bg-slate-50'}`}>
        <div>
          <p className="text-xs font-bold text-slate-700">ESI (Employee State Insurance)</p>
          <p className="text-[10px] text-slate-400">
            {esiOn && !calc.esiEligible
              ? `Not eligible — gross (${inr(calc.gross)}) exceeds ₹${ceiling.toLocaleString('en-IN')} ceiling`
              : 'Employer + Employee ESI split'}
          </p>
        </div>
        <Toggle checked={esiOn} onChange={v => onChange({ esi_applicable: v })} accent="blue" />
      </div>
      {esiOn && (
        <div className="px-4 py-4 space-y-3 bg-white border-t border-slate-100">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Employee %</label>
              <input type="number" min={0} max={5} step={0.01} value={esiEmpePct}
                onChange={e => onChange({ esi_employee_percent: Number(e.target.value) })}
                className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Employer %</label>
              <input type="number" min={0} max={10} step={0.01} value={esiEmplPct}
                onChange={e => onChange({ esi_employer_percent: Number(e.target.value) })}
                className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Wage Ceiling ₹</label>
              <input type="number" min={0} value={ceiling}
                onChange={e => onChange({ esi_wage_ceiling: Number(e.target.value) })}
                className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
          {!calc.esiEligible && esiOn && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-700">Gross salary exceeds ESI wage ceiling — ESI contributions will be ₹0 for this structure.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Professional Tax configuration ───────────────────────────────────────────

function PTConfig({ config, calc, onChange }: { config: Record<string, any>; calc: CalcResult; onChange: (u: Record<string, any>) => void }) {
  const ptOn = config.pt_applicable !== false;
  const ptState = config.pt_state || '';
  const ptManual = config.pt_manual_override || false;
  const ptAmount = Number(config.pt_monthly_amount) || 0;

  const stateSlabs = PT_STATES[ptState];
  const stateLabel = stateSlabs?.name;

  return (
    <div className={`rounded-xl border-2 transition-all ${ptOn ? 'border-red-200' : 'border-slate-200'}`}>
      <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl ${ptOn ? 'bg-red-50' : 'bg-slate-50'}`}>
        <div>
          <p className="text-xs font-bold text-slate-700">Professional Tax (PT)</p>
          <p className="text-[10px] text-slate-400">
            {ptOn && stateLabel ? `${stateLabel} · ${inr(calc.profTax)}/month` : 'State-wise statutory deduction'}
          </p>
        </div>
        <Toggle checked={ptOn} onChange={v => onChange({ pt_applicable: v })} accent="red" />
      </div>
      {ptOn && (
        <div className="px-4 py-4 space-y-3 bg-white border-t border-slate-100">
          <div>
            <label className="text-[11px] font-semibold text-slate-600">State</label>
            <select
              value={ptState}
              onChange={e => onChange({ pt_state: e.target.value, pt_manual_override: false })}
              className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
            >
              <option value="">— Select state —</option>
              {Object.entries(PT_STATES).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>
          </div>

          {ptState && stateSlabs && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-1.5 border-b border-slate-100">
                {stateSlabs.name} PT Slabs
              </p>
              <div className="divide-y divide-slate-100">
                {stateSlabs.slabs.map((sl, i) => {
                  const active = calc.gross >= sl.min && calc.gross <= sl.max;
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-1.5 ${active ? 'bg-red-50' : ''}`}>
                      <span className="text-[10px] text-slate-600">
                        {sl.max === Infinity ? `≥ ₹${sl.min.toLocaleString('en-IN')}` : `₹${sl.min.toLocaleString('en-IN')} – ₹${sl.max.toLocaleString('en-IN')}`}
                      </span>
                      <span className={`text-[10px] font-bold ${active ? 'text-red-600' : 'text-slate-500'}`}>
                        {sl.amount === 0 ? 'Nil' : `₹${sl.amount}/month`}
                        {active && ' ←'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-slate-100 bg-slate-50">
            <p className="text-[11px] font-semibold text-slate-700">Override PT Amount Manually</p>
            <Toggle checked={ptManual} onChange={v => onChange({ pt_manual_override: v })} accent="red" />
          </div>
          {ptManual && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600">PT Amount (₹/month)</label>
              <input type="number" min={0} value={ptAmount}
                onChange={e => onChange({ pt_monthly_amount: Number(e.target.value) })}
                className="mt-1 w-full px-2.5 py-1.5 text-xs border border-red-200 rounded-lg bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

export function SalaryStructureForm({ config, onChange }: Props) {
  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['earnings', 'employer', 'deductions']));

  const calc = useMemo(() => computeSalary(config), [config]);
  const annual = viewMode === 'annual';
  const ov: Record<string, boolean> = config.manual_overrides ?? {};

  const hasModeInputEarly = (() => {
    const mode: string = config.salary_input_mode || 'annual_ctc';
    if (mode === 'annual_ctc') return Number(config.annual_ctc_lpa) > 0;
    if (mode === 'monthly_ctc') return Number(config.monthly_ctc_input) > 0;
    return Number(config.basic_monthly_input) > 0;
  })();
  const issues = useMemo(
    () => hasModeInputEarly ? computeValidation(calc, config) : [],
    [calc, config, hasModeInputEarly],
  );

  const earningsOverrideCount = (['basic', 'hra', 'da', 'conveyance', 'medical', 'food', 'travel', 'shift', 'bonus', 'special'] as const)
    .filter(k => ov[k]).length;

  const toggleSection = (key: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  const patch = (updates: Record<string, any>) => onChange(updates);

  const setOverride = (ovKey: string, val: number) => {
    patch({ [`_${ovKey}`]: val, manual_overrides: { ...ov, [ovKey]: true } });
  };

  const clearOverride = (ovKey: string) => {
    const next = { ...ov };
    delete next[ovKey];
    patch({ manual_overrides: next });
  };

  const mode: string = config.salary_input_mode || 'annual_ctc';

  // Primary input value & label
  const primaryValue = mode === 'annual_ctc'
    ? (config.annual_ctc_lpa ?? '')
    : mode === 'monthly_ctc'
      ? (config.monthly_ctc_input ?? '')
      : (config.basic_monthly_input ?? '');

  const primaryKey = mode === 'annual_ctc' ? 'annual_ctc_lpa'
    : mode === 'monthly_ctc' ? 'monthly_ctc_input' : 'basic_monthly_input';

  const primaryLabel = mode === 'annual_ctc' ? 'Annual CTC (LPA)'
    : mode === 'monthly_ctc' ? 'Monthly CTC' : 'Monthly Basic Salary';

  const primaryPlaceholder = mode === 'annual_ctc' ? 'e.g. 600000' : 'e.g. 50000';

  const hasModeInput = Number(primaryValue) > 0;

  return (
    <div className="space-y-5">

      {/* ── Input mode selector ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <IndianRupee className="w-3.5 h-3.5 text-violet-500" />
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Salary Input Mode</label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: 'annual_ctc', label: 'Annual CTC / LPA', sub: 'e.g. ₹6,00,000/year' },
            { key: 'monthly_ctc', label: 'Monthly CTC', sub: 'e.g. ₹50,000/month' },
            { key: 'basic_salary', label: 'Basic Salary', sub: 'Derive CTC from basic' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => patch({ salary_input_mode: opt.key })}
              className={`flex flex-col items-center px-3 py-2.5 rounded-xl border-2 text-center transition-all ${mode === opt.key
                ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100'
                : 'border-slate-200 bg-white hover:border-violet-300'
                }`}
            >
              <span className={`text-xs font-bold ${mode === opt.key ? 'text-violet-700' : 'text-slate-700'}`}>{opt.label}</span>
              <span className="text-[10px] text-slate-400 mt-0.5">{opt.sub}</span>
            </button>
          ))}
        </div>

        {/* Primary input */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-slate-600">{primaryLabel}</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-violet-500">₹</span>
              <input
                type="number"
                min={0}
                value={primaryValue}
                onChange={e => patch({ [primaryKey]: e.target.value === '' ? '' : Number(e.target.value) })}
                placeholder={primaryPlaceholder}
                className="w-full pl-7 pr-3 py-3 border-2 border-violet-200 rounded-xl text-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 bg-violet-50/50 placeholder-slate-300"
              />
              {hasModeInput && mode === 'annual_ctc' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-violet-500 font-semibold">
                  = {inr(calc.monthlyCtc)}/mo
                </span>
              )}
            </div>
          </div>

          {/* Monthly / Annual toggle */}
          <div className="flex flex-col items-end gap-1 shrink-0 pt-4">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">View</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['monthly', 'annual'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewMode(v)}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${viewMode === v ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {v === 'monthly' ? 'Monthly' : 'Annual'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary card ── */}
      {hasModeInput && <SummaryCard calc={calc} annual={annual} issues={issues} />}

      {/* ── Validation panel ── */}
      {hasModeInput && <ValidationPanel issues={issues} />}

      {/* ── Column headers ── */}
      {hasModeInput && (
        <div className="flex items-center gap-3 px-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          <span className="flex-1">Component</span>
          <span className="w-20 text-center">Rule Config</span>
          <span className="w-28 text-right pr-5">
            {annual ? 'Annual Amount' : 'Monthly Amount'}
          </span>
        </div>
      )}

      {/* ── SECTION: Earnings ── */}
      <div className="space-y-2">
        <SectionHdr
          label="Earnings"
          count={10}
          overrideCount={earningsOverrideCount}
          expanded={expanded.has('earnings')}
          onToggle={() => toggleSection('earnings')}
          className={expanded.has('earnings') ? 'text-violet-800 border-violet-300 bg-violet-50' : 'text-slate-700 border-slate-200 bg-slate-50 hover:bg-slate-100'}
        />

        {expanded.has('earnings') && (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {/* Basic */}
            {mode !== 'basic_salary' ? (
              <div className="px-4">
                <PctRow
                  label="Basic Salary"
                  formula={`${config.basic_percent_of_ctc ?? 40}% of Monthly CTC`}
                  pctKey="basic_percent_of_ctc"
                  pctValue={Number(config.basic_percent_of_ctc) || 40}
                  computedValue={calc.basic}
                  overrideKey="basic"
                  isOverridden={!!ov.basic}
                  annual={annual}
                  onPctChange={(k, v) => patch({ [k]: v })}
                  onOverrideValue={setOverride}
                  onResetOverride={clearOverride}
                />
              </div>
            ) : (
              <div className="px-4">
                <ComputedRow label="Basic Salary" value={calc.basic} formula="Primary input (manual)" annual={annual} />
              </div>
            )}

            {/* HRA */}
            <div className="px-4">
              <PctRow
                label="HRA"
                formula={`${config.hra_percent_of_basic ?? 40}% of Basic`}
                pctKey="hra_percent_of_basic"
                pctValue={Number(config.hra_percent_of_basic) || 40}
                computedValue={calc.hra}
                overrideKey="hra"
                isOverridden={!!ov.hra}
                annual={annual}
                onPctChange={(k, v) => patch({ [k]: v })}
                onOverrideValue={setOverride}
                onResetOverride={clearOverride}
              />
            </div>

            {/* DA */}
            <div className="px-4">
              <PctRow
                label="Dearness Allowance (DA)"
                formula={`${config.da_percent_of_basic ?? 0}% of Basic (usually 0 for private)`}
                pctKey="da_percent_of_basic"
                pctValue={Number(config.da_percent_of_basic) || 0}
                computedValue={calc.da}
                overrideKey="da"
                isOverridden={!!ov.da}
                annual={annual}
                onPctChange={(k, v) => patch({ [k]: v })}
                onOverrideValue={setOverride}
                onResetOverride={clearOverride}
              />
            </div>

            {/* Conveyance */}
            <div className="px-4">
              <FixedRow
                label="Conveyance Allowance"
                formula="Fixed monthly (tax-exempt up to ₹1,600)"
                fixedKey="conveyance_fixed"
                fixedValue={Number(config.conveyance_fixed) ?? 1600}
                computedValue={calc.conveyance}
                overrideKey="conveyance"
                isOverridden={!!ov.conveyance}
                annual={annual}
                onFixedChange={(k, v) => patch({ [k]: v })}
                onOverrideValue={setOverride}
                onResetOverride={clearOverride}
              />
            </div>

            {/* Medical */}
            <div className="px-4">
              <FixedRow
                label="Medical Allowance"
                formula="Fixed monthly (tax-exempt up to ₹1,250)"
                fixedKey="medical_fixed"
                fixedValue={Number(config.medical_fixed) ?? 1250}
                computedValue={calc.medical}
                overrideKey="medical"
                isOverridden={!!ov.medical}
                annual={annual}
                onFixedChange={(k, v) => patch({ [k]: v })}
                onOverrideValue={setOverride}
                onResetOverride={clearOverride}
              />
            </div>

            {/* Food Allowance */}
            <div className="px-4">
              <FixedRow
                label="Food / Meal Allowance"
                formula="Fixed monthly (0 = not applicable)"
                fixedKey="food_allowance_fixed"
                fixedValue={Number(config.food_allowance_fixed) ?? 0}
                computedValue={calc.food}
                overrideKey="food"
                isOverridden={!!ov.food}
                annual={annual}
                onFixedChange={(k, v) => patch({ [k]: v })}
                onOverrideValue={setOverride}
                onResetOverride={clearOverride}
              />
            </div>

            {/* Travel Allowance */}
            <div className="px-4">
              <FixedRow
                label="Travel Allowance"
                formula="Fixed monthly"
                fixedKey="travel_allowance_fixed"
                fixedValue={Number(config.travel_allowance_fixed) ?? 0}
                computedValue={calc.travel}
                overrideKey="travel"
                isOverridden={!!ov.travel}
                annual={annual}
                onFixedChange={(k, v) => patch({ [k]: v })}
                onOverrideValue={setOverride}
                onResetOverride={clearOverride}
              />
            </div>

            {/* Shift Allowance */}
            <div className="px-4">
              <FixedRow
                label="Shift Allowance"
                formula="Fixed monthly (night/special shift premium)"
                fixedKey="shift_allowance_fixed"
                fixedValue={Number(config.shift_allowance_fixed) ?? 0}
                computedValue={calc.shift}
                overrideKey="shift"
                isOverridden={!!ov.shift}
                annual={annual}
                onFixedChange={(k, v) => patch({ [k]: v })}
                onOverrideValue={setOverride}
                onResetOverride={clearOverride}
              />
            </div>

            {/* Bonus */}
            <div className="px-4 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-700">Annual Bonus (Monthly Provision)</p>
                  <p className="text-[10px] text-slate-400">8.33% = statutory minimum bonus under Bonus Act</p>
                </div>
                <Toggle checked={config.bonus_applicable !== false} onChange={v => patch({ bonus_applicable: v })} />
              </div>
              {config.bonus_applicable !== false && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">Type</label>
                    <select
                      value={config.bonus_type || 'percentage'}
                      onChange={e => patch({ bonus_type: e.target.value })}
                      className="mt-1 w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                    >
                      <option value="percentage">% of Basic</option>
                      <option value="fixed">Fixed Annual</option>
                    </select>
                  </div>
                  {(config.bonus_type || 'percentage') === 'percentage' ? (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">% of Basic</label>
                      <input type="number" min={0} max={100} step={0.01}
                        value={Number(config.bonus_percent_of_basic) || 8.33}
                        onChange={e => patch({ bonus_percent_of_basic: Number(e.target.value) })}
                        className="mt-1 w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Annual ₹</label>
                      <input type="number" min={0}
                        value={Number(config.bonus_fixed_annual) || 0}
                        onChange={e => patch({ bonus_fixed_annual: Number(e.target.value) })}
                        className="mt-1 w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400" />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">Monthly ≈</label>
                    <div className="mt-1 flex items-center gap-1 h-[30px]">
                      <span className="text-sm font-bold text-violet-700">{inr(calc.bonus)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Special Allowance */}
            <div className="px-4">
              <SpecialAllowanceRow config={config} calc={calc} annual={annual} onChange={patch} />
            </div>

            {/* Gross total */}
            <div className="px-4 py-3 bg-violet-50 border-t-2 border-violet-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-violet-800">GROSS SALARY</span>
                <div className="text-right">
                  <span className="text-base font-bold text-violet-900">{annual ? inrAnnual(calc.gross) : inr(calc.gross)}</span>
                  {annual && <p className="text-[10px] text-violet-500">{inr(calc.gross)}/month</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION: Employer Contributions ── */}
      <div className="space-y-2">
        <SectionHdr
          label="Employer Contributions"
          count={4}
          expanded={expanded.has('employer')}
          onToggle={() => toggleSection('employer')}
          className={expanded.has('employer') ? 'text-blue-800 border-blue-300 bg-blue-50' : 'text-slate-700 border-slate-200 bg-slate-50 hover:bg-slate-100'}
        />

        {expanded.has('employer') && (
          <div className="space-y-3">
            <PFConfig config={config} onChange={patch} />
            <ESIConfig config={config} calc={calc} onChange={patch} />

            {/* Gratuity */}
            <div className={`rounded-xl border-2 overflow-hidden transition-all ${config.gratuity_applicable !== false ? 'border-blue-200' : 'border-slate-200'}`}>
              <div className={`flex items-center justify-between px-4 py-3 ${config.gratuity_applicable !== false ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <div>
                  <p className="text-xs font-bold text-slate-700">Gratuity</p>
                  <p className="text-[10px] text-slate-400">Employer cost · payable after 5 years of continuous service</p>
                </div>
                <Toggle checked={config.gratuity_applicable !== false} onChange={v => patch({ gratuity_applicable: v })} accent="blue" />
              </div>
              {config.gratuity_applicable !== false && (
                <div className="px-4 py-4 bg-white border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Rate (% of Basic)</label>
                      <div className="flex items-center gap-1 mt-1">
                        <input type="number" min={0} max={10} step={0.01}
                          value={Number(config.gratuity_percent_of_basic) || 4.81}
                          onChange={e => patch({ gratuity_percent_of_basic: Number(e.target.value) })}
                          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <span className="text-[10px] text-slate-400">%</span>
                      </div>
                    </div>
                    <div className="flex items-end pb-1.5">
                      <p className="text-[10px] text-slate-500">
                        = <span className="font-semibold text-blue-700">{inr(calc.gratuity)}/month</span> employer cost
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* LWF */}
            <div className={`rounded-xl border-2 overflow-hidden transition-all ${config.lwf_applicable ? 'border-blue-200' : 'border-slate-200'}`}>
              <div className={`flex items-center justify-between px-4 py-3 ${config.lwf_applicable ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <div>
                  <p className="text-xs font-bold text-slate-700">Labour Welfare Fund (LWF)</p>
                  <p className="text-[10px] text-slate-400">State-specific fixed contribution · usually ₹25–₹75/half-year</p>
                </div>
                <Toggle checked={!!config.lwf_applicable} onChange={v => patch({ lwf_applicable: v })} accent="blue" />
              </div>
              {config.lwf_applicable && (
                <div className="px-4 py-4 bg-white border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Employee Contribution (₹)</label>
                      <input type="number" min={0} value={Number(config.lwf_employee) || 0}
                        onChange={e => patch({ lwf_employee: Number(e.target.value) })}
                        className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Employer Contribution (₹)</label>
                      <input type="number" min={0} value={Number(config.lwf_employer) || 0}
                        onChange={e => patch({ lwf_employer: Number(e.target.value) })}
                        className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Employer cost total */}
            {hasModeInput && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50">
                <div>
                  <span className="text-xs font-bold text-blue-800">TOTAL EMPLOYER COST</span>
                  <p className="text-[10px] text-blue-500">Gross + PF + ESI + Gratuity + LWF</p>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-blue-900">{annual ? inrAnnual(calc.employerCost) : inr(calc.employerCost)}</span>
                  {annual && <p className="text-[10px] text-blue-500">{inr(calc.employerCost)}/month</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION: Employee Deductions ── */}
      <div className="space-y-2">
        <SectionHdr
          label="Employee Deductions"
          count={5}
          expanded={expanded.has('deductions')}
          onToggle={() => toggleSection('deductions')}
          className={expanded.has('deductions') ? 'text-red-800 border-red-300 bg-red-50' : 'text-slate-700 border-slate-200 bg-slate-50 hover:bg-slate-100'}
        />

        {expanded.has('deductions') && (
          <div className="space-y-3">
            {/* Employee PF — driven by same config as employer PF */}
            <div className="border border-slate-200 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Employee PF</p>
                  <p className="text-[10px] text-slate-400">
                    {Number(config.pf_employee_percent) || 12}% of Basic{config.pf_cap_enabled !== false ? ` (capped at ₹${(Number(config.pf_wage_cap) || 15000).toLocaleString('en-IN')})` : ''} = {inr(calc.pfEmployee)}/month
                  </p>
                </div>
                <span className="text-sm font-bold text-red-700">{annual ? inrAnnual(calc.pfEmployee) : inr(calc.pfEmployee)}</span>
              </div>
              {config.pf_applicable === false && (
                <p className="text-[10px] text-slate-400 italic">PF is disabled — enable in Employer Contributions section</p>
              )}
            </div>

            {/* Employee ESI */}
            <div className="border border-slate-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Employee ESI</p>
                  <p className="text-[10px] text-slate-400">
                    {calc.esiEligible
                      ? `${Number(config.esi_employee_percent) || 0.75}% of Gross = ${inr(calc.esiEmployee)}/month`
                      : 'Not eligible (gross exceeds ESI ceiling)'}
                  </p>
                </div>
                <span className="text-sm font-bold text-red-700">{annual ? inrAnnual(calc.esiEmployee) : inr(calc.esiEmployee)}</span>
              </div>
            </div>

            {/* Professional Tax */}
            <PTConfig config={config} calc={calc} onChange={patch} />

            {/* TDS */}
            <div className={`rounded-xl border-2 overflow-hidden transition-all ${config.tds_applicable ? 'border-red-200' : 'border-slate-200'}`}>
              <div className={`flex items-center justify-between px-4 py-3 ${config.tds_applicable ? 'bg-red-50' : 'bg-slate-50'}`}>
                <div>
                  <p className="text-xs font-bold text-slate-700">TDS (Tax Deducted at Source)</p>
                  <p className="text-[10px] text-slate-400">
                    {config.tds_applicable ? 'Estimated monthly TDS — update each year based on declarations' : 'Optional — enter estimated annual tax ÷ 12'}
                  </p>
                </div>
                <Toggle checked={!!config.tds_applicable} onChange={v => patch({ tds_applicable: v })} accent="red" />
              </div>
              {config.tds_applicable && (
                <div className="px-4 py-4 bg-white border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Estimated Monthly TDS (₹)</label>
                      <input type="number" min={0}
                        value={Number(config.tds_monthly_estimated) || 0}
                        onChange={e => patch({ tds_monthly_estimated: Number(e.target.value) })}
                        className="mt-1 w-full px-2.5 py-1.5 text-xs border border-red-200 rounded-lg bg-red-50/50 focus:outline-none focus:ring-1 focus:ring-red-400" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Tax Regime</label>
                      <select
                        value={config.tax_regime || 'new'}
                        onChange={e => patch({ tax_regime: e.target.value })}
                        className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                      >
                        <option value="new">New Regime</option>
                        <option value="old">Old Regime</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Deductions total */}
            {hasModeInput && (
              <div className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 ${calc.deductionOverflow ? 'border-red-400 bg-red-50' : 'border-red-200 bg-red-50'}`}>
                <div>
                  <span className="text-xs font-bold text-red-800">TOTAL DEDUCTIONS</span>
                  <p className="text-[10px] text-red-500">PF + ESI + PT + TDS + LWF</p>
                </div>
                <div className="text-right">
                  <span className={`text-base font-bold ${calc.deductionOverflow ? 'text-red-600' : 'text-red-900'}`}>
                    {annual ? inrAnnual(calc.totalDeductions) : inr(calc.totalDeductions)}
                  </span>
                  {annual && <p className="text-[10px] text-red-500">{inr(calc.totalDeductions)}/month</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION: Other payroll rules ── */}
      <div className="space-y-2">
        <SectionHdr
          label="Payroll Rules"
          count={3}
          expanded={expanded.has('rules')}
          onToggle={() => toggleSection('rules')}
          className={expanded.has('rules') ? 'text-slate-800 border-slate-400 bg-slate-100' : 'text-slate-700 border-slate-200 bg-slate-50 hover:bg-slate-100'}
        />

        {expanded.has('rules') && (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {/* LOP Method */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">LOP Deduction Method</p>
                <p className="text-[10px] text-slate-400">How Loss of Pay is calculated for absent days</p>
              </div>
              <select
                value={config.lop_deduction_method || 'working_days'}
                onChange={e => patch({ lop_deduction_method: e.target.value })}
                className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg w-36 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-slate-700"
              >
                <option value="working_days">Working Days</option>
                <option value="calendar_days">Calendar Days</option>
              </select>
            </div>

            {/* Annual Increment Month */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Annual Increment Month</p>
                <p className="text-[10px] text-slate-400">Month when salary revision takes effect</p>
              </div>
              <select
                value={config.annual_increment_month || 4}
                onChange={e => patch({ annual_increment_month: Number(e.target.value) })}
                className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg w-36 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-slate-700"
              >
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            {/* Stipend Mode */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Stipend Mode</p>
                <p className="text-[10px] text-slate-400">Simple disbursement — skips all salary component calculations</p>
              </div>
              <Toggle checked={!!config.stipend_mode} onChange={v => patch({ stipend_mode: v })} />
            </div>
          </div>
        )}
      </div>

      {/* Net salary line */}
      {hasModeInput && (
        <div className="flex items-center justify-between px-5 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-200">
          <div>
            <p className="text-sm font-bold text-white">NET TAKE-HOME SALARY</p>
            <p className="text-[11px] text-emerald-200">Gross − All Deductions</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-black text-white">{annual ? inrAnnual(calc.netSalary) : inr(calc.netSalary)}</p>
            {annual && <p className="text-[11px] text-emerald-200">{inr(calc.netSalary)}/month</p>}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Detail view (read-only summary for template detail panel) ────────────────

export function SalaryStructureDetailView({ config }: { config: Record<string, any> }) {
  const calc = useMemo(() => computeSalary(config), [config]);
  const mode = config.salary_input_mode || 'annual_ctc';
  const hasInput = (mode === 'annual_ctc' && Number(config.annual_ctc_lpa) > 0)
    || (mode === 'monthly_ctc' && Number(config.monthly_ctc_input) > 0)
    || (mode === 'basic_salary' && Number(config.basic_monthly_input) > 0);

  if (!hasInput) {
    return (
      <div className="space-y-3">
        {[
          ['Basic % of CTC', config.basic_percent_of_ctc ? `${config.basic_percent_of_ctc}%` : '—'],
          ['HRA % of Basic', config.hra_percent_of_basic ? `${config.hra_percent_of_basic}%` : '—'],
          ['PF Applicable', config.pf_applicable !== false ? 'Yes (12%)' : 'No'],
          ['ESI Applicable', config.esi_applicable !== false ? 'Yes' : 'No'],
          ['Gratuity', config.gratuity_applicable !== false ? '4.81% of Basic' : 'No'],
          ['Professional Tax', config.pt_applicable !== false ? (config.pt_state ? PT_STATES[config.pt_state]?.name + ' PT' : 'Yes') : 'No'],
          ['LOP Method', config.lop_deduction_method === 'calendar_days' ? 'Calendar Days' : 'Working Days'],
        ].map(([label, val]) => (
          <div key={label as string} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="text-sm font-semibold text-slate-800">{val}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Monthly CTC', value: inr(calc.employerCost), accent: 'violet' },
          { label: 'Gross Salary', value: inr(calc.gross), accent: 'slate' },
          { label: 'Net Salary', value: inr(calc.netSalary), accent: 'emerald' },
          { label: 'Annual CTC', value: inr(calc.annualCtc / 100000) + 'L', accent: 'violet' },
          { label: 'Deductions', value: inr(calc.totalDeductions), accent: 'red' },
          { label: 'Employer Cost', value: inr(calc.employerCost), accent: 'blue' },
        ].map(item => (
          <div key={item.label} className={`rounded-xl p-3 text-center border ${item.accent === 'violet' ? 'bg-violet-50 border-violet-200' : item.accent === 'emerald' ? 'bg-emerald-50 border-emerald-200' : item.accent === 'red' ? 'bg-red-50 border-red-200' : item.accent === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${item.accent === 'violet' ? 'text-violet-500' : item.accent === 'emerald' ? 'text-emerald-500' : item.accent === 'red' ? 'text-red-500' : item.accent === 'blue' ? 'text-blue-500' : 'text-slate-400'}`}>{item.label}</p>
            <p className={`text-sm font-bold ${item.accent === 'violet' ? 'text-violet-800' : item.accent === 'emerald' ? 'text-emerald-800' : item.accent === 'red' ? 'text-red-800' : item.accent === 'blue' ? 'text-blue-800' : 'text-slate-800'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Earnings breakdown */}
      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Earnings Breakdown</p>
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {[
            ['Basic', calc.basic],
            ['HRA', calc.hra],
            ...(calc.da > 0 ? [['DA', calc.da]] : []),
            ['Conveyance', calc.conveyance],
            ['Medical', calc.medical],
            ...(calc.food > 0 ? [['Food Allowance', calc.food]] : []),
            ...(calc.travel > 0 ? [['Travel Allowance', calc.travel]] : []),
            ...(calc.shift > 0 ? [['Shift Allowance', calc.shift]] : []),
            ...(calc.bonus > 0 ? [['Bonus (monthly)', calc.bonus]] : []),
            ...(calc.special > 0 ? [['Special Allowance', calc.special]] : []),
          ].map(([label, val]) => (
            <div key={label as string} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-slate-600">{label}</span>
              <span className="text-xs font-semibold text-slate-800">{inr(val as number)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 bg-violet-50">
            <span className="text-xs font-bold text-violet-800">Gross Salary</span>
            <span className="text-sm font-bold text-violet-900">{inr(calc.gross)}</span>
          </div>
        </div>
      </div>

      {/* Deductions breakdown */}
      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Deductions</p>
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {[
            ...(calc.pfEmployee > 0 ? [['Employee PF', calc.pfEmployee]] : []),
            ...(calc.esiEmployee > 0 ? [['Employee ESI', calc.esiEmployee]] : []),
            ...(calc.profTax > 0 ? [['Professional Tax', calc.profTax]] : []),
            ...(calc.tds > 0 ? [['TDS', calc.tds]] : []),
            ...(calc.lwfEmployee > 0 ? [['LWF', calc.lwfEmployee]] : []),
          ].map(([label, val]) => (
            <div key={label as string} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-slate-600">{label}</span>
              <span className="text-xs font-semibold text-red-700">− {inr(val as number)}</span>
            </div>
          ))}
          {calc.totalDeductions === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No deductions configured</div>
          )}
        </div>
      </div>
    </div>
  );
}
