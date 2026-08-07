# Compliance & Document Management System — Implementation Report

## 1. Why this rebuild

The previous Compliance module was two flat tables wired to one HR sub-page:

- `compliance_filings` — a monthly PF/ESI/PT/TDS statutory-filing ledger.
- `compliance_documents` — `name`, `document_type`, `issue_date`, `expiry_date`, `notes`. No file attachment, no owner, no branch/department, no employee linkage, no approval, no versioning, no confidentiality, and no audit trail.

There was no concept of an *employee* document vault, no category taxonomy, no expiry workflow beyond a client-side "is this date < 30 days away" check, and no security model beyond "any authenticated user with `hr.compliance:view`."

This report documents the resulting system: a single, RBAC-enforced, audited repository for both **company** documents (statutory registrations, licenses, agreements, financial records, policies) and **employee** documents (identity, education, contracts, certifications, exit paperwork), with versioning, approvals, expiry/renewal workflows, and policy acknowledgement tracking — built by maximizing reuse of existing platform infrastructure.

## 2. Architecture: what was reused vs. what is new

| Capability | Reused from | Notes |
|---|---|---|
| Multi-step approvals, SLA, escalation, branch-scoped inbox | `ApprovalEngineService` (`backend/src/modules/approvals/`) | `compliance_documents` registered in `ENTITY_SYNC_CONFIG` with `workflow_type='compliance_document'`. Admins configure the chain via the **existing** Approval Chains UI — no new chain-config UI was built. With no chain configured, the engine's existing org-admin-only fallback applies. |
| Notifications (expiry, approval, requests, policy publish) | `NotificationEmitterService` | `sourceModule: 'compliance'` on every emit. |
| Audit trail (upload/download/approve/reject/version/delete) | `AuditLogService` / `audit_logs` | No new audit table — `entityType: 'compliance_document'` etc. |
| Branch/org data isolation | `AccessScope` / `branchScopeClause` / `isBranchInScope` (`shared/scope.util.ts`) | Same pattern as `exit-request.service.ts` and the generic `DocumentService`. |
| File storage (MinIO/local) | `FileUploadService` | Extended with a multi-type document-upload path (previously images-only) and a secure/presigned download path. |
| Permission checks | `@RequirePermission()` + `PermissionGuard` + `AuthorizationService` | New permission slugs layered onto the existing registry; no new authorization mechanism. |
| "Manager sees team", "Compliance Officer manages compliance" | `employees.reporting_manager_id` + role/position permission grants | No new user-type/hierarchy concept — these are permission grants assignable via the existing Roles & Users UI, exactly like `PAYROLL_LOCK` etc. |
| Statutory filings ledger | `compliance_filings` | Left untouched; still backs the "Statutory Filings" tab of the Compliance Tracker. |

**Net new**: the `compliance_categories`, `compliance_document_versions`, `compliance_policy_acknowledgements`, `compliance_document_requests`, `compliance_tracker_items` tables; the `compliance_documents` table extended in place (additive `ALTER TABLE`, see §3); a new `ComplianceModule` (services/controllers/DTOs); the expiry-sweep cron; and the full frontend (11 pages + shared components).

A pre-existing generic polymorphic `documents` table (used by exit-management for letters/attachments) was deliberately **not** reused as the document model here — it lacks category/owner/branch/tags/status-lifecycle/versioning/confidentiality, and retrofitting it would have meant changing behavior for its existing consumers. `compliance_documents` is the dedicated, richer model for this system.

## 3. Database Schema (migration `114_compliance_document_management.sql`)

- **`compliance_categories`** — admin-manageable taxonomy. `tenant_id IS NULL` rows are system defaults seeded for every tenant (≈29 company categories, ≈29 employee categories, grouped by `group_label` e.g. "Statutory Registration", "License", "Identity Proof", "Exit"); `tenant_id` set = an org's custom category.
- **`compliance_documents`** (existing table, extended additively) — the central record for *both* company and employee documents, discriminated by `scope` (`company`/`employee`) and nullable `employee_id`. Key columns: `category_id`, `title`, `owner_id`, `department_id`, `branch_id`, `tags[]`, `issue_date`/`expiry_date`/`renewal_date`, `grace_period_days`, `status` (lifecycle), `approval_status` + `approved_by`/`approved_at`/`rejection_reason`/`approval_step`/`approval_log` (approval-engine sync columns), `confidentiality_level`, `current_version`, `document_number`, `issuing_authority`, `extra_fields` (JSONB — license score, etc.), denormalized `file_url`/`file_name`/`file_size_bytes`/`mime_type` for the current version. Legacy rows were backfilled (`scope='company'`, `status='approved'`, mapped to the "Custom" category) so the existing filings/documents data kept working.
  - **Licenses, Certifications, and Government Registrations are not separate tables** — they're `compliance_documents` rows filtered by `category.group_label`, with `document_number`/`issuing_authority`/`extra_fields` covering category-specific metadata. This is the key design decision that avoided turning ~30 spec'd document categories into ~30 tables.
