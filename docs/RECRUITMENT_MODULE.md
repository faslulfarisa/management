# Recruitment / ATS Module — Implementation Report

## 1. Overview

A complete enterprise recruitment/ATS module covering the full lifecycle from workforce planning through vacancy approval, job publishing, candidate sourcing, pipeline/interview management, verification, offers, preboarding, employee conversion, probation/confirmation, campaigns, dashboards, and reports. Built across 7 phases (migrations `116`–`122`), maximizing reuse of existing platform infrastructure (`ApprovalEngineService`, `NotificationEmitterService`, `AuditLogService`, the generic polymorphic `documents` table, `FileUploadService`, `EmployeeService`) rather than duplicating it.

## 2. Architecture: what was reused vs. what is new

| Capability | Reused from | Notes |
|---|---|---|
| Multi-step approvals, SLA, escalation, branch-scoped inbox | `ApprovalEngineService` (`backend/src/modules/approvals/`) | Six `ENTITY_SYNC_CONFIG` entries added: `vacancies`, `job_descriptions`, `offers`, `probation_reviews`, `workforce_plans` (+ `compliance_documents` pre-existing). Each follows the same dual-status split — `approval_status` is engine-owned, the richer `status` lifecycle column is synced by a per-entity `*ApprovalService` after every engine call. |
| Notifications | `NotificationEmitterService` | `sourceModule: 'recruitment'` on every emit; resolves `employees.id` → `users.id` before notifying (vacancies/applications use employee-based "who" columns; interviews use `users.id` directly — see §10). |
| Audit trail | `AuditLogService` / `audit_logs` | `entityType` values: `vacancy`, `job_description`, `application`, `offer`, `probation_review`, `workforce_plan`. |
| Attachments | Generic polymorphic `documents` table + `DocumentService` + `FileUploadService` | `entity_type` values used: `vacancy`, `candidate` (resumes), `candidate_assessment`, `candidate_verification`, `application` (preboarding docs). No new attachments table anywhere in this module. |
| Employee creation | `EmployeeService.create()` / `EmployeeService.confirm()` | `EmployeeConversionService` and `ProbationApprovalService` call these directly — no employee-creation logic duplicated. |
| Candidate-facing email | `EmailService.sendGenericEmail()` (auth module) | Reuses the existing branded HTML wrapper for interview reminders, offer links, rejection notices, welcome communication. |
| Permission checks | `@RequirePermission()` + `PermissionGuard` + `AuthorizationService` | Eight `hr.recruitment:*` permission strings cover the entire module — see §7. |

**Net new**: 7 migrations, ~25 backend services, ~12 controllers, a fully public unauthenticated Career Portal, and the full frontend (10-tab module + public career site).

## 3. Database Schema (migrations 116–122)

| Migration | Tables added/altered |
|---|---|
| `116_vacancy_management.sql` | `vacancies`, `vacancy_comments`, `vacancy_status_history`. 8 `hr.recruitment` permission rows. |
| `117_job_description_management.sql` | `job_descriptions`, `job_description_versions`. ALTERs `job_postings` (the legacy table becomes the publishable unit) with `vacancy_id`, `job_description_id`, `published_at`, `visibility`, `share_token`, `provider`. |
| `118_candidate_application_management.sql` | ALTERs `candidates` (education/experience/skills/certifications JSONB, `dedup_hash`). New `applications` table (candidate ↔ job_posting). |
| `119_recruitment_pipeline_management.sql` | `pipeline_stages`, `candidate_pipeline_history`, `candidate_screenings`, `candidate_assessments`, `candidate_evaluations`, `communication_templates`, `candidate_communications`. ALTERs legacy `interviews` (rounds/panels/scorecards) and `applications` (`current_stage_id`). |
| `120_verification_offer_management.sql` | `candidate_verifications`, `offers`, `offer_versions`, `offer_negotiations`. |
| `121_preboarding_employee_conversion.sql` | `preboarding_checklists`, `probation_reviews`. ALTERs `applications` (`converted_employee_id`, `converted_at`). |
| `122_workforce_planning_campaigns.sql` | `workforce_plans`, `recruitment_campaigns`. ALTERs `applications` (`campaign_id`). |

**Entity-relationship summary** (textual, since this module spans 18 tables):

```
vacancies ──┬─< job_postings (publishable unit) ──< applications >── candidates
            │                                          │
            ├─< vacancy_comments, vacancy_status_history
            │                                          ├─< candidate_pipeline_history (via pipeline_stages)
job_descriptions ──< job_description_versions          ├─< candidate_screenings (1:1)
                                                         ├─< candidate_assessments (1:N)
applications ──< interviews ──< candidate_evaluations   ├─< candidate_verifications (1:N, typed)
            ├─< offers ──< offer_versions, offer_negotiations
            ├─< preboarding_checklists (1:1)
            └─< converted_employee_id ──> employees ──< probation_reviews

recruitment_campaigns ──< applications.campaign_id (attribution, not ownership)
workforce_plans (branch/year scoped, JSONB department/position breakdown — standalone, not FK'd to vacancies)
```

