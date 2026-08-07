# Attendance Behaviour Performance Engine — Implementation Report

## 1. Why this engine exists

The Performance Module (`review_cycles`, `kras`, `kpis`, `performance_reviews` — `backend/migrations/019_compliance_performance.sql`) was a bare CRUD shell: `performance_reviews.overall_score` and `.rating` were free-text/numeric passthrough fields with **no formula behind them** — `PerformanceService.createReview()` simply stored whatever the caller sent. Meanwhile the Attendance Module already produced rich, audited data (`attendance_records`, `payroll_attendance_summary`, `attendance_corrections`, `OvertimeService`, `BusinessDaysService`) that had no connection to Performance at all.

This engine closes that gap: it computes a configurable **Attendance Behaviour Score (0–100)** for every employee in a review cycle directly from existing attendance data, snapshots it immutably, blends it with KRA/KPI achievement into an **Overall Performance Score**, and exposes the result across Employee/Manager/Org dashboards and reports — with every business rule (weights, penalties, thresholds, rating buckets) stored in configuration rather than hardcoded.

## 2. Architecture

```
attendance_records, leave_requests, attendance_corrections, holidays, overtime_requests
                              │
                              ▼
              AttendanceBehaviourEngineService.computeMetrics()
        (reuses BusinessDaysService.classifyPeriod + OvertimeService.getApprovedOtForPayroll,
         classifies every day via the shared STATUS_BUCKET map)
                              │
                              ▼
              AttendanceBehaviourEngineService.scoreMetrics()
           (pure formula — see §3 — driven by performance_configuration)
                              │
                              ▼
              attendance_performance_snapshots  (one row per tenant/employee/cycle)
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
   PerformanceScoreEngineService    AttendancePerformanceController
   blends KRA + KPI + Attendance    (config / calculate / recalculate /
   → performance_reviews             snapshots / summary / override / timeline)
```

Key design choices:

- **Scoring source is the cycle's own date range**, not monthly `payroll_attendance_summary` rows — review cycles are quarterly/annual/probation and won't align to calendar months. `STATUS_BUCKET` (the present/absent/leave/holiday classification map) was extracted from `attendance-summary.service.ts` into `backend/src/modules/hr/constants/attendance-status.constants.ts` so both the payroll summary and the performance engine classify a given `attendance_records.status` identically.
- **No parallel version-history table.** Every generate/recalculate/override/config-change call writes to the existing `audit_logs` table (old/new values) — that audit trail doubles as the data source for the Performance Timeline UI, avoiding a second history table to keep in sync.
- **Snapshot vs. override are separate concerns.** `attendance_performance_snapshots` holds the *computed* score and freezes when its cycle is approved/locked. The manager's *override* (adjusted score + required reason) lives on `performance_reviews` — overriding is a review-time decision, not a recomputation of the underlying snapshot.

## 3. Attendance Behaviour Score Formula

All thresholds below are seeded defaults — every value lives in `performance_configuration.config` and is admin-editable (see §7).

Per employee per cycle, over `[period_start, period_end]`:

- `business_working_days` (BWD) — from `BusinessDaysService.classifyPeriod` (holidays + weekly offs excluded).
- `present_days`, `half_day_count`, `late_count`, `unapproved_absence_days`, `paid_leave_days`, `unpaid_leave_days` — from the shared `STATUS_BUCKET` classification of `attendance_records` + `leave_requests`.
- `approved_ot_hours` — `OvertimeService.getApprovedOtForPayroll()`, summed across every calendar month the cycle spans.
- `corrections_count` — rows in `attendance_corrections` requested within the cycle.

```
attendance_percentage            = (present_days + 0.5×half_day_count + paid_leave_days) / BWD × 100
attendance_compliance_percentage = (BWD − unapproved_absence_days) / BWD × 100
```

Seven weighted component scores (each clamped 0–100):

| Component | Default Weight | Formula |
|---|---|---|
| Attendance % | 40% | `attendance_percentage` |
| Punctuality | 20% | `100 − max(0, late_count − lateGraceThreshold) × latePenaltyPoints` |
| Consistency | 10% | `100 − (late_count + half_day_count + unapproved_absence_days)/BWD × 100 × consistencyPenaltyMultiplier` |
| Half-Day Behaviour | 10% | `100 − half_day_count × halfDayPenaltyPoints` |
| Unapproved Absence | 10% | `100 − unapproved_absence_days × unapprovedAbsencePenaltyPoints` |
| Approved Overtime | 5% | `min(approved_ot_hours, otCapHours)/otCapHours × 100` (100 if OT-ineligible) |
| Attendance Corrections | 5% | `100 − max(0, corrections_count − correctionGraceCount) × correctionPenaltyPoints` |

