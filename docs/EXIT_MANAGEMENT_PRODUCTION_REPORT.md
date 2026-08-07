# Exit Management Module — Enterprise Offboarding Implementation Report

## 1. Why this rebuild

The previous Exit Management module was a plain-CRUD MVP over four tables (`exit_requests`, `exit_checklist`, `exit_clearances`, `final_settlements`) with real gaps:

- **No approval workflow** — `status` was set directly by whoever called the API; there was no multi-level Manager → HR → Org Admin chain, no audit trail of who approved what, and no branch-scoped configurability.
- **No RBAC** — the controller only checked `JwtAuthGuard`; any authenticated user could approve, reject, or delete any exit request.
- **No integrations** — Full & Final settlement fields (`gratuity`, `leave_encashment`, `basic_salary`, etc.) were blank text boxes the admin had to type in by hand. Nothing read from Payroll, Leave, or Attendance.
- **No asset tracking** — `final_settlements.asset_recovery` existed but no system tracked what assets an employee held or what they owed back.
- **No automation** — checklist items and department clearances had to be added one at a time per exit; nothing auto-generated them on approval.
- **No account lifecycle** — completing an exit never touched the employee's user account, session, or `employees.status`.
- **No visual history** — only a single `status` column; no stage-by-stage timeline.

This report documents the resulting production system: a configurable, audited, integrated offboarding workflow from resignation through account deactivation, built by **maximally reusing existing platform infrastructure** rather than building parallel systems.

## 2. Architecture: what was reused vs. what is new

Research before implementation found that most of the hard infrastructure this spec calls for already existed elsewhere in the codebase and only needed to be wired in:

| Capability | Reused from | Notes |
|---|---|---|
| Multi-level configurable approvals | `ApprovalEngineService` (`backend/src/modules/approvals/`) | Already drives leave/expense/transfer/payroll/overtime approvals. `branch_approval_chains` already had unused placeholders for `exit_clearance` and `ff_settlement` workflow types — strong evidence this was the intended mechanism. |
| Org/branch/department/role cascading templates | `TemplateService.getResolved()` (`backend/src/modules/platform/`) | Already resolves `sidebar_access`/`leave_policy` templates via priority cascade (employee → designation → department → property → default). Reused as-is for `exit_checklist` templates — no new template table. |
| Payroll/attendance freeze | `PayrollLockService` (`backend/src/modules/platform/`) | `lock(tenantId, year, month, {type:'employee', employeeIds}, actor, reason)` called directly for the exit period. |
| Notifications | `NotificationEmitterService` | Used for every state-changing event. |
| Audit trail | `AuditLogService` | Used for every state-changing event. |
| Account deactivation | `UserService.deactivate()` | Reason-driven status mapping, session/refresh-token revocation, `user_status_history` audit row — reused exactly. |
| PDF generation | client-side `jsPDF` (`frontend/src/lib/generate-payslip-pdf.ts` precedent) | No backend PDF dependency added. |
| Document storage | generic `documents` table | KT attachments, interview attachments, and generated letters all register here with `entity_type='exit_request'`. |
| Asset management | **none — net new** | `backend/src/modules/assets/`, standalone and reusable beyond exit. |

This kept new code limited to what was actually missing: the exit-specific state machine, notice-period/gratuity calculators, the asset module, knowledge transfer, exit interview, the visual timeline, and UI.

## 3. State Lifecycle

```
draft → pending_approval → approved/rejected
                              │
                    notice_period (template auto-applies checklist
                    + clearances + asset recovery starts)
                              │
                    clearance_in_progress
                              │
                    pending_settlement
                              │
                    settled (FnF approved → offboarding orchestrator runs)
                              │
                    completed

Side branches: withdrawn (employee, pre-approval only), cancelled
```

`exit_requests.status` drives the high-level state; `exit_timeline_events` records every stage transition independently of which sub-system drove it (approval engine, checklist completion, clearance, asset recovery, settlement, deactivation) — this is what renders the visual timeline regardless of internal plumbing.

## 4. Approval Engine Integration

**Migration 107** registers `'exit_request'` as a `branch_approval_chains` workflow type and activates the previously-unused `'ff_settlement'` type. **`ApprovalEngineService.ENTITY_SYNC_CONFIG`** gained two entries:

```ts
exit_requests:      { statusCol: 'status', approvedStatus: 'notice_period', rejectedStatus: 'rejected', ... }
final_settlements:  { statusCol: 'payment_status', approvedStatus: 'approved', rejectedStatus: 'rejected', ... }
```

`ExitRequestService.submit()` calls `ApprovalEngineService.submit({ workflowType: 'exit_request', ... })` exactly like `LeaveService.createRequest()` does today. This means:

- Organizations configure the Manager → HR → Org Admin chain (or any other shape) per-branch via the **existing** `branch_approval_chains` admin UI — no new config UI was built.
- Exit approvals **automatically appear** in the existing generic manager inbox at `(manager)/manager/approvals` with zero new frontend plumbing for the inbox itself.
- If no chain is configured for a branch, the engine's existing fallback (org-admin-only) applies — exits are never silently un-approvable.

**Department clearances were deliberately *not* routed through the engine** — they're independent, parallel sign-offs (IT, Finance, Admin can all clear simultaneously), which doesn't fit the engine's sequential-step model. They remain simple per-department status rows in `exit_clearances`, completing the gap where the old module never populated `cleared_by`.

## 5. Notice Period & Gratuity Math

`backend/src/modules/exit-management/utils/notice-period.util.ts` and `gratuity.util.ts` are pure, dependency-free functions (fully unit-tested):

- **Last working date** = `requested_date + notice_period_days − waived_days`, floored at the requested date.
- **Notice-pay recovery** = `dailyBasicRate × max(notice_period_days − daysServed − waivedDays, 0)`, where `daysServed = days between requested_date and last_working_date` (capped at `notice_period_days`). This is measured against the *actual* last working date, not wall-clock "today" — an earlier draft used `new Date()` directly, which made the figure non-deterministic and silently wrong once settlement was calculated after the departure date had already passed; this was caught while writing `final-settlement.service.spec.ts` and fixed.
- **Gratuity** (Payment of Gratuity Act formula): `15 × lastDrawnBasic × roundedYearsOfService / 26`, eligible at ≥5 years of calendar-correct service (statutory rounding: a remainder ≥6 months rounds up to the next full year). `calculateYearsOfService` uses calendar year/month arithmetic rather than `ms / 365.25 days` — the fixed-day-year approximation put an *exact* 5-year tenure fractionally under the eligibility threshold whenever a leap year fell inside the range.

## 6. Exit Templates (auto-generated checklists)

`ExitChecklistService.applyTemplate()` calls `TemplateService.getResolved(tenantId, 'exit_checklist', 'employee', employeeId)` on full approval. If a tenant has configured a template (`template_type='exit_checklist'`, `config.items: [{item, department, is_mandatory, priority, sort_order}]`), those items are bulk-inserted. **If none is configured, a built-in default set is used** (Return Laptop/Disable Email/VPN/Git under IT; Clear Advances/Expense Claims under Finance; FnF/Leave Encashment under Payroll; ID Card/Parking/Keys under Admin; Exit Interview/Policy Ack under HR) — so automation works out of the box with zero setup. Department clearances get a fixed default set (HR, Payroll, Finance, IT, Administration, Reporting Manager) via `ExitClearanceService.applyDefaultDepartments()`.

## 7. Asset Management Module (net new)

`backend/src/modules/assets/` — `asset_types` → `asset_items` → `asset_assignments` (migration 111). Standalone and independently useful for general asset issuance, not just offboarding. On exit-request approval, `AssetAssignmentService.initiateRecovery()` flags every active assignment for that employee as `recovery_pending` and links it to the exit request. IT/Admin record the return via `recordReturn()` (`good`/`damaged`/`lost` + recovery cost); the total rolls automatically into the FnF settlement's `asset_recovery` deduction via `getRecoveryTotal()`.

## 8. Full & Final Settlement — Auto-Calculation

`FinalSettlementService.calculate()` is gated: it refuses to run until all mandatory checklist items are complete, all mandatory clearances are cleared, and all assets are recovered (`assertReadyToCalculate()`). It then pulls, with **no manual entry**:

| Input | Source |
|---|---|
| Basic salary, allowances | `PayrollService.getSalaryStructure()` |
| Pending salary for the final partial month | `AttendanceSummaryService.listSummaries()` × `BusinessDaysService.countBusinessDays()` proration |
| Leave encashment | `LeaveService.getExitEncashmentPreview()` (new method — see §9) |
| Gratuity | `calculateGratuity()`, §5 |
| Notice-pay recovery | `calculateNoticePayRecovery()`, §5 |
| Asset recovery | `AssetAssignmentService.getRecoveryTotal()` |