`workforce_plans` is deliberately **not** wired to auto-generate `vacancies` — it is a standalone budgeting/headcount-approval tool. `recruitment_campaigns` is deliberately **not** an approval-engine entity — it's plain CRUD with a `campaign_id` attribution column on `applications`.

## 4. JSONB-over-normalized-tables pattern

Consistent with this module's design preference throughout: flexible, low-cardinality, per-row data is stored as JSONB arrays/objects rather than child tables.

| Table.column | Shape |
|---|---|
| `job_descriptions.kras/kpis/skills/competencies/benefits` | string-tag arrays |
| `candidates.education/experience/skills/certifications` | object arrays |
| `offers.salary_components/benefits` | `[{name, amount, frequency}]` / string array |
| `interviews.scorecard` | `[{panelist_id, rating, recommendation, comments, submitted_at}]` |
| `candidate_evaluations.ratings` | `[{criteria, score, max_score, comment}]` |
| `preboarding_checklists.items` | `[{key, label, category, status, completed_at, completed_by, notes}]` |
| `probation_reviews.goals/review_entries` | object arrays |
| `workforce_plans.breakdown` | `[{department_id, position_id, current_headcount, budgeted_headcount, planned_hires, budget_amount, justification}]` |

## 5. Lifecycle & Status Transitions

Every approval-gated entity follows the same dual-status shape: a coarse `status` lifecycle column (what the UI shows) and an `approval_status` column (what `ApprovalEngineService` owns), kept in sync by a thin `*ApprovalService`.

**Vacancies**: `draft → pending_approval → approved → open → (on_hold ⇄ open) → closed ⇄ reopened → archived`; `rejected` branches back to editable; `cancelled` is terminal.

**Job Descriptions**: `draft → pending_approval → approved`; `rejected → (re-edit) → pending_approval`; `archived` terminal. Versioned (`job_description_versions`, restore-from-version).

**Applications** (coarse): `applied → under_review → shortlisted → (rejected | withdrawn | hired)`. Layered on top, granular **pipeline stage** (`pipeline_stages` + `candidate_pipeline_history`) — tenant-configurable, seeded with 6 defaults (Screening → Assessment → Interview Round 1/2 → HR Round → Offer).

**Offers**: `draft → pending_approval → approved → sent → (accepted | declined | withdrawn | expired)`. Versioned exactly like job descriptions (`offer_versions`, `current_version` counter). `accepted` flips the linked `applications.status` to `'hired'`.

**Preboarding**: `in_progress → completed` (no approval engine — pure checklist state, JSONB items array).

**Probation & Confirmation**: `draft → pending_approval → approved | rejected`. On full approval, `recommendation` drives the outcome: `'confirm'` → `EmployeeService.confirm()` + generated confirmation letter; `'extend'` → pushes `employees.probation_end_date`; `'terminate'` is deliberately left to the existing Exit Management module (not auto-triggered).

**Workforce Plans**: `draft → pending_approval → approved → active → closed`; `rejected` branches back to editable; `cancelled` terminal (no UI action wired for it yet — state exists in the CHECK constraint for future use, not currently reachable from the API).

**Recruitment Campaigns** (no approval engine): `planned → active → (paused ⇄ active) → completed`; `cancelled` terminal.

## 6. Approval Engine Integration

`backend/src/modules/approvals/services/approval-engine.service.ts` `ENTITY_SYNC_CONFIG` entries added by this module:

```ts
vacancies:         { statusCol: 'approval_status', approverCol: 'approved_by', reasonCol: 'approval_reason', ... }
job_descriptions:   { same shape }
offers:             { same shape }
probation_reviews:  { same shape }
workforce_plans:    { same shape }
```

Each pairs with a `workflow_type` string (`vacancy_request`, `job_description`, `offer`, `probation_review` — note: implemented as `'probation_review'` workflow type in `ProbationApprovalService` — and `workforce_plan`) that branch admins configure chains for via the **existing** Approval Chains UI; with no chain configured, the engine's existing org-admin-only fallback applies. All five funnel into the same centralized Approvals inbox with zero new inbox plumbing.

## 7. RBAC / Permission Matrix

**No new permission strings beyond Phase 1's initial eight** — every subsequent phase (2 through 7) reused them:

| Permission | Action |
|---|---|
| `hr.recruitment:view` | Read access to all recruitment entities (vacancies, candidates, pipeline, offers, workforce plans, campaigns, reports) |
| `hr.recruitment:create` | Create vacancies/workforce plans/campaigns; submit for approval |
| `hr.recruitment:edit` | Edit draft/rejected entities; all sub-resource mutations (screening, assessments, interviews, evaluations, verifications, communications, preboarding, conversion, campaigns) |
| `hr.recruitment:approve` | Approve/reject vacancies, JDs, offers, probation reviews, workforce plans |
| `hr.recruitment:close` | Close a vacancy or workforce plan |
| `hr.recruitment:reopen` | Reopen a closed vacancy |
| `hr.recruitment:archive` | Archive a vacancy |
| `hr.recruitment:comment` | Comment on a vacancy |

Granted to `Super Admin` / `Tenant Admin` / `HR Manager` system roles for every tenant (migration `116`). `POSITION_PRESETS` gained "Recruiter" and "Hiring Manager" entries for org-admin self-service role differentiation. Resume/document endpoints deliberately use `hr.recruitment:*` rather than the generic platform `documents:*` permissions, since the latter are broadly granted to all employees by default and would leak resume visibility tenant-wide. The public Career Portal (`/public/career/*`) has **no guards at all** — every endpoint is `@Throttle`d instead, and candidate identity is verified by email-match against the application/offer record, not a session.

## 8. Pipeline / Reports / Dashboard

**Pipeline stages** are tenant-configurable (`pipeline_stages`, admin-managed via `pipeline-stage-manager.tsx`, ↑/↓ reorder not drag-and-drop). **Candidate communication** uses tenant-configurable templates (`communication_templates`, 3 defaults seeded: interview invite, rejection, reminder) with `{{candidate_name}}`/`{{job_title}}`/`{{interview_date}}` placeholders.

**Dashboard** (`GET /recruitment/dashboard`, `RecruitmentDashboardService`): open vacancies, awaiting-approval counts across all 5 approval-gated entities, hiring funnel (applied → in-review → shortlisted → hired), upcoming interviews (7-day window), offers pending response, joining schedule (14-day window from `preboarding_checklists.joining_date`), recruiter workload (open vacancies + active candidates per recruiter), department hiring status, recent activity (last 12 `audit_logs` rows across all recruitment entity types), and 3 KPIs (avg. time-to-hire, avg. decision time, offer acceptance rate). Frontend Overview tab rebuilt against this endpoint using the same gradient `StatCard`/`SectionCard` visual language as the main admin dashboard (`frontend/src/app/(admin)/dashboard/page.tsx`) — not a new visual style.

**Reports** (`backend/src/modules/reports/services/recruitment-reports.service.ts`, registered in the existing `ReportsModule`/`ReportsController` alongside `hr-reports.service.ts` et al., not inside the recruitment module): recruiter performance, source performance, hiring cost (per-campaign cost-per-hire), time-to-hire, offer acceptance, joining ratio, campaign ROI (currently an alias view over the hiring-cost query — same underlying cost/hire computation, different framing, not separately computed). All seven registered in the `/reports/export/csv` service map and on the `/dashboard/reports` hub as a new "Recruitment" category card, plus `/dashboard/reports/recruitment` (sub-tabbed, mirrors `reports/hr/page.tsx` exactly).

## 9. Recruitment Campaigns — integration with `applications.source`

`applications.source` (coarse enum: `career_portal/employee_referral/walk_in/agency/bulk_import/manual`) records **how** a candidate applied. `recruitment_campaigns` + `applications.campaign_id` is the **named, budgeted initiative** layered on top — a campaign can span multiple vacancies (`vacancy_ids UUID[]`) and multiple sources. The two are independent: a campaign-attributed application still carries its own `source` value (e.g. a campus drive funnels through `career_portal` with a `campaign_id` set, not a special `source` value). The public Career Portal's apply endpoint accepts an optional `campaign_id` field for trackable campaign links.

## 10. Integration Points & Gotchas Worth Remembering

- **Interviews use `users.id`, Vacancies use `employees.id`** for their "who" columns (`panel_member_ids` vs `recruiter_id`/`hiring_manager_id`) — different conventions inherited from the legacy `interviews` table predating this module. Easy to cross the streams when touching notification code.
- **Public endpoints mixing an identity field with a validated DTO body**: the global `ValidationPipe({forbidNonWhitelisted: true})` rejects a body if `@Body('email')` is extracted separately alongside `@Body() body: SomeDto` bound to the same request — declare `email` as a field directly on the DTO instead.
- **`job_postings`/`candidates`/`interviews` are the original 014_recruitment.sql tables**, extended in place across Phases 2–4 rather than replaced — every `ALTER TABLE` in this module's migrations is additive.
- **Employee Conversion and Probation Confirmation call `EmployeeService.create()`/`.confirm()` directly** via a `forwardRef(() => HrModule)` import in `recruitment.module.ts` — the only cross-module service dependency this module has outside of Platform/Approvals/Notifications.

