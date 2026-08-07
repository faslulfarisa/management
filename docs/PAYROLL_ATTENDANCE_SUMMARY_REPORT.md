# Attendance Summary & Payroll Lock Workflow — Implementation Report

## 1. Why this refactor

The Attendance Summary module is the gate between raw attendance/leave/overtime and payroll. Before this change it was a thin MVP with real correctness gaps:

- **No payroll safety net**: `PayrollService.generatePayslips()` paid **full, unprorated gross salary** to any active employee with no attendance summary at all for the period. The spec's core rule — "no payroll without an approved attendance summary" — was not enforced.
- **Calendar days, not business days**: "working days" was just the number of calendar days in the month. The `holidays` table existed but **no backend service ever queried it**; weekly offs weren't modeled at all.
- **No paid/unpaid leave split**: leave was one undifferentiated `leave_days` bucket, even though `leave_types.paid` already existed.
- **Lock was cosmetic**: locking a summary only changed its own status. It did nothing to stop attendance corrections, leave approvals, or overtime approvals from landing inside an already-locked period.
- **No audit trail for the numbers themselves**: overtime was recomputed live at payslip-generation time instead of being snapshotted on the summary, so there was no durable record of what figure payroll actually ran against.
- **4-state lifecycle with a dead state**: `draft → pending_approval → approved → payroll_locked`, but `pending_approval` was never set by any code path.

This report documents the resulting production-grade workflow.

## 2. Status Lifecycle

```
Draft → Pending Review → Approved → Payroll Locked → Payroll Processed
           ↑       ↓                      ↓
      Request   Rejected ←──────────  Unlock (reopen)
     Correction
```

- **Draft** — newly computed, or sent back via "Request Correction".
- **Pending Review** — computed and awaiting a reviewer. `compute()` lands here directly (no separate "submit" action exists, matching the four explicit approval actions in the spec: Approve / Reject / Request Correction / Recompute).
- **Approved** — reviewed and accepted. Eligible for payroll generation and for locking.
- **Payroll Locked** — locked by a Payroll Manager/admin. Blocks recompute, re-approval, and any attendance/leave/overtime edit affecting the period.
- **Payroll Processed** — payslips for this summary were generated and the payroll run was processed. Terminal unless unlocked.
- **Rejected** — reviewer rejected with a required reason. Can be moved to Draft via "Request Correction" or recomputed back into the queue.
- **Cancelled** *(optional, per spec)* — available via `AttendanceSummaryService.cancel()`; not surfaced as a primary table action.

Unlocking (`payroll_locked`/`payroll_processed` → `approved`) requires `PAYROLL_UNLOCK` and a reason — this is the "reopened by authorized users" exception.

## 3. Business Working Days, Holidays, Weekly Offs

**`backend/src/modules/hr/services/business-days.service.ts`**

- `getWorkWeek(tenantId)` reads `tenants.work_week_config` (JSONB `{mon..sun: boolean}`) — this column and its admin UI (Settings → Operations) already existed; this is the module's first real consumer. Falls back to Mon–Fri if unset.
- `getHolidaySet(tenantId, branchId, periodStart, periodEnd)` reads `holidays` (now branch-aware — see §5). `branch_id IS NULL` = organization-wide; a non-null value scopes the holiday to one branch.
- `classifyPeriod(...)` walks every calendar date in a period and labels it `business`, `weekly_off`, or `holiday` — **holiday wins** when a holiday falls on what would otherwise be a weekly off, so it isn't double-counted.

**Business Working Days formula**: `calendar days in period − holiday days − weekly-off days`, per employee's branch.

Example: a 30-day month with 8 weekly offs and 1 holiday → **21 business working days**.

## 4. Leave, Holiday, and Weekly-Off Payroll Treatment

Per-employee, per-day classification in `AttendanceSummaryService._computeFigures()` (priority order, top wins):

1. **Explicit attendance record** (any status) — present-equivalent statuses (`present`, `work_from_home`, `remote_work`, `business_travel`, `training`, `on_duty`, `comp_off`, `early_exit`, `late`) bucket as **Present**; `half_day` buckets separately; `absent`/`holiday`/`weekly_off`/`paid_leave`/`unpaid_leave` map directly. This lets a manual correction or a worked weekly-off ("On Duty") override the calendar classification.
2. **Holiday** (from `BusinessDaysService`) if no attendance record.
3. **Weekly off** if no attendance record and not a holiday.
4. **Approved leave** (`leave_requests.status='approved'` joined to `leave_types.paid`) if none of the above — split into **Paid Leave** or **Unpaid Leave**.
5. **Absent** — the default when nothing else matches (a business day with no record and no leave).

