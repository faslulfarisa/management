# Leave Module — Approval Workflow Analysis & BadRequest Error Catalogue

> **Files analysed:**
> - [`leave.service.ts`](file:///c:/Users/amann/Spinach/HMS/backend/src/modules/hr/services/leave.service.ts)
> - [`leave.controller.ts`](file:///c:/Users/amann/Spinach/HMS/backend/src/modules/hr/controllers/leave.controller.ts)
> - [`approval-engine.service.ts`](file:///c:/Users/amann/Spinach/HMS/backend/src/modules/approvals/services/approval-engine.service.ts)
> - [`branch-approval-chain.service.ts`](file:///c:/Users/amann/Spinach/HMS/backend/src/modules/platform/services/branch-approval-chain.service.ts)
> - [`leave-apply-sheet.tsx`](file:///c:/Users/amann/Spinach/HMS/frontend/src/components/employee/leave/leave-apply-sheet.tsx)
> - [`leave/page.tsx`](file:///c:/Users/amann/Spinach/HMS/frontend/src/app/%28admin%29/dashboard/hr/leave/page.tsx)
> - [`approval-reason-modal.tsx`](file:///c:/Users/amann/Spinach/HMS/frontend/src/components/approvals/approval-reason-modal.tsx)

---

## 1. Full Flow — Happy Path

```
Employee submits leave request
        │
        ▼
POST /leaves/requests
        │
        ▼
LeaveController.createRequest()
  → reads employeeId from JWT (user.employeeId / user.employee_id)
  → calls LeaveService.createRequest(tenantId, employeeId, data)
        │
        ▼
LeaveService.createRequest()
  1. payrollLock.assertPeriodUnlocked()          ← payroll period guard
  2. Validate leave type gender eligibility       ← BadRequest if gender mismatch
  3. calculateDays(start_date, end_date)          ← (end - start) + 1
  4. Check leave_balances for this year           ← BadRequest if insufficient
  5. INSERT leave_requests                        ← creates the row
  6. resolveSubmitterUserId(tenantId, employeeId) ← BadRequest if no user linked
  7. approvalEngine.submit(...)                   ← routes to approval engine
        │
        ▼
ApprovalEngineService.submit()
  1. resolveChain(tenantId, branchId, 'leave')   ← looks up branch_approval_chains
  2. INSERT approval_requests                     ← status='pending', current_step=1
  3. getApproverUserIds(...)                      ← finds who to notify at step 1
       ├─ no branch? → org admins
       ├─ no chain? → org admins
       └─ chain exists → role/specific-user for step 1
  4. notificationService.notifyNewRequest()       ← DB notification + WebSocket push
        │
        ▼
Approver sees request in inbox (GET /approvals/inbox)

        │
        ▼
Admin approves via POST /leaves/requests/:id/approve  { reason: string }
        │
        ▼
LeaveService.approveRequest()
  → calls approvalEngine.approveByEntity(id, 'leave_requests', ...)
        │
        ▼
ApprovalEngineService._doApprove()
  1. requireReason(reason)                        ← BadRequest if < 5 chars
  2. getActorRole(tenantId, approverId, branchId)
  3. validateEligibility()                        ← Forbidden if no chain + not org admin
  4. resolveChain() + computeAdvance()
       ├─ not last step → advance step, notify next approver
       └─ last step → mark approved, sync entity table
  5. syncEntityStatus() → UPDATE leave_requests SET status='approved'
  6. notifyResolved() → notify submitter
        │
        ▼
LeaveService.approveRequest() (after engine returns fullyApproved=true)
  → UPDATE leave_balances SET used = used + days, available = available - days
```

---

## 2. Complete `BadRequestException` Catalogue

### 2.1 During Leave Request Submission (`POST /leaves/requests`)

| # | Location | Condition | Error Message |
|---|----------|-----------|---------------|
| 1 | `LeaveService.createRequest` L170 | Payroll period is locked for the date range | `"Payroll for [date] is locked and cannot be modified"` (from PayrollLockService) |
| 2 | `LeaveService.createRequest` L186 | Employee's gender doesn't match leave type eligibility | `"This leave type is only available for [male/female] employees"` |
| 3 | `LeaveService.createRequest` L202 | Balance row exists but `available < days` requested | `"Insufficient leave balance"` |
| 4 | `LeaveService.createRequest` L210 | No balance row exists **and** leave type is paid | `"No leave balance has been allocated for this leave type. Contact HR to set up your balance before applying."` |
| 5 | `LeaveService.resolveSubmitterUserId` L257 | Employee record has no linked `users` row (`users.employee_id` is null or missing) | `"No user account is linked to this employee; cannot submit for approval"` |

### 2.2 During Approval / Rejection (`POST /leaves/requests/:id/approve` or `/reject`)

| # | Location | Condition | Error Message |
|---|----------|-----------|---------------|
| 6 | `ApprovalEngineService.requireReason` L736 | `reason` is empty or shorter than 5 characters | `"Approval reason must be at least 5 characters"` |
| 7 | `ApprovalEngineService._doApprove` L287 | Request status is not `pending`, `under_review`, or `escalated` (e.g. already approved/rejected) | `"Cannot approve a request with status '[status]'"` |
| 8 | `ApprovalEngineService._doReject` L397 | Same status check as above for rejection | `"Cannot reject a request with status '[status]'"` |
| 9 | `ApprovalEngineService.validateEligibility` L797 | No chain configured AND actor is NOT an org admin | `"No approval chain is configured for this branch. Only an organization admin can act on this request."` *(403 Forbidden, not 400)* |
| 10 | `ApprovalEngineService.validateEligibility` L812 | Chain exists, step has named `approver_id`, but a different user is attempting to act | `"This step is assigned to a specific approver."` *(403 Forbidden)* |
| 11 | `ApprovalEngineService.validateEligibility` L817 | Chain exists, step requires a role, but actor's role doesn't match | `"This step requires role '[role]'. Your role in this branch is '[role/none]'."` *(403 Forbidden)* |
| 12 | `ApprovalEngineService._doApprove` L335 | Payroll period already locked when trying to **fully** approve a leave request | `"Payroll for [dates] is locked."` (from PayrollLockService) |

### 2.3 Leave Encashment (`POST /leaves/encashment`)

| # | Condition | Error Message |
|---|-----------|---------------|
| 13 | Leave policy has `encashment_enabled = false` | `"Leave encashment is not allowed under your current leave policy"` |
| 14 | Policy timing = `on_exit` | `"Leave encashment is only allowed during exit settlement for your policy"` |
| 15 | Policy timing = `year_end` and current month ≠ December | `"Leave encashment is only allowed in December (year-end) under your policy"` |
| 16 | Encashment quota exceeded (`alreadyEncashed + days > maxDaysPerYear`) | `"Encashment limit exceeded. Remaining quota: [N] day(s) (policy max: [M]/year)"` |
| 17 | Leave balance `available < days` | `"Insufficient leave balance. Available: [N] day(s), requested: [M]"` |
| 18 | After encashment, balance would fall below `min_retain_days` | `"You must retain at least [N] day(s) in your balance. Available: [A], requested: [R]"` |

### 2.4 Leave Type Management

| # | Condition | Error Message |
|---|-----------|---------------|
| 19 | `PUT /leaves/types/:id` called with an empty body | `"No fields to update"` |

---

## 3. Root Causes of the Most Common "Bad Request" Errors in Practice

### ❌ Error 4 — Most Frequent: "No leave balance has been allocated"

**Root cause:** An HR admin created the leave type but never went to **HR → Leaves → Balances** to allocate days to employees for the current year. The `leave_balances` table has no row for `(employee_id, leave_type_id, year=2026)`.

**Fix:** Go to the Leave Balances tab and allocate days for the relevant employees and leave type.

---

### ❌ Error 5 — "No user account is linked to this employee"

**Root cause:** The `employees` table row was created manually in the DB (or via a migration/seed) but the `users` table was never updated with `users.employee_id = employees.id`. The service does:
```sql
SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 LIMIT 1
```
This returns no rows, so submission to the approval engine fails — **even though the leave request row is already inserted**.

> [!WARNING]
> This creates an orphaned `leave_requests` row in `status='pending'` with no corresponding `approval_requests` row. The employee would see their request as pending forever with no approver notified.

**Fix:** Ensure every employee account is created through the proper HR → Employee flow which creates both the `employees` row and the linked `users` row together.

---

### ❌ Error 6 — "Approval reason must be at least 5 characters"

**Root cause:** The admin page (`leave/page.tsx`) calls `approvalEngine.approve()` via `POST /leaves/requests/:id/approve { reason }`. The `ApprovalEngineService.requireReason()` enforces a minimum of 5 characters. The `ApprovalReasonModal` component also enforces `MIN_CHARS = 5` client-side, so this error should only appear if the API is called directly.

However, the admin leave page `handleConfirm()` passes `reason` **without trimming** before the API call:
```ts
// leave/page.tsx line 142
await api.post(`/leaves/requests/${id}/${action}`, { reason });
// reason here is already reason.trim() from ApprovalReasonModal line 72
```
This is actually safe — the modal trims before calling `onConfirm`.

---

### ❌ Error 9 — "No approval chain is configured…" (403 Forbidden)

**Root cause:** No `branch_approval_chains` row exists for `(branch_id, workflow_type='leave')`. A regular user (branch manager, HR, etc.) tries to approve. Only org admins can act without a chain configured.

**Fix:** Set up an approval chain under **Platform → Approval Chains** for the leave workflow and the relevant branch. See [`APPROVAL_WORKFLOW_MISSING_CHAIN.md`](file:///c:/Users/amann/Spinach/HMS/docs/APPROVAL_WORKFLOW_MISSING_CHAIN.md) for full details.

---

## 4. Encashment Approval Bug: Wrong `entityTable` Submitted

> [!CAUTION]
> **Bug found in `LeaveService.createEncashmentRequest()` at line 512:**

```ts
await this.approvalEngine.submit({
  tenantId,
  workflowType: 'leave',          // ← uses 'leave' workflow type
  entityId: request.id,
  entityTable: 'leave_encashment_requests',  // ← but entity table is different
  ...
});
```

The `workflowType` is `'leave'` but the `entityTable` is `'leave_encashment_requests'`. This means:

1. The approval chain resolved is the **leave chain**, not a separate encashment chain — this is acceptable if intentional.
2. However, `ENTITY_SYNC_CONFIG['leave_encashment_requests']` in the engine has **no `stepCol` or `logCol`**, so `syncEntityStep()` is a no-op for encashment requests during multi-step approval.
3. The `approveEncashmentRequest()` in `LeaveService` checks `req.status !== 'pending'` **before** calling the engine — but after the engine runs, the engine calls `syncEntityStatus()` which updates `leave_encashment_requests.status` to `'approved'`. This is correct.

The functional impact: encashment approval works end-to-end for single-step chains, but intermediate step status is not synced back to `leave_encashment_requests` during multi-step approvals.

---

## 5. Leave Balance Deduction Timing Issue

> [!WARNING]
> **Potential double-deduction on multi-step approval chains:**

In `LeaveService.approveRequest()`:
```ts
const result = await this.approvalEngine.approveByEntity(...);

if (result.fullyApproved) {
  await this.db.query(
    `UPDATE leave_balances SET used = used + $1, available = available - $1 ...`,
    [req.days, ...]
  );
}
```

The balance is only deducted when `fullyApproved = true` — this is correct. **However**, the balance check at submission time (step 1) does NOT reserve/lock the days, so two employees could both have their leave approved for the same limited pool days.

This is a known limitation — there is no balance reservation (optimistic locking) in the current design.

---

## 6. Admin Leave Page Bug: Error Swallowed on Approve/Reject

In [`leave/page.tsx`](file:///c:/Users/amann/Spinach/HMS/frontend/src/app/%28admin%29/dashboard/hr/leave/page.tsx) at line 140–143:

```ts
const handleConfirm = async (reason: string) => {
  const { action, id } = reasonModal;
  await api.post(`/leaves/requests/${id}/${action}`, { reason });
  fetchData();  // ← called even if the POST threw
};
```

The `handleConfirm` function has **no try/catch**. If the backend throws a `BadRequestException` or `ForbiddenException`, the `ApprovalReasonModal` catches it at line 77 and sets `error` state — so the error IS shown to the user in the modal. This part is fine.

However, if `fetchData()` is reached after the error (it won't be, since `await` throws), that's not an issue. The real problem is that after a **successful** approve/reject, the modal doesn't close automatically — the `onConfirm` resolves, the modal's `handleConfirm` calls `onClose()` at line 75, which sets `reasonModal.open = false`. This is actually correct.

---

## 7. Summary Table

| Scenario | HTTP Status | Throws At | Message |
|----------|-------------|-----------|---------|
| Payroll period locked (submission) | 400 | `PayrollLockService` | Period locked |
| Gender mismatch for leave type | 400 | `LeaveService` | Only for [gender] |
| Insufficient balance | 400 | `LeaveService` | Insufficient leave balance |
| No balance allocated (paid type) | 400 | `LeaveService` | No balance allocated |
| Employee has no user account | 400 | `LeaveService` | No user account linked |
| Reason too short (< 5 chars) | 400 | `ApprovalEngineService` | Reason must be ≥ 5 chars |
| Already approved/rejected | 400 | `ApprovalEngineService` | Cannot approve status X |
| Payroll period locked (approval) | 400 | `PayrollLockService` | Period locked |
| No chain + non-admin approver | 403 | `ApprovalEngineService` | Only org admin can act |
| Wrong named approver for step | 403 | `ApprovalEngineService` | Assigned to specific approver |
| Wrong role for step | 403 | `ApprovalEngineService` | Step requires role X |