The full set of inputs is persisted in `final_settlements.calc_breakdown` (JSONB) for audit, and the settlement is submitted through the approval engine as `workflowType: 'ff_settlement'`. Manual overrides (`bonus`, `deductions`, `tax_deduction`, `loan_recovery`) go through `applyManualAdjustment()`, which **requires a reason** and recomputes totals — never a silent edit.

## 9. Leave Encashment — a deliberate fork from the existing self-service path

`LeaveService.createEncashmentRequest()` (the existing self-service encashment flow) explicitly **rejects** requests when the employee's `leave_policy` has `encashment_timing: 'on_exit'` — that timing value exists specifically to gate *this* path. Reusing that method for FnF would therefore throw. Instead, two new methods were added to `LeaveService` (not duplicated into the exit module, since leave-policy parsing belongs in the leave domain):

- `getExitEncashmentPreview(tenantId, employeeId)` — read-only, used by `calculate()` for previews/recalculation.
- `processExitEncashment(tenantId, employeeId, exitRequestId, actorId)` — mutates: zeroes the balance and inserts an `approved` `leave_encashment_requests` row. Called once, by the offboarding orchestrator at finalization — not at calculation time, since `calculate()` can be re-run before approval.

## 10. Knowledge Transfer & Exit Interview

`exit_knowledge_transfers` and `exit_interviews` (migration 110). KT captures responsibilities, current projects, pending tasks, client information, and system access to hand over — **no password/credential field exists anywhere in the schema**, by design. Interview responses (`exit_interviews.responses` JSONB) are free-form against a fixed questionnaire (`EXIT_INTERVIEW_QUESTIONS` in `exit-interview.service.ts`); manager/HR feedback are separate fields; an interview can be explicitly skipped. Neither KT approval nor the interview gates offboarding completion — they're tracked on the timeline but are not blocking, matching how exit interviews function in practice (feedback-oriented, not a legal/financial gate).

## 11. Attendance/Payroll Freeze & Account Deactivation (the offboarding orchestrator)

`ExitOffboardingOrchestratorService.finalize()` runs automatically once the FnF settlement is **fully approved** (`FinalSettlementService.approve()` → `fullyApproved` → `orchestrator.finalize()`). In order:

1. `LeaveService.processExitEncashment()` — finalizes the balance deduction (§9).
2. `PayrollLockService.lock(..., {type:'employee', employeeIds:[id]}, ...)` for the exit period — non-fatal if nothing to lock.
3. Resolves the linked `users` row (`employee_id` FK) and calls `UserService.deactivate()` with a reason resolved from `request_type` → `deactivation_reasons.code` (`resignation→resigned`, `retirement→retired`, `termination`/`absconding→terminated`, `contract_completion→contract_ended`, `mutual_separation→resigned`). This revokes all refresh tokens and records `user_status_history` — reused exactly, no parallel deactivation logic.
4. `employees.status` updated to the matching value (free-text column, no FK — no schema change needed).
5. `exit_requests.status → completed`.

**Archival is status-based, by design** — `employees.status`/`users.status`+`is_active=false`, no new "archive" table. Nothing is deleted; attendance, payroll, leave, performance, and audit history all remain queryable against the employee's existing row. This matches the only precedent in the codebase (no parallel archive-table pattern exists anywhere) and avoids inventing a second offboarding-specific source of truth.

## 12. RBAC

New permission constants (`backend/src/shared/permissions.constants.ts`, mirrored in `frontend/src/lib/permissions.ts`), module `hr.exit*` / `assets`:

`EXIT_VIEW/CREATE/EDIT/APPROVE/DELETE`, `EXIT_CHECKLIST_MANAGE`, `EXIT_CLEARANCE_MANAGE`, `EXIT_SETTLEMENT_VIEW/CALCULATE/APPROVE/PAY`, `EXIT_TEMPLATES_MANAGE`, `ASSETS_VIEW/MANAGE/RECOVER`.

**Migration 112** seeds these into the DB-backed `permissions`/`role_permissions` tables and grants the full set to `Super Admin`, `Tenant Admin`, `HR Manager`, and `Finance Manager` system roles — following the exact precedent of migration 064 (payroll-payment permissions), since `org_admin`/`branch_admin`/`admin` user-types already get `'*'` and don't need explicit grants.