```
behaviour_score = Σ(weight_i × component_i) / Σ(weight_i)
```

A period with zero business working days (e.g. a new joiner mid-cycle) scores a neutral 100 rather than dividing by zero.

**Never penalized**: approved paid leave, company holidays, weekly offs, work-from-home/on-duty/training/comp-off/business-travel — all of these fall in the `present` or `paid_leave` buckets, never `absent`/`half_day`/`late`. Unpaid leave is not separately penalized either; it already lowers `attendance_percentage` by exclusion from the numerator.

Rating buckets (configurable, seeded exactly as specified): **95–100 Outstanding · 85–94 Excellent · 75–84 Good · 60–74 Needs Improvement · <60 Unsatisfactory.**

## 4. Overall Performance Score

```
overall_score = kraScore×kraWeight + kpiScore×kpiWeight + attendanceScore×attendanceWeight
```

Default weights **40 / 40 / 20** (KRA / KPI / Attendance), configurable and validated to sum to 100. If an employee has no KRAs or no KPIs entered yet, that component is excluded and the remaining weights are **re-normalized** — attendance alone can carry the score, which was the explicit goal ("Performance Module should no longer rely only on manually entered KRAs/KPIs").

- `kraScore` (`PerformanceScoreEngineService.computeKraScore`) — weighted average of `manager_score` (fallback `self_score`) across the employee's KRAs, weighted by each KRA's `weightage`.
- `kpiScore` (`computeKpiScore`) — average of `min(actual_value/target_value, 1) × 100` across the employee's KPIs (0% if `target_value ≤ 0`).

## 5. Database Changes

`backend/migrations/106_attendance_performance_engine.sql`:

- **`performance_configuration`** — one JSONB-config row per tenant (`UNIQUE(tenant_id)`), `version` int, `updated_by`. Mirrors the `document_branding_config`/`automation_rules` JSONB pattern already used elsewhere in this codebase rather than ~15 individual typed columns.
- **`attendance_performance_snapshots`** — one row per `(tenant_id, employee_id, cycle_id)`: every raw metric in §3, `component_scores` (JSONB), `behaviour_score`, `behaviour_rating`, `status` (`calculated` → `recalculated` → `frozen`), `generation_version`, `config_version`, `generated_by/at`, `frozen_by/at`.
- **`performance_reviews` ALTER** — `kra_score`, `kpi_score`, `attendance_score`, `attendance_score_original`, `attendance_score_overridden`, `attendance_override_reason/by/at`, `attendance_snapshot_id`, `score_breakdown` (JSONB — weights/components used at compute time, for explainability even after config changes), `locked_at/by`.
- **`review_cycles` ALTER** — `attendance_last_calculated_at`.

## 6. Review Cycle Lifecycle Integration

`PerformanceService.updateCycle()` drives the engine off status transitions (`backend/src/modules/hr/services/performance.service.ts`):

```
draft ──activate──▶ active ──approve──▶ approved ──lock──▶ locked
                      │                    │                 │
                      ▼                    ▼                 ▼
          generateForCycle()      freezeSnapshots()   freezeSnapshots() +
       (snapshot every active                          lock matching
        employee in the tenant)                        performance_reviews
```

- **→ active**: `AttendanceBehaviourEngineService.generateForCycle()` snapshots every employee with `status IN ('active','confirmed','probation')`. Per-employee failures are caught and counted, never abort the batch.
- **Recalculation** while the cycle is `draft`/`active`: `recalculateSnapshot()`/`recalculateForCycle()` — blocked the moment the cycle is `approved` or `locked`, or the individual snapshot is already `frozen`.
- **→ approved / locked**: `freezeSnapshots()` flips every snapshot in the cycle to `status='frozen'`; `locked` additionally stamps `locked_at/by` on every `performance_reviews` row in the cycle, after which `PerformanceService.updateReview()`/`overrideAttendanceScore()` refuse any further write.
- **Automation hook**: `AttendanceSummaryService.approve()` (the existing monthly payroll-attendance-summary approval) now calls `AttendanceBehaviourEngineService.onAttendanceSummaryApproved(tenantId, employeeId, periodStart, periodEnd)`, which refreshes any **active, non-frozen** snapshot whose cycle overlaps that period. Failures here are logged and swallowed — refreshing a forward-looking snapshot must never block a payroll approval.