`late_count` is a modifier (`late_minutes > 0`) layered on top of a Present/Half-Day bucket, not a separate bucket — matching the table's actual column list.

**Payable Days formula**:
```
payable_days = present_days + 0.5 × half_day_count + paid_leave_days + holiday_days + weekly_off_days
```
Unpaid leave, weekly-off-with-no-coverage-issue, and absence never inflate payable days; paid leave, holidays, and weekly offs always count as payable, per spec ("never reduce salary because an employee used approved paid leave").

## 5. Holiday Integration

`backend/migrations/105_attendance_summary_payroll_lock_v2.sql` adds `holidays.branch_id` (nullable FK → `branches`). No backend service previously read this table, so this is purely additive with zero regression risk. `holiday_type` (national/organization/etc.) remains informational — all holiday rows count toward payable days regardless of type; branch scoping is the only behavior-affecting dimension.

## 6. Overtime Rules

Unchanged eligibility/approval gate (`OvertimeService.getApprovedOtForPayroll`): an employee must have an `overtime_policy` template with `ot_applicable=true` **and** at least one `approved` `overtime_request` for the period. Pending/rejected/cancelled OT is never paid.

What changed: `approved_ot_hours` is now **snapshotted onto the summary** at compute time and is what `PayrollService.generatePayslips()` reads — not a live re-query. Overtime premium:
```
hourlyRate = basic / (business_working_days × 8)
overtime   = hourlyRate × approved_ot_hours(snapshot) × policy_multiplier
```
This is what makes the payroll lock meaningful: once locked, the OT figure payroll runs against is fixed, auditable, and traceable to a specific generation version — not subject to drift if OT gets approved/changed after the fact.

New creation-time guards block backdating into a locked period: `OvertimeService.createRequest()` and `LeaveService.createRequest()` call `PayrollLockService.assertPeriodUnlocked()` before inserting; `AttendanceCorrectionsService.create()` does the same against the underlying record's date.

## 7. Payroll Lock — Enforcement Points

`backend/src/modules/platform/services/payroll-lock.service.ts` (lives in the platform module, not hr, specifically so the generic `ApprovalEngineService` — used by leave/OT/correction approvals — can depend on it without a circular hr↔approvals module edge; platform is already a non-circular dependency of both).

- **`lock(tenantId, year, month, scope, userId, reason)`** — blocks if any `draft`/`pending_review` summary exists in the requested scope; locks only `approved` rows matching the scope (never forces org-wide); requires a reason; audits every locked row.
- **`unlock(tenantId, summaryIds, userId, reason)`** — requires `PAYROLL_UNLOCK` + a reason; reverts `payroll_locked`/`payroll_processed` → `approved`.
- **`assertPeriodUnlocked(tenantId, employeeId, fromDate, toDate?)`** — the single guard. Centralized in `ApprovalEngineService._doApprove()` (the one funnel both `approveByEntity()` — used by domain services — and `approve()` — used by the centralized Approval Inbox — flow through), gated to `entity_table ∈ {leave_requests, overtime_requests, attendance_corrections}`. This guarantees the lock can't be bypassed regardless of which UI path an approval comes through.

## 8. Partial Compute & Partial Lock

Both `AttendanceSummaryService.compute()` and `PayrollLockService.lock()` take the same `SummaryScope`:
```ts
{ type: 'organization' | 'branch' | 'department' | 'employees' | 'employee', branchId?, departmentId?, employeeIds? }
```
`compute()` always skips any employee whose existing summary is `payroll_locked`/`payroll_processed`, regardless of scope — "only recompute unlocked summaries" is structural, not scope-dependent.

## 9. Payroll Processing & Duplicate Prevention

`PayrollService.generatePayslips()`:
- Throws `BadRequestException` if **zero** qualifying (`approved`/`payroll_locked`) summaries exist in scope.
- Skips (does not pay) any employee without a qualifying summary or salary structure, reporting `{ employee_id, reason }` in the response's `skipped` array instead of silently paying full gross.
- Proration: `gross × min(payable_days / business_working_days, 1)` (was `present_days / total_working_days`).
- The payslip upsert's `ON CONFLICT ... DO UPDATE ... WHERE payslips.status = 'draft'` clause means an already-processed/paid/rejected payslip is never silently overwritten by a re-run.

`PayrollService.processPayrollRun()`:
- Blocks re-processing a run whose status is already `processed`.
- Stamps every backing attendance summary to `payroll_processed` with `payroll_run_id`, `payslip_count`, `processed_by`, `processed_at`.

## 10. Generation Metadata & Version History