- **`compliance_document_versions`** — append-only, unique `(document_id, version_number)`. Never overwritten; "restore version N" inserts a new version copying N's file pointer.
- **`compliance_policy_acknowledgements`** — one row per `(document, employee, version)`; created in bulk when a policy is published, flipped to `acknowledged` when the employee acts.
- **`compliance_document_requests`** — HR/admin → employee document requests (`pending → uploaded → approved/pending(resubmission)`).
- **`compliance_tracker_items`** + **`compliance_tracker_documents`** — the generic compliance tracker (Labour Law, audits, legal cases, custom), sitting alongside (not replacing) `compliance_filings`.
- 8 new rows in the global `permissions` catalog (`compliance.company_docs:manage`, `compliance.employee_docs:manage`, etc.) so custom roles/positions can be granted compliance permissions through the existing Roles & Users UI.

## 4. Document Lifecycle

```
draft → pending_approval → approved
                          ↘ rejected → (re-edit) → pending_approval
approved → renewal_pending → (renewal submitted) → pending_approval → approved
approved → expired → renewal_pending (grace period elapsed) → …
any non-terminal state → archived | deleted (soft delete)
```

`status` is the lifecycle column; `approval_status` (`not_required/pending/approved/rejected/…`) is the column `ApprovalEngineService.ENTITY_SYNC_CONFIG` writes to directly. `ComplianceApprovalService` mirrors `approval_status` onto `status` after every engine call, keeping one lifecycle column for the UI to read while still reusing the engine's own status vocabulary underneath.

## 5. Approval Engine Integration

`backend/src/modules/approvals/services/approval-engine.service.ts` gained one `ENTITY_SYNC_CONFIG` entry:

```ts
compliance_documents: {
  statusCol: 'approval_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
  approverCol: 'approved_by', approvedAtCol: 'approved_at',
  reasonCol: 'remarks', rejectionReasonCol: 'rejection_reason',
  stepCol: 'approval_step', logCol: 'approval_log',
}
```

`ComplianceApprovalService.submit()` calls `ApprovalEngineService.submit({ workflowType: 'compliance_document', entityTable: 'compliance_documents', ... })` exactly like `LeaveService`/`ExitRequestService` do. Consequences:

- Org admins configure the Manager → Compliance Officer → Org Admin chain (or any shape) per branch via the **existing** Approval Chains admin UI.
- Compliance approvals **automatically appear** in the existing centralized Approvals inbox (`/dashboard/approvals`) with zero new inbox plumbing.
- **Renewal reuses the same workflow** rather than a second chain type: `ComplianceApprovalService.requestRenewal()` uploads the new version (`ComplianceDocumentService.uploadVersion()`), then calls the same `submit()` — so a renewed document goes through the identical approval path as a brand-new one, and `branch_approval_chains` doesn't need a second workflow type configured.

## 6. Versioning

`compliance_document_versions` is append-only. Every upload — initial creation, "Upload new version," and "Request Renewal" — inserts a new row and bumps `compliance_documents.current_version`; nothing is ever overwritten. "Restore previous version N" (`ComplianceDocumentService.restoreVersion`) fetches version N's file pointer and calls the same `uploadVersion()` path with a `"Restored from version N"` change note — i.e. restoring *also* creates a new version rather than rewriting history. The frontend's Version History panel lists every version with uploader/timestamp/change-note and exposes "Restore" on any non-current version.

## 7. RBAC

New permission slugs (`backend/src/shared/permissions.constants.ts`): `COMPLIANCE_COMPANY_DOCS_MANAGE`, `COMPLIANCE_EMPLOYEE_DOCS_MANAGE`, `COMPLIANCE_EMPLOYEE_DOCS_VIEW_OWN`, `COMPLIANCE_APPROVE`, `COMPLIANCE_ADMIN`, `COMPLIANCE_TRACKER_MANAGE`, `COMPLIANCE_POLICY_MANAGE`, `COMPLIANCE_POLICY_ACKNOWLEDGE` (existing `COMPLIANCE_VIEW`/`CREATE`/`EXPORT` reused, not replaced).