## 7. Configuration

`AttendanceBehaviourConfigService` (`backend/src/modules/hr/services/attendance-behaviour-config.service.ts`) owns `performance_configuration`. `getConfig()` lazily persists `DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG` (`backend/src/modules/hr/types/attendance-behaviour-config.types.ts`) on first read. `updateConfig()` validates that the 7 component weights sum to 100 and the 3 overall weights sum to 100 (±0.5 tolerance), versions the row, and audit-logs `weightage_updated` (if weights changed) or `config_updated`.

Configurable fields: the 7 component weights, the 3 overall weights, `latePenaltyPoints`, `lateGraceThreshold`, `consistencyPenaltyMultiplier`, `halfDayPenaltyPoints`, `unapprovedAbsencePenaltyPoints`, `otCapHours`, `otNeutralWhenIneligible`, `correctionPenaltyPoints`, `correctionGraceCount`, `complianceThresholdPct`, and the rating-bucket list (label/min/max).

Admin UI: `(admin)/dashboard/hr/performance` → **Configuration** tab (gated by `PERFORMANCE_BEHAVIOUR_CONFIGURE`).

## 8. API Changes

`backend/src/modules/hr/controllers/attendance-performance.controller.ts` (all under `/performance`):

| Endpoint | Purpose |
|---|---|
| `GET/PUT /attendance-behaviour/config` | Read/update the scoring configuration |
| `POST /cycles/:id/calculate-attendance` | Bulk-generate snapshots for a cycle |
| `POST /cycles/:id/recalculate-attendance` | Bulk-recalculate (blocked once approved/locked) |
| `GET /attendance-behaviour/snapshots` | List snapshots, scoped to caller (self/team/branch/org) |
| `GET /attendance-behaviour/summary` | Org/branch/team analytics: averages, top performers, needs-attention, department/branch ranking, most-improved |
| `GET /timeline` | Chronological events for one employee/cycle |
| `POST /reviews/:id/override-attendance-score` | Manager override (reason required, audited) |

`backend/src/modules/hr/controllers/performance.controller.ts` gained `@RequirePermission` on every route (previously **none were gated**) plus a `_capEmployeeFilter` guard on `GET /kras|kpis|reviews`: a plain employee/manager can no longer view another employee's KRA/KPI/review data by passing an arbitrary `employee_id` query param — it's capped to the caller's own id (or their direct reports, for a manager) server-side, regardless of what the client sends.

Reports: `backend/src/modules/reports/services/performance-reports.service.ts` adds 5 report types registered both as direct `GET /reports/performance/*` endpoints and in the CSV/XLSX/PDF export `serviceMap`: `attendance-behaviour`, `department`, `branch`, `employee`, `review-cycle`.

## 9. UI Changes

- **Admin** (`(admin)/dashboard/hr/performance`): new **Attendance Behaviour** tab (summary cards, department/branch ranking charts, top performers, needs attention, most improved) and **Configuration** tab; cycle actions extended from Activate/Close to Activate → Approve → Lock plus a Calculate/Recalculate button; the Review Drawer shows a live attendance-behaviour summary while picking an employee+cycle; each review row has Override and Timeline actions.
- **Employee** (`(employee)/performance`): attendance behaviour card, cycle-over-cycle score trend, the existing `AttendanceCalendar`, own review breakdown, timeline.
- **Manager** (`(manager)/manager/performance`): team table (score/attendance%/late/half-day/unpaid-leave/OT vs. team average), team score comparison chart, top performers / needs attention.
- **Reports** (`(admin)/dashboard/reports/performance`): the 5 new report types via the existing `ReportPageShell`/`ReportTable` framework, CSV/XLSX/PDF export reusing `frontend/src/lib/report-export.ts` — no new export libraries.

## 10. RBAC Matrix