Three controllers, three access models:
- `ExitManagementController` (`/exit-management/*`) — `@RequirePermission(...)` + `PermissionGuard` on every route, branch-scoped via `AccessScope`.
- `ExitSelfServiceController` (`/employees/me/exit/*`) — **no** `PermissionGuard`; ownership-scoped exactly like the existing `/employees/me` convention (`employeeId` forced from the JWT, never the request body; every method double-checks the exit request belongs to the caller before returning/mutating anything).
- `ExitManagerController` (`/manager/exit-requests/:id`) — thin, read-only detail view; the approve/reject action itself is the existing generic `/approvals` inbox (no duplicate action endpoint).

## 13. Frontend

- **Admin** (`frontend/src/app/(admin)/dashboard/hr/exit-management/page.tsx`, full rewrite): 8 dashboard cards (pending/approvals/notice-period/clearances/assets/FnF/interviews/completed), searchable/filterable sticky table, a tabbed detail dialog (timeline/checklist/clearances/knowledge-transfer/assets/interview/settlement) with inline approve/reject/calculate/approve-settlement/mark-paid actions gated by `useCan()`.
- **Employee self-service** (`frontend/src/app/(employee)/exit/page.tsx`, new): desktop/mobile split following the `(employee)/leave` convention exactly — `PortalExit` (desktop, React Query) covers submit/track/withdraw, notice countdown, timeline, read-only checklist/clearance progress, KT submission, asset status, interview form, settlement summary, and document downloads; mobile gets an equivalent simplified view plus a `ExitSubmitSheet` bottom sheet.
- **PDF generation**: `generate-relieving-letter-pdf.ts` and `generate-fnf-statement-pdf.ts`, copying the existing `generate-payslip-pdf.ts` client-side jsPDF pattern (async import, A4-points layout, `autoTable` for the earnings/deductions breakdown, `numberToWords` for the "in words" line).
- **Manager**: no new inbox UI — `exit_request` approvals surface automatically in the existing generic inbox. A dedicated read-only detail page for managers was deliberately **not** built in this pass to avoid modifying the shared `ApprovalInbox` component under time pressure; the backend endpoint (`GET /manager/exit-requests/:id`) is ready for a follow-up frontend page once a per-workflow-type detail slot is added to the generic inbox.
- **Cleanup**: deleted the dead stub at `(admin)/dashboard/hr/exit/page.tsx` (confirmed zero references).

## 14. Testing

Following the repo's actual testing investment (Jest unit tests with mocked `DatabaseService`, no Cypress/Playwright, no separate e2e harness/config):

- **Pure-function tests**: `notice-period.util.spec.ts` (8 cases), `gratuity.util.spec.ts` (6 cases) — including the leap-year eligibility-boundary bug caught above.
- **Service tests** (mocked dependencies, matching `approval-engine.service.spec.ts`/`payroll-lock.service.spec.ts` style): `exit-checklist.service.spec.ts` (template fallback/override, idempotent re-apply, progress %), `asset-assignment.service.spec.ts` (assignment, bulk recovery initiation, return-condition branching, recovery totals), `final-settlement.service.spec.ts` (readiness gating, full aggregation math including proration/gratuity/notice-recovery/asset-recovery, approval → orchestrator handoff, payment-status guard).
- **45 new tests, all passing**; full suite (175 tests, 19 suites) green, including all 130 pre-existing tests — confirming the `ENTITY_SYNC_CONFIG` and `LeaveService` edits didn't regress existing leave/approval flows.
- **No new HTTP-level integration/e2e suite was added.** `rootDir: "src"` + `testRegex: ".*\\.spec\\.ts$"` in `backend/package.json` means only mocked unit specs are wired into `npm test` today; there is no `test/jest-e2e.json`, no `test:e2e` script, and no test-database harness precedent to build against. Introducing one would be new tooling investment disproportionate to the rest of the codebase's testing posture — flagged here rather than done silently.

## 15. Migrations (107–113)