Every summary carries `generated_by`, `generated_at`, `generation_version`. `compute()` only bumps the version (and writes a `payroll_attendance_summary_versions` row) when the computed figures actually differ from the existing row — idempotent re-runs before any correction don't spam history. `recompute()` (explicit single-row action) always writes a version-history entry. Versions are immutable snapshots (full row JSON), never overwritten — `GET /payroll/attendance-summary/:id/versions` returns them newest-first for the UI's comparison view.

## 11. Database Changes

`backend/migrations/105_attendance_summary_payroll_lock_v2.sql` (additive only):
- `payroll_attendance_summary`: widened `status` CHECK (`draft, pending_review, approved, payroll_locked, payroll_processed, rejected, cancelled`); added `branch_id`, `department_id`, `business_working_days`, `holiday_days`, `weekly_off_days`, `paid_leave_days`, `unpaid_leave_days`, `payable_days`, `approved_ot_hours`, `generated_by/at`, `generation_version`, `reviewed_by/at`, `approval_notes`, `rejection_reason`, `correction_notes`, `lock_reason`, `payroll_run_id`, `payslip_count`, `processed_by/at`.
- New table `payroll_attendance_summary_versions` (append-only).
- `holidays.branch_id` (nullable FK → `branches`).

## 12. API Changes

All under `backend/src/modules/hr/controllers/payroll.controller.ts`, `attendance-summary/*`:

| Method & Path | Permission | Purpose |
|---|---|---|
| `GET attendance-summary` | `PAYROLL_VIEW` | List with filters: `branch_id, department_id, employee_id, status, leave_type, attendance_state, search` |
| `GET attendance-summary/kpis` | `PAYROLL_VIEW` | Dashboard KPI cards |
| `GET attendance-summary/:id/versions` | `PAYROLL_VIEW` | Version/comparison history |
| `POST attendance-summary/compute` | `PAYROLL_EDIT` | Scope-aware compute (replaces `/finalize`) |
| `POST attendance-summary/:id/recompute` | `PAYROLL_EDIT` | Single-row recompute |
| `PUT attendance-summary/:id/approve` | `PAYROLL_APPROVE` | Approve (optional notes) |
| `PUT attendance-summary/:id/reject` | `PAYROLL_APPROVE` | Reject (reason required) |
| `PUT attendance-summary/:id/request-correction` | `PAYROLL_APPROVE` | Back to Draft (notes required) |
| `POST attendance-summary/lock` | `PAYROLL_LOCK` *(new)* | Scope-aware lock (reason required) |
| `POST attendance-summary/unlock` | `PAYROLL_UNLOCK` *(new)* | Reopen (reason required) |

CSV export reuses the existing `exportReportCsv` frontend utility against the already-fetched list — no new backend export endpoint, consistent with how Audit Logs/Reports already export.

## 13. UI Changes

New `frontend/src/components/payroll/attendance-summary-tab.tsx` (replacing the inline tab in `payroll/page.tsx`):
- **KPI cards**: Pending Review, Approved, Payroll Locked, Payroll Processed, Rejected, Avg Attendance %, Avg OT Hours, Avg Leave Days, Avg Late Days, Compliance %.
- **Table**: all spec columns (Employee, Code, Branch, Department, Business Working Days, Present, Paid Leave, Unpaid Leave, Holiday, Weekly Off, Absent, Late, Half Day, Approved OT Hours, Payable Days, Status, Version, Last Generated, Actions). Sticky header is inherited for free from the shared `Table`/`TableHeader` primitives (already sticky-by-default app-wide). Client-side sort/paginate (20/page), server-side filter/search.
- **Scope picker** (Organization/Branch/Department/Selected Employees) shared by the Compute and Lock dialogs.
- **Row & bulk actions**: Approve, Reject (reason modal), Request Correction (notes modal), Recompute, Version History; bulk Approve and bulk Lock (via `scope: {type:'employees'}`) and bulk Unlock.
- CSV export of the current filtered/sorted view.

The pre-existing, already-staged simplification of `PayslipsTab` (auto-generate on load, removed manual Generate/Set-Structure buttons) was left untouched — this work is scoped to the Attendance Summary tab and is compatible with it (auto-generation now correctly skips non-qualifying employees per §9).

## 14. RBAC Matrix

