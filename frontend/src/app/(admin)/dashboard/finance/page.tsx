'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  DollarSign, TrendingUp, TrendingDown, FileText, CreditCard,
  Wallet, RefreshCw, Plus, ArrowRight, Clock, CheckCircle2,
  AlertTriangle, BarChart3, BookOpen, Receipt,
} from 'lucide-react';
import Link from 'next/link';

/* ── Helpers ──────────────────────────────────────────────────────────── */
const fmt = (n: number | string) => {
  const v = parseFloat(String(n)) || 0;
  return v >= 1_00_000
    ? `₹${(v / 1_00_000).toFixed(1)}L`
    : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ── Stat Card ────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon: Icon, gradient, trend }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  gradient: string; trend?: { dir: 'up' | 'down'; text: string };
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
          {trend && (
            <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${trend.dir === 'up' ? 'bg-white/20' : 'bg-black/20'}`}>
              {trend.dir === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trend.text}
            </span>
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-sm font-medium opacity-90 mt-0.5">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* ── P&L Bar Chart (pure SVG) ─────────────────────────────────────────── */
function PlChart({ months }: { months: any[] }) {
  const maxVal = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
  const h = 120;
  const barW = 16;
  const gap = 8;
  const slotW = barW * 2 + gap + 12;

  return (
    <div className="overflow-x-auto">
      <svg width={slotW * 12} height={h + 40} className="min-w-full">
        {months.map((m, i) => {
          const incH = (m.income / maxVal) * h;
          const expH = (m.expense / maxVal) * h;
          const x = i * slotW + 4;
          return (
            <g key={i}>
              {/* Income bar */}
              <rect x={x} y={h - incH} width={barW} height={incH} rx={3} className="fill-emerald-500/80" />
              {/* Expense bar */}
              <rect x={x + barW + gap} y={h - expH} width={barW} height={expH} rx={3} className="fill-rose-500/70" />
              {/* Month label */}
              <text x={x + barW} y={h + 18} textAnchor="middle" fontSize={10} className="fill-muted-foreground">{MONTHS[m.month - 1]}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" /> Revenue</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm bg-rose-500/70 inline-block" /> Expenses</span>
      </div>
    </div>
  );
}

/* ── Aging Row ────────────────────────────────────────────────────────── */
function AgingBar({ label, amount, maxVal, color }: { label: string; amount: number; maxVal: number; color: string }) {
  const pct = maxVal > 0 ? (amount / maxVal) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{fmt(amount)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Quick Action ─────────────────────────────────────────────────────── */
function QuickAction({ href, label, icon: Icon, color }: { href: string; label: string; icon: React.ElementType; color: string }) {
  return (
    <Link href={href} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border border-border hover:border-primary/40 hover:shadow-md transition-all group`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground text-center">{label}</span>
    </Link>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function FinancePage() {
  const [summary, setSummary] = useState<any>(null);
  const [pl, setPl] = useState<any>(null);
  const [aging, setAging] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, plRes, agingRes] = await Promise.all([
        api.get('/finance/summary'),
        api.get('/finance/reports/pl'),
        api.get('/finance/reports/aging'),
      ]);
      setSummary(sumRes.data.data);
      setPl(plRes.data.data);
      setAging(agingRes.data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading finance data…</p>
      </div>
    );
  }

  const agingMax = aging ? Math.max(aging.buckets.current, aging.buckets.days_30, aging.buckets.days_60, aging.buckets.days_90, aging.buckets.over_90, 1) : 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Finance Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Revenue, payables, expenses & cash position</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Revenue" icon={TrendingUp}
          value={fmt(summary?.total_revenue || 0)}
          sub={`${summary?.invoice_count || 0} paid invoices`}
          gradient="card-gradient-emerald"
          trend={{ dir: 'up', text: 'AR' }}
        />
        <KpiCard
          label="Outstanding AR" icon={FileText}
          value={fmt(summary?.total_expenses || 0)}
          sub="Approved expenses"
          gradient="card-gradient-blue"
        />
        <KpiCard
          label="Payables (AP)" icon={Receipt}
          value={fmt(summary?.total_payables || 0)}
          sub={`${summary?.bill_count || 0} pending bills`}
          gradient="card-gradient-amber"
          trend={(summary?.bill_count || 0) > 0 ? { dir: 'up', text: 'Action needed' } : undefined}
        />
        <KpiCard
          label="Cash Balance" icon={Wallet}
          value={fmt(summary?.cash_balance || 0)}
          sub="Cashbook net position"
          gradient="card-gradient-rose"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
          <QuickAction href="/dashboard/finance/invoices" label="New Invoice" icon={Plus} color="bg-gradient-to-br from-emerald-500 to-emerald-600" />
          <QuickAction href="/dashboard/finance/bills" label="Add Bill" icon={Receipt} color="bg-gradient-to-br from-amber-500 to-amber-600" />
          <QuickAction href="/dashboard/finance/cashbook" label="Cashbook" icon={Wallet} color="bg-gradient-to-br from-blue-500 to-blue-600" />
          <QuickAction href="/dashboard/finance/expenses" label="Expenses" icon={CreditCard} color="bg-gradient-to-br from-purple-500 to-purple-600" />
          <QuickAction href="/dashboard/finance/reimbursements" label="Reimbursements" icon={Receipt} color="bg-gradient-to-br from-teal-500 to-teal-600" />
          <QuickAction href="/dashboard/finance/budgets" label="Budgets" icon={BarChart3} color="bg-gradient-to-br from-rose-500 to-rose-600" />
          <QuickAction href="/dashboard/finance/invoices" label="Invoices" icon={BookOpen} color="bg-gradient-to-br from-indigo-500 to-indigo-600" />
        </div>
      </div>

      {/* P&L Chart + AR Aging */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* P&L Chart */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Profit & Loss — {pl?.year}</h2>
              <p className="text-xs text-muted-foreground">Revenue vs Expenses by month</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className={`text-base font-bold ${(pl?.months?.reduce((a: number, m: any) => a + m.profit, 0) || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {fmt(pl?.months?.reduce((a: number, m: any) => a + m.profit, 0) || 0)}
              </p>
            </div>
          </div>
          {pl?.months ? <PlChart months={pl.months} /> : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
        </div>

        {/* AR Aging */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">AR Aging Report</h2>
              <p className="text-xs text-muted-foreground">Outstanding receivables by age</p>
            </div>
            <Link href="/dashboard/finance/invoices" className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {aging ? (
            <div className="space-y-4">
              <AgingBar label="Current (not due)" amount={aging.buckets.current} maxVal={agingMax} color="bg-emerald-500" />
              <AgingBar label="1–30 days" amount={aging.buckets.days_30} maxVal={agingMax} color="bg-amber-400" />
              <AgingBar label="31–60 days" amount={aging.buckets.days_60} maxVal={agingMax} color="bg-orange-500" />
              <AgingBar label="61–90 days" amount={aging.buckets.days_90} maxVal={agingMax} color="bg-red-500" />
              <AgingBar label="90+ days" amount={aging.buckets.over_90} maxVal={agingMax} color="bg-red-700" />
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 opacity-30 mr-2" />
              <p className="text-sm">No outstanding receivables</p>
            </div>
          )}
        </div>
      </div>

      {/* Pending alerts */}
      {((summary?.pending_expense_count || 0) > 0 || (summary?.bill_count || 0) > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(summary?.pending_expense_count || 0) > 0 && (
            <Link href="/dashboard/finance/expenses" className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl hover:bg-amber-100 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">{summary.pending_expense_count} Pending Expenses</p>
                <p className="text-xs text-amber-700">{fmt(summary.pending_expenses)} awaiting approval</p>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
          {(summary?.bill_count || 0) > 0 && (
            <Link href="/dashboard/finance/bills" className="flex items-center gap-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl hover:bg-rose-100 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-rose-900">{summary.bill_count} Unpaid Bills</p>
                <p className="text-xs text-rose-700">{fmt(summary.total_payables)} payable</p>
              </div>
              <ArrowRight className="w-4 h-4 text-rose-600 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