| # | File | Purpose |
|---|---|---|
| 107 | `exit_management_workflow_types.sql` | Registers `exit_request` as a `branch_approval_chains` workflow type |
| 108 | `exit_management_core_extend.sql` | Additive columns on all 4 original tables + expanded status/type CHECK constraints |
| 109 | `exit_timeline_events.sql` | Visual stage-history table |
| 110 | `exit_knowledge_transfer_interview.sql` | `exit_knowledge_transfers`, `exit_interviews` |
| 111 | `asset_management.sql` | `asset_types`, `asset_items`, `asset_assignments` |
| 112 | `exit_management_permissions.sql` | Seeds `permissions`/`role_permissions` for the new RBAC grants |
| 113 | `final_settlements_approval_date.sql` | Adds the `approval_date` column 108 missed (caught by end-to-end verification, §16) |

All applied and verified against the dev database; no constraint conflicts with existing data.

## 16. End-to-end verification against the real database

Beyond the mocked unit suite (§14), the full golden path was run against the actual dev Postgres database via a disposable Nest application context exercising the real, production-wired services (not HTTP, but the same DI graph the controllers use): synthetic employee+user+salary created → self-service submit → admin-override approve → verified the default checklist (13 items) and clearance (6 departments) auto-applied → assigned and recovered a test asset → completed all checklist/clearance/asset gates → calculated the FnF settlement → approved it → verified the offboarding orchestrator ran (attendance frozen, account deactivated, employee status updated, exit marked completed) → verified the full 29-stage timeline → deleted every synthetic record it created. This caught three real bugs that the mocked unit tests structurally could not:

1. **Type-inference crash in `ExitClearanceService.update()`**: the SQL reused `$1` both as a direct column assignment (`status = $1`) and inside a `CASE WHEN $1 = 'cleared'` literal comparison; Postgres couldn't reconcile `varchar` vs. `text` for the same placeholder. Fixed by computing the conditional in JS (matching the existing safe pattern in `ExitChecklistService`) instead of reusing the placeholder in SQL — the same anti-pattern was found and fixed in `ExitKnowledgeTransferService` proactively before it could fail the same way.
2. **`DATE` columns silently treated as strings**: this codebase's `pg` driver uses default type parsing, which returns `DATE` columns as JS `Date` objects, not strings. `final-settlement.service.ts`'s `lastWorkingDate.split('-')` crashed loudly; `calculateGratuity()`/`daysBetween()` would have *silently* miscalculated (string-concatenating a `Date` object via `date + 'T00:00:00Z'` produces a garbage value, not a thrown error) had the crash not surfaced the underlying assumption first. Fixed by adding `toDateOnlyString()` to `notice-period.util.ts` and widening every date-accepting utility function to `string | Date`, normalizing internally — this protects every call site, including ones not directly exercised by this particular run.
3. **Missing `final_settlements.approval_date` column**: migration 108 added `approved_by` for the `ENTITY_SYNC_CONFIG` sync but missed `approval_date` — masked because `exit_requests` already had that column from the original schema, so the omission on the *new* table wasn't visually obvious by comparison. Fixed via migration 113.

This is the reason the verification step in the plan explicitly called for running the code rather than relying on mocks alone — none of these three would have been caught by typecheck, build, or the mocked unit suite, all of which were green throughout.

## 17. Production Readiness Checklist

- [x] Multi-level configurable approvals (reuses existing branch approval chains — zero new config UI needed)
- [x] Notice period auto-calculation, waiver, and pay recovery
- [x] Exit templates auto-generate checklist + clearances on approval (with safe built-in defaults)
- [x] Department clearances independent, gated before settlement/completion
- [x] Asset recovery tracked and rolled into FnF
- [x] FnF auto-calculated from Payroll/Leave/Attendance with full audit breakdown; manual overrides require a reason
- [x] Knowledge transfer (no credentials ever stored) and exit interview (skippable, non-blocking)
- [x] Automatic attendance/payroll freeze, account deactivation, and employee status update on settlement approval — no manual step
- [x] Visual timeline of every stage
- [x] RBAC: admin/HR permission-gated, employee self-service ownership-scoped, manager read-only detail
- [x] Audit log + notifications on every state-changing action
- [x] Admin dashboard, employee self-service portal, PDF letter/statement generation
- [x] Unit test coverage for all calculation logic and state-gating; full existing suite still green
- [x] Full golden path (submit → approve → checklist/clearance/asset auto-generation → settlement → offboarding) verified end-to-end against the real dev database, not just mocks (§16)
- [ ] **Follow-up**: dedicated manager-side exit detail page wired into the generic approval inbox (backend endpoint already exists)
- [ ] **Follow-up**: HTTP-level integration test harness, if/when the team decides to invest in one beyond mocked unit specs