| Role | Capability |
|---|---|
| **Employee** | `COMPLIANCE_VIEW` (gate) + `COMPLIANCE_EMPLOYEE_DOCS_VIEW_OWN` + `COMPLIANCE_POLICY_ACKNOWLEDGE` baseline grants. View/upload own documents, fulfil requests addressed to them, acknowledge policies. Row-level scoping (not just the permission gate) restricts what they actually see — see §8. |
| **Manager** | No new user-type — `employees.reporting_manager_id` makes a manager's direct reports' documents visible/approvable in the same scoping logic as a Compliance Officer, without any extra permission grant. |
| **HR** | `COMPLIANCE_EMPLOYEE_DOCS_MANAGE` (granted via role/position) — manage all employee documents, requests. |
| **Org/Compliance Admin** | `COMPLIANCE_COMPANY_DOCS_MANAGE`, `COMPLIANCE_ADMIN` (category/template config), `COMPLIANCE_APPROVE`, `COMPLIANCE_TRACKER_MANAGE`, `COMPLIANCE_POLICY_MANAGE`. Admin-tier hierarchy ranks (`org_admin`/`branch_admin`/`admin`) get `'*'` baseline like every other module. |
| **Super Admin** | Global, unrestricted. |

`COMPLIANCE_VIEW` is granted to the `employee` baseline (same precedent as `PAYROLL_VIEW`) so the read endpoints aren't 403'd for self-service — the *actual* row restriction happens in the service layer (§8), not the permission gate.

## 8. Security

- **Confidentiality gating** (`ComplianceDocumentService.buildVisibilityClause`): `confidential`/`restricted` documents are excluded from list/find results unless the caller is the owner/uploader, holds `COMPLIANCE_ADMIN`/`COMPLIANCE_APPROVE`, or — for employee-scope documents — is the employee themself or their direct manager. Enforced as a SQL `WHERE` fragment (not a post-filter), so it scales and can't be bypassed by pagination.
- **Employee self-scoping**: enforced the same way, independent of confidentiality — a plain employee only ever sees `scope='employee'` rows for themself or their direct reports unless they hold `COMPLIANCE_EMPLOYEE_DOCS_MANAGE`/`COMPLIANCE_ADMIN`.
- **Secure download**: `GET /compliance/documents/:id/download` re-runs the full visibility check, then returns either the local static URL (no presign concept for disk storage) or a 5-minute MinIO presigned URL (`FileUploadService.getSignedDownloadUrl`, `@aws-sdk/s3-request-presigner`) instead of the permanent public object URL.
- **Access/download logging**: every create/update/version/approve/reject/archive/delete/download call writes an `audit_logs` row (`entityType: 'compliance_document'`) via `AuditLogService` — actor, timestamp, IP (where available), old/new values.
- **Branch isolation**: every list/find applies the existing `AccessScope` pattern, same as `exit-request.service.ts`.
- **Not implemented in application code** (infra/ops, called out rather than faked): at-rest encryption is a MinIO bucket policy (SSE), not something the application layer controls — flagged in the production-readiness checklist (§12).

## 9. Expiry And Renewal Workflows

- **`ComplianceExpiryService`** (`@Cron(EVERY_DAY_AT_1AM)`, mirrors the existing `ApprovalEngineService.processExpiredRequests()` cron pattern): notifies owner/employee/employee's-manager exactly once per threshold crossing (90/60/30/15/7/1/0 days, matched on exact day-count so it never double-fires), then transitions `status` to `renewal_pending` (within `grace_period_days` of expiry) or `expired` (grace exceeded).
- **Renewal workflow**: expiring/expired document → "Request Renewal" (new version + re-submit through the same approval workflow, §5) → manager approval → new version becomes current, prior version stays in history → tracker/dashboard counts update from live data (no separate sync step).
- **Policy publish**: `CompliancePolicyService.publish()` creates one pending acknowledgement row per active employee in scope (branch-filtered if the policy is branch-specific) and notifies them; `acknowledge()` is idempotent per `(document, employee, version)`.

## 10. API Surface

All routes are tenant-scoped, guarded by `JwtAuthGuard, ActiveOrgGuard, PermissionGuard`, under `/compliance`:

- `categories` — list/create/update/delete.
- `documents` — list/get/create/update/delete/archive, `upload-file` (multipart), `:id/versions` (list/upload/restore), `:id/download`, `:id/submit|approve|reject|renewal`.
- `filings`, `tracker-items` — statutory filings (legacy) + generic tracker items, including document linking.
- `policies/:documentId/publish|acknowledgements`, `policies/:documentId/acknowledge`, `policies/my/pending`.
- `document-requests` — list/create/`:id/fulfil`/`:id/approve`/`:id/request-resubmission`.
- `dashboard/cards|expiry-timeline|audit-activity`.
- `reports/document-inventory|expired-documents|upcoming-renewals|employee-missing-documents|company-licenses|policy-acknowledgements|audit`.

## 11. UI Map

Promoted from an HR sub-page to its own top-level **Compliance** sidebar group (`frontend/src/components/layout/sidebar.tsx`), 11 routes under `/dashboard/compliance/*`: Dashboard, Company Documents, Employee Documents (vault + requests tabs, self-service for the `employee` rank), Compliance Tracker (filings + tracker items tabs), Licenses & Certifications, Government Registrations, Policy Management (+ "My Pending Acknowledgements" / "Publish & Track" panels), Expiring Documents (90/60/30/15/7/1/expired buckets), Renewals, Document Templates, and Compliance Reports (7 report types, CSV/Excel export via the existing `report-export` lib). The old `/dashboard/hr/compliance` URL now redirects to `/dashboard/compliance/tracker`.

Shared components (`frontend/src/components/compliance/`): `document-explorer.tsx` (search/filter/list-grid toggle, reused across 5 pages), `document-drawer.tsx` (drag-and-drop create), `document-detail-drawer.tsx` (PDF/image inline preview, version history + restore, submit/approve/reject, renewal), `badges.tsx` (status/confidentiality/expiry). Styling matches the existing Tailwind + Radix + lucide conventions already used by the Compliance/Exit Management pages — no new UI library introduced.

## 12. Testing Coverage

Jest unit/integration specs (mocked `db.query`, same convention as `exit-checklist.service.spec.ts`/`final-settlement.service.spec.ts` — this repo has no Playwright/Cypress harness, so "end-to-end" here means full service-layer flow tests, not browser tests):

- `compliance-document.service.spec.ts` — create + initial version, append-only versioning, restore-version-creates-new-version, confidentiality/self-scoping SQL generation (privileged bypass vs. restricted employee), secure download + audit logging.
- `compliance-approval.service.spec.ts` — submit/approve/reject delegation to `ApprovalEngineService`, `approval_status → status` sync, renewal-reuses-same-workflow.
- `compliance-expiry.service.spec.ts` — threshold-crossing notification (with recipient de-duplication and priority escalation inside 7 days), expired/renewal_pending transitions.
- `compliance-policy.service.spec.ts` — publish creates per-employee pending rows + notifies, acknowledge upserts at the current version, self-service "my pending" guard.
- `compliance-document-request.service.spec.ts` — create/fulfil/approve/request-resubmission, including the "not addressed to you" rejection.

All 206 backend tests pass (`npm test`); `npm run build` (backend) and `next build` (frontend, all 11 new routes statically generated) are both clean.

## 13. Production Readiness Checklist

- [x] Migration applied additively (no destructive changes); legacy `compliance_filings`/`compliance_documents` data backfilled and still functional.
- [x] RBAC enforced server-side at both the route gate and the row-visibility layer (confidentiality + self/manager scoping).
- [x] Audit logging on every state-changing action.
- [x] Approval workflow reuses the existing, already-hardened engine (SLA, escalation, branch chains) rather than a bespoke implementation.
- [x] Backend + frontend builds clean; unit/integration tests passing.
- [ ] **MinIO server-side encryption (SSE)** on the `ai-hrms-documents` bucket — infra/ops configuration, not application code; recommended before storing confidential documents in production.
- [ ] **Office document (DOC/DOCX/XLSX/CSV/ZIP) in-browser preview** — out of scope; these types show a download link instead of inline rendering. Would need an external conversion service (LibreOffice/Office Online) to add.
- [ ] **Document Templates** is a static reference-file library, not a merge-field/e-signature engine.
- [ ] **Presigned download URL expiry** (currently 5 minutes) and **max upload size** (25MB) are hardcoded — move to env config if requirements diverge per tenant.
- [ ] Seed/backfill default compliance categories for any tenants created *before* this migration is the same `tenant_id IS NULL` system-default rows — no per-tenant seeding job was needed, but verify new-tenant onboarding doesn't assume a different category source.