## 11. Validation Rules (representative, not exhaustive)

- Vacancy salary/experience ranges: `salary_min <= salary_max`, `experience_min_years <= experience_max_years` (DB CHECK constraints).
- Approval `reason` is mandatory, ≥5 characters, on every approve/reject call across all 5 approval-gated entities (`ApproveXDto`/`RejectXDto` — `@MinLength(5)`).
- Entities are only editable while `status` is `draft` or `rejected`; only `draft` entities are hard-deletable. Enforced server-side in each service (`EDITABLE_STATUSES` guards), not just hidden in the UI.
- `candidate_verifications`/`candidate_assessments`: unique per `(application_id, type)` via DB unique index where the type is fixed-cardinality (verification); freely repeatable where it isn't (assessments — a candidate can have multiple coding tests).
- Employee Conversion requires `status = 'hired'`, no prior conversion (`converted_employee_id IS NULL`), and a resolvable date of joining (override → preboarding → offer, in that order) before calling `EmployeeService.create()`.
- Workforce Plan / Campaign year and budget fields are plain `@IsInt`/`@IsNumber` DTO validation — no cross-field constraints beyond what the DB CHECK enforces (`year >= 2000`).

## 12. Testing

Unit tests (`backend/src/modules/recruitment/services/*.spec.ts`, Jest, mocking `DatabaseService.query` directly — same pattern as `leave.service.spec.ts`/`payroll.service.spec.ts`):

- `vacancy.service.spec.ts` — lifecycle state-machine guards (edit/delete/close/reopen only valid from the correct prior status).
- `application.service.spec.ts` — status/stage transition validation, pipeline history recording.
- `workforce-plan-approval.service.spec.ts` — submit/approve/reject dual-status sync, including the "mid-chain, not yet fully resolved" case that must *not* activate the plan prematurely.
- `employee-conversion.service.spec.ts` — all three pre-conversion guards (already converted / not hired / no joining date) plus the happy path verifying `EmployeeService.create()` receives correctly merged candidate/offer/preboarding data and override precedence.
- `campaign.service.spec.ts` — status validation, cost-per-hire/conversion-rate math including the divide-by-zero guard.

**Not covered by these tests** (acknowledged gap, not an oversight): `vacancy-approval`/`offer-approval`/`probation-approval` services follow the identical pattern already exercised by `workforce-plan-approval.service.spec.ts` and were not separately duplicated; controller-level e2e tests; the Career Portal's public endpoints; the interview reminder cron; permission-guard integration tests (verified manually via code review of `@RequirePermission()` decorators, not exercised end-to-end).

## 13. Outstanding Verification Gap

**No phase of this module has been click-tested in a real browser session.** Every phase (1 through 7) has been statically verified — `tsc --noEmit` clean on both backend and frontend, migrations applied and confirmed via direct DB query, unit tests passing — but the full logged-in lifecycle (create vacancy → approve → publish → apply via Career Portal → screen → interview → offer → accept → convert to employee → probation → confirm) has never been exercised through the actual UI. Attempts in earlier phases were blocked by MFA on the only available test account and a sandboxed Playwright install; per [[feedback_no_security_bypass_for_verification]], generating credentials to script past that was correctly refused rather than worked around. **Before this module is considered production-ready, a logged-in click-through (or a non-MFA test account) is required.**

## 14. Deliberate Scope Cuts (cross-phase summary)

- Evaluation `ratings` JSONB supports per-criteria entries in the data model; the create form only captures overall rating/strengths/concerns/recommendation (no dynamic criteria-row builder).
- Pipeline stage and probation goal/review-entry reordering is ↑/↓ swap, not drag-and-drop.
- Offer `salary_components` is not auto-mapped into `salary_structures`' fixed payroll columns — HR sets up payroll separately.
- No `designation_id` auto-resolution from offers' free-text `designation` field.
- No PDF generation for offer letters or confirmation letters (plain text fields, matching the only precedent in this codebase).
- `workforce_plans` does not auto-generate `vacancies`; `recruitment_campaigns` has no approval workflow — both are intentionally simpler than the vacancy/offer/probation approval chain.
- Job Description, Candidate, and Offer detail pages do not have their own comments/attachments/timeline sections (Vacancy, Pipeline/Application, and Offer-negotiation detail pages do) — flagged in a Phase 7 cross-module audit as a real gap, not patched in this pass to keep scope bounded; left for a future pass if it becomes a real workflow blocker.
- Column-header sort controls exist only on the Vacancies list (the original Phase 1 template); Job Descriptions/Candidates/Pipeline/Interviews/Offers/Onboarding/Workforce Planning/Campaigns lists gained search + real pagination in the Phase 7 polish pass but not sortable columns — would require backend `sortBy` wiring across ~8 services for a cosmetic gain.