| Role | Attendance Behaviour | Configuration | Override | Recalculate |
|---|---|---|---|---|
| Employee | Own snapshot/review/timeline only | — | — | — |
| Manager (employee with direct reports) | Self + direct reports | — | — | — |
| HR Manager / Admin (`branch_admin`/`admin`) | Their accessible branch(es) | — | — | — |
| Org Admin / Super Admin | Org-wide | Yes | Yes | Yes |

Row-level scope is resolved once per request by `resolvePerformanceScope()` (`backend/src/modules/hr/utils/performance-scope.util.ts`, shared by both performance controllers): `org_admin`/`super_admin` → unrestricted; `branch_admin`/`admin` → their `AccessScope.branchIds`; everyone else → self, plus direct reports (`employees.reporting_manager_id`) if any exist. Permission-gating (`PERFORMANCE_VIEW/EDIT/APPROVE/EXPORT`, `PERFORMANCE_BEHAVIOUR_VIEW/CONFIGURE/RECALCULATE/OVERRIDE`) is enforced via the existing `PermissionGuard`/`@RequirePermission`.

## 11. Audit Logging

Every mutating action writes to the existing `audit_logs` table:

| `entity_type` | `action` | Trigger |
|---|---|---|
| `review_cycle` | `activated` / `approved` / `locked` | `PerformanceService.updateCycle()` status transition |
| `attendance_performance_snapshot` | `score_generated` / `score_recalculated` / `snapshots_frozen` | `AttendanceBehaviourEngineService` |
| `performance_configuration` | `config_updated` / `weightage_updated` | `AttendanceBehaviourConfigService.updateConfig()` |
| `performance_review` | `approved` / `attendance_score_overridden` | `PerformanceService.updateReview()` / `overrideAttendanceScore()` |

The Performance Timeline UI (`PerformanceService.getPerformanceTimeline()`) reads exactly these rows — no separate history table was introduced.

## 12. Test Coverage

| File | Covers |
|---|---|
| `attendance-behaviour-engine.service.spec.ts` | Formula table (perfect score, late/half-day/absence penalties, paid-leave/holiday neutrality, OT cap, correction grace, custom weights, zero-BWD edge case), freeze/lock lifecycle guards |
| `attendance-behaviour-config.service.spec.ts` | Weight-sum validation, lazy default persistence, versioning, `weightage_updated` vs `config_updated` audit action, rating-bucket boundaries |
| `performance-score-engine.service.spec.ts` | KRA weighted average, KPI achievement ratio (incl. zero-target edge case), overall-score weight re-normalization when a component is missing |
| `performance.service.spec.ts` | Cycle lifecycle hooks (activate → generate, lock → freeze + lock reviews, no-op on unrelated update), score blending on review create, lock guards, override workflow (reason required, original-score preserved across repeated overrides), timeline merge/sort |
| `attendance-performance.controller.spec.ts` | Self/team/branch/org scope resolution on snapshot and summary endpoints |
| `performance.controller.spec.ts` | The `_capEmployeeFilter` RBAC fix — spoofed `employee_id` is overridden for employees/managers, untouched for org_admin |

No Playwright/Cypress exists in this repo — "end-to-end" coverage above is delivered as Jest integration-style specs against the controller+service layer, matching the existing `attendance-summary.service.spec.ts` convention.

## 13. Future AI Integration Points

Everything an AI layer would need is already queryable with no further schema changes:

- **Attendance Behaviour Score + full component breakdown** — `attendance_performance_snapshots.component_scores` (JSONB), versioned and frozen post-approval.
- **Performance history / trend** — multiple snapshots per employee across cycles (`GET /performance/attendance-behaviour/snapshots`, no `cycle_id` filter).
- **Review comments, manager/employee feedback** — `performance_reviews.employee_comments` / `.reviewer_comments`.
- **KRA/KPI achievement** — `kras`/`kpis` tables, already joined into `score_breakdown`.
- **Leave/overtime behaviour** — raw metrics on the snapshot (`paid_leave_days`, `unpaid_leave_days`, `approved_ot_hours`, `corrections_count`).
- **Full decision audit trail** — every score generation, recalculation, override, and config change in `audit_logs`, attributable to an actor and timestamp.

A future AI scoring/insights service can read all of the above through the existing endpoints and tables; it does not require a new snapshot shape, a new audit mechanism, or a schema migration to get started.