| Role | View | Compute | Approve/Reject/Correct | Lock | Unlock | Generate Payroll |
|---|---|---|---|---|---|---|
| Super Admin / Org Admin (and other admin-tier user types) | ✓ (`'*'`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Payroll Manager *(custom role)* | `PAYROLL_VIEW` | `PAYROLL_EDIT` | `PAYROLL_APPROVE` | `PAYROLL_LOCK` | — | `PAYROLL_CREATE` |
| HR Manager *(custom role)* | `PAYROLL_VIEW` | — | `PAYROLL_APPROVE` | — | — | — |
| Attendance Manager *(custom role)* | `PAYROLL_VIEW` | `PAYROLL_EDIT` | — | — | — | — |
| Department Manager *(custom role)* | `PAYROLL_VIEW` (branch-scoped via `AccessScope`) | — | `PAYROLL_APPROVE` (own scope) | — | — | — |
| Employee | view own summary only (existing branch/employee scoping) | — | — | — | — | — |

**Behavior-change note**: `PAYROLL_LOCK` and `PAYROLL_UNLOCK` are new permission strings (`backend/src/shared/permissions.constants.ts`), separated from the existing `PAYROLL_APPROVE` (which previously gated locking too). Admin-tier user types are unaffected (`'*'`). Any **custom role** that previously relied on `PAYROLL_APPROVE` to lock payroll needs `PAYROLL_LOCK` granted explicitly via the existing Roles & Users admin UI — no new code is required for that, it's a data/permission-grant change. This split is intentional: the spec requires HR Manager to approve but not lock.

## 15. Test Coverage

Jest unit tests (mocked `DatabaseService`, matching the existing `leave.service.spec.ts` convention — no real test DB, no Playwright; see §16 for why):

- `business-days.service.spec.ts` — work-week defaults/override, holiday-over-weekly-off priority, business/holiday/weekly-off day counts.
- `attendance-summary.service.spec.ts` — day-bucket classification (present/holiday/weekly-off/paid-leave/unpaid-leave/half-day/absent priority and payable-days formula), attendance-record override of calendar classification, OT snapshot eligibility, scope orchestration (skip-locked, first-compute versioning), approve/reject/request-correction validation.
- `payroll-lock.service.spec.ts` — `assertPeriodUnlocked` overlap detection, lock blocked by draft/pending-review, lock requires a reason and an approved match, unlock requires a reason and a locked/processed match, per-row audit logging.
- `payroll.service.spec.ts` — zero-qualifying-summaries gate, proration formula, OT premium uses the snapshot (not a live re-query), per-employee skip-and-report, no-overwrite of finalized payslips, duplicate-processing prevention, summary stamping on process.
- `approval-engine.service.spec.ts` (extended) — verifies the centralized payroll-lock guard fires on the existing approval funnel without breaking prior eligibility tests.

All 66 backend Jest tests pass (`npx jest`), and `npx tsc --noEmit` is clean on both backend and frontend.

## 16. Test depth — explicit scope decision

This repository has no real-database integration tier and no Playwright/Cypress E2E suite today (confirmed: no `test/jest-e2e.json`, no browser test config). Introducing either would be net-new infrastructure unrelated to the payroll logic itself. Per explicit confirmation during planning, test depth for this feature matches the existing convention: Jest unit/flow tests against a mocked `DatabaseService`. The real risk surface here — calculation correctness and workflow-state transitions — is fully covered by that tier.

## 17. Production Readiness Checklist

- [x] Business Working Days replace calendar-day calculations (`BusinessDaysService`).
- [x] Paid Leave and Unpaid Leave handled via `leave_types.paid` split.
- [x] Holidays and Weekly Offs included in payable-day calculations.
- [x] Only approved overtime contributes to payroll (snapshot, not live).
- [x] Full approval lifecycle: Draft → Pending Review → Approved → Payroll Locked → Payroll Processed, plus Rejected/Cancelled.
- [x] Payroll Lock blocks recompute, re-approval, and attendance/leave/overtime edits in the period (centralized guard).
- [x] Partial compute and partial lock (organization/branch/department/employees/employee scopes).
- [x] Salary proration uses `payable_days / business_working_days`.
- [x] Payslips generated only from approved/locked summaries; zero-summary and per-employee gates enforced.
- [x] Audit trail (`AuditLogService`, `entity_type='attendance_summary'`) and version history (`payroll_attendance_summary_versions`) on every compute/approve/reject/lock/unlock.
- [x] Notifications on Generated/Approved/Rejected/Locked/Unlocked/Correction-Requested (`NotificationEmitterService`, existing in-app/email/SMS preference routing).
- [x] Dashboard KPI cards, full table column set, sticky headers, pagination, search, filters, sort, export, bulk actions.
- [x] Unit test coverage for all calculation and workflow-state logic; backend `tsc`/frontend `tsc` clean.
- [ ] Migration applied to the live database and manually smoke-tested end-to-end (compute → approve/reject → lock → blocked-edit → generate payslips → unlock) — tracked as the final rollout step for this change, not a code gap.
