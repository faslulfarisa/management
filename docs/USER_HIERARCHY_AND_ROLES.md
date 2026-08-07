# User Types, Roles & Hierarchy — How It Works

This document explains the access-control model introduced for Ai-HRMS: a **hierarchy/scope
layer** (`user_type`) layered on top of the existing **Roles & Positions**
permission-customization system. The two are intentionally kept separate.

**The `tenant_admin` tier has been removed** (see
[`093_remove_tenant_admin_promote_org_admin.sql`](../backend/migrations/093_remove_tenant_admin_promote_org_admin.sql)).
`org_admin` is now the highest business-level role directly beneath `super_admin`, scoped to
exactly one organization — there is no multi-org admin tier anymore.

---

## 1. Two Independent Axes of Access

| Axis | Answers | Examples | Where stored |
|---|---|---|---|
| **User Type** (hierarchy/scope) | *"What can this user see/manage, and where?"* | `super_admin`, `org_admin`, `branch_admin`, `admin`, `employee` | `users.is_super_admin`, `user_tenants.user_type` |
| **Role / Position** (permission customization) | *"What specific actions/permissions does this person have within their scope?"* | HR Manager, Finance Manager, Front Desk | `roles`, `positions`, `user_roles` |

A user always has exactly one **User Type** per organization (defines hierarchy + data
scope) and, separately, can be assigned **Roles/Positions** for fine-grained permission
customization within that scope.

---

## 2. The User Types & Hierarchy Rank

Lower rank = more privileged. Defined in
[`backend/src/shared/user-hierarchy.constants.ts`](../backend/src/shared/user-hierarchy.constants.ts)
and mirrored in [`frontend/src/lib/hierarchy.ts`](../frontend/src/lib/hierarchy.ts).

| Rank | User Type | Scope | Notes |
|---|---|---|---|
| 0 | **super_admin** | All organizations (global) | Never stored in `user_tenants`; lives on `users.is_super_admin`. Not org-scoped. Exclusively controls organization lifecycle (create/delete/suspend/activate) and Organization Admin assignment. |
| 1 | **org_admin** | One organization | The highest organizational authority. Full org-wide visibility (HR, Finance, Branches, etc.) within exactly one assigned organization — never another. The org's designated admin is also pointed to directly by `tenants.organization_admin_user_id`. |
| 2 | **branch_admin** | Two or more specific branches | Sees/manages data only for their assigned branches. |
| 3 | **admin** | Exactly one branch | Same as branch_admin but constrained to a single branch. |
| 4 | **employee** | Self only | Mobile/employee portal (`/home`), no admin dashboard access. |

Both `branch_admin` and `admin` are backed by the same `branch_user_access` table
(`role = 'branch_admin'`, `is_active = true`) — `admin` simply requires exactly 1 row,
`branch_admin` requires ≥ 1 (in practice ≥ 2, since exactly 1 → `admin`).

---

## 3. Database Layer

Migrations:
[`backend/migrations/079_user_hierarchy_types.sql`](../backend/migrations/079_user_hierarchy_types.sql),
[`backend/migrations/093_remove_tenant_admin_promote_org_admin.sql`](../backend/migrations/093_remove_tenant_admin_promote_org_admin.sql).

- `user_tenants.user_type VARCHAR(20)` (CHECK constraint: `org_admin | branch_admin | admin | employee`), default `employee`.
- `tenants.organization_admin_user_id` / `tenants.assigned_by_super_admin` — direct pointer to the org's single designated admin and who assigned them (added in 093, nullable).
- Indexed on `(tenant_id, user_type)`.

`super_admin` is **not** a row value — it's derived from `users.is_super_admin`.

---

## 4. Backend Enforcement

### 4.1 Auth flow attaches `userType` to every request

- [`jwt.strategy.ts`](../backend/src/modules/auth/strategies/jwt.strategy.ts) — on every
  authenticated request, joins `users` ⨝ `user_tenants` (scoped to the JWT's
  `tenant_id`) and resolves `req.user.userType` = `'super_admin'` if
  `is_super_admin`, else `user_tenants.user_type` (default `employee`).
- [`auth.service.ts`](../backend/src/modules/auth/auth.service.ts) — `login()` returns
  each tenant membership with its `userType`; `selectTenant()` (org switch) re-resolves
  `userType` for the newly selected org and re-signs the JWT.

### 4.2 Guards & decorators

- **`@RequireUserType(...types)`** decorator
  ([`user-type.decorator.ts`](../backend/src/modules/auth/decorators/user-type.decorator.ts))
  + **`HierarchyGuard`**
  ([`hierarchy.guard.ts`](../backend/src/modules/auth/guards/hierarchy.guard.ts)) —
  restricts an endpoint to an explicit allow-list of user types (checked against
  `req.user.userType`/`isSuperAdmin`).
- **`OrgAdminGuard`** ([`org-admin.guard.ts`](../backend/src/modules/auth/guards/org-admin.guard.ts)) —
  accepts `is_org_admin = true` or `user_type = 'org_admin'`, scoped to the specific
  organization id in the request.
- **`SuperAdminGuard`** — guards organization lifecycle endpoints exclusively:
  `POST /organizations` (create), `DELETE /organizations/:id`,
  `POST /organizations/:id/suspend`, `POST /organizations/:id/activate`.

### 4.3 `UserHierarchyService` — the core logic

[`user-hierarchy.service.ts`](../backend/src/modules/platform/services/user-hierarchy.service.ts)

- **`getManageableTypes(actorUserType)`** — returns all user types **strictly lower
  rank** than the actor. E.g. a `branch_admin` (rank 2) can assign `admin`, `employee`,
  but not `branch_admin`/`org_admin`/`super_admin`. Only `super_admin` can ever be
  offered `org_admin` to assign. Drives the "User Type" dropdown in the create/edit-user UI.
- **`getUserAccess(userId, tenantId)`** — returns `{ userType, branchIds, positionId }`
  for a target user (used by the "Edit Access" drawer).
- **`setUserAccess(actor, targetUserId, tenantId, input)`** — the single write path for
  changing a user's hierarchy/scope:
  - Rejects assigning `super_admin` via this endpoint.
  - Rejects assigning a type **≥** the actor's own rank (unless actor is `super_admin`).
  - Upserts `user_tenants.user_type` (+ `is_org_admin` for `org_admin`).
  - `org_admin` (only ever reachable by a `super_admin` actor) → designates
    `targetUserId` as the org's single Organization Admin: sets
    `tenants.organization_admin_user_id` / `assigned_by_super_admin`, demoting whoever
    previously held that pointer back to `employee`.
  - Moving a user *away* from `org_admin` clears `tenants.organization_admin_user_id`
    if it pointed at them.
  - `branch_admin` / `admin` → syncs `branch_user_access` rows (`syncBranchAdminScope`),
    enforcing **exactly 1 branch for `admin`**, **≥1 for `branch_admin`**, revoking
    grants for branches no longer in scope.
  - Moving a user *away* from a branch-scoped type revokes any leftover
    `branch_user_access` grants.
  - Optionally (re)assigns a Position via `PositionService`.
  - Writes an **audit log** entry: `entity_type='user_access'`,
    `action='user_type_assigned'`.
- **`getAccessibleBranchIds(actor, tenantId)`** — returns `null` (unrestricted — for
  `super_admin`/`org_admin`) or `string[]` of branch IDs (for
  `branch_admin`/`admin`). This is the primitive used everywhere for branch-scoped
  filtering.
- **`assertUserInScope(actor, targetUserId, tenantId)`** — throws `ForbiddenException`
  if a branch-scoped actor tries to read/edit a user whose employee record's
  `branch_id` is outside their accessible branches. No-op for `org_admin`+.

### 4.4 Branch-scoped data filtering pattern

Every list/aggregate endpoint that should respect branch scope follows the same
pattern: controller computes `accessibleBranchIds = await
hierarchyService.getAccessibleBranchIds(req.user, tenantId)`, then the service appends:

```sql
AND ($N::uuid[] IS NULL OR branch_id = ANY($N))
```

Applied to:
- `user.service.ts` → `findAll()` (Roles & Users list)
- `employee.service.ts` → `findAll()`
- `attendance.service.ts` → `findAll()`
- `payroll.service.ts` → `getPayslips()`
- `branch.service.ts` → `findAll()`
- `branch-analytics.service.ts` → overview, attendance summary, payroll summary,
  device health, CSV export

`null` = unrestricted (super_admin / org_admin); array = restricted to
those branch IDs (branch_admin / admin).

### 4.5 API surface (`user.controller.ts`)

| Endpoint | Purpose |
|---|---|
| `GET /users` | List users, branch-filtered for branch_admin/admin, includes `user_type` + `scope` summary |
| `GET /users/hierarchy/manageable-types` | Returns `{ types, branches }` the caller is allowed to assign |
| `GET /users/:id/access` | Returns a target user's current `{ userType, branchIds, positionId }` (scope-checked) |
| `PATCH /users/:id/access` | Sets a target user's hierarchy type + scope + position (scope-checked, rank-checked) |
| `GET/PUT/DELETE /users/:id` | Standard CRUD, all scope-checked via `assertUserInScope` |

### 4.6 Organization API surface (`tenant.controller.ts`)

| Endpoint | Guard | Purpose |
|---|---|---|
| `GET /organizations` | any authenticated | Super admin sees all orgs; everyone else sees only orgs they belong to |
| `GET /organizations/:id` | membership or super admin | Returns `403` if the caller isn't a member of that org and isn't a super admin |
| `POST /organizations` | `SuperAdminGuard` | Create a new organization; optional `organizationAdminUserId` assigns its first admin via `setUserAccess` |
| `PUT /organizations/:id` | `OrgAdminGuard` | Update profile fields; `status`/`organization_admin_user_id`/`assigned_by_super_admin` are stripped unless caller is super admin |
| `DELETE /organizations/:id` | `SuperAdminGuard` | Soft-delete |
| `POST /organizations/:id/suspend` | `SuperAdminGuard` | Sets `status = 'suspended'` |
| `POST /organizations/:id/activate` | `SuperAdminGuard` | Sets `status = 'active'` |
| `GET/POST/DELETE /organizations/:id/members` | `OrgAdminGuard` | Plain membership management — Organization Admin assignment is exclusively via `PATCH /users/:id/access` |

---

## 5. Frontend

### 5.1 Shared hierarchy helpers — [`frontend/src/lib/hierarchy.ts`](../frontend/src/lib/hierarchy.ts)

- `HIERARCHY_RANK`, `rankOf(userType)`, `isAtLeast(userType, minType)` — rank comparison
  used everywhere to gate UI.
- `USER_TYPE_LABELS` / `USER_TYPE_COLORS` — display labels & badge colors.

### 5.2 Auth store — [`frontend/src/store/auth.store.ts`](../frontend/src/store/auth.store.ts)

- `TenantInfo.userType` — per-organization user type returned by `/auth/login` and
  `/auth/select-tenant`.
- Top-level `userType` is **derived**: `isSuperAdmin ? 'super_admin' :
  activeOrganization.userType`. Recomputed on hydrate, tenant select, and
  super-admin flag change.

### 5.3 Login routing — [`(auth)/login/page.tsx`](../frontend/src/app/(auth)/login/page.tsx)

After resolving the active organization's `userType`:
- `isAtLeast(userType, 'admin')` → routed to `/dashboard` (desktop admin app).
- Otherwise (`employee`) → routed to `/home` (mobile employee portal), with the
  employee profile pre-fetched.

### 5.4 Sidebar — [`components/layout/sidebar.tsx`](../frontend/src/components/layout/sidebar.tsx)

Navigation items are filtered by `isAtLeast(userType, ...)` per item/group:

- **Organizations** (plural, browse-all) → `super_admin` only
- **Organization** (single org settings) → `org_admin` only
- **Roles & Users**, **Branches**, **Approval Chains** → `admin`+ (branch-scoped view
  for `branch_admin`/`admin`, full view for `org_admin`+)
- **Positions**, **Audit Logs**, **Templates**, **Company Profile**, **Finance**,
  **System** → `org_admin`+ only
- **HR**, **Schedules**, **Reports**, **Biometrics** → `admin`+ (branch-scoped data,
  hidden entirely for `employee`)

A second layer of filtering then applies the dynamic `sidebar_access` template config
(`/templates/my-sidebar`) for further per-org customization (e.g. hiding Payroll,
Expenses, Invoices for specific roles).

### 5.5 Badges — [`components/users/user-type-badge.tsx`](../frontend/src/components/users/user-type-badge.tsx)

- `<UserTypeBadge userType>` — colored pill with the user type label.
- `<ScopeCell userType scope>` — renders the scope summary next to a user in the Roles
  & Users table:
  - `super_admin` → "All organizations"
  - `org_admin` → "All branches"
  - `branch_admin` / `admin` → branch name pill(s)

### 5.6 Create/Edit User — [`components/users/create-user-drawer.tsx`](../frontend/src/components/users/create-user-drawer.tsx)

The drawer has three modes:

1. **Create New User** — basic info + role/department/branch + an
   **"Hierarchy & Scope"** section (`AccessScopeFields`).
2. **Invite Existing User** — search the unified directory (`/users/directory`,
   covers both platform users and unlinked HR employee records), verify identity (for
   existing platform users) or auto-create an account (for HR employee records), then
   assign role + Hierarchy & Scope.
3. **Edit Access** (opened from the Roles & Users table) — loads the target user's
   current access via `GET /users/:id/access` and lets the actor change User Type,
   Branches, and Position via `PATCH /users/:id/access`.

`AccessScopeFields` only renders the User Type options the actor is allowed to assign
(`manageableTypes`, from `/users/hierarchy/manageable-types`), and conditionally shows:

- `org_admin` → a searchable **Organization** picker (required), listing every
  organization from `GET /organizations` (a super admin — the only actor who can ever
  pick `org_admin` — sees all of them). Defaults to the actor's currently active
  organization but can target any other one.
- `branch_admin` → multi-select **Branches** (required, ≥1)
- `admin` → single-select **Branch** (required, exactly 1)
- `employee` → no extra scope fields

Picking a different organization for `org_admin` is honored end-to-end via an optional
`organizationId` override, accepted only when the caller is a super admin (otherwise
silently ignored and the caller's own `tenantId` is used) on: `POST /users`,
`PATCH /users/:id/access`, `GET /users/:id/access`, `GET /branches`, `GET /positions`,
`POST /positions/:id/users`, and `GET /users`. In **Create New User** mode, choosing a
different organization re-fetches Branch/Position/Reports-To options from that
organization and the new user (and their employee record) is created directly inside
it instead of the admin's active org. In **Invite Existing User** mode, an existing
platform user is instead added as a member of the chosen organization
(`POST /organizations/:id/members`) before the `org_admin` scope is applied there. In
**Edit Access** mode, `PATCH /users/:id/access` with the chosen `organizationId` reuses
`UserHierarchyService.setUserAccess`'s existing `user_tenants` upsert, so the target
user does not need to already belong to that organization.

### 5.7 Audit Logs — [`(admin)/dashboard/platform/audit-logs/page.tsx`](../frontend/src/app/(admin)/dashboard/platform/audit-logs/page.tsx)

A dedicated `entity_type = 'user_access'` category with `user_type_assigned` /
`scope_updated` action types, filterable in the Audit Logs UI, with a
`UserAccessDetails` renderer showing before/after user type, branch scope, and
position changes.

---

## 6. End-to-End Workflows

### 6.1 Assigning/changing a user's hierarchy & scope

1. Org admin (or higher) opens **Roles & Users** → clicks **Edit Access** on a target
   user.
2. Frontend calls `GET /users/hierarchy/manageable-types` (types the actor can assign)
   and `GET /users/:id/access` (target's current access). `assertUserInScope` ensures
   the actor can even see this user (branch-scoped actors can't touch users outside
   their branches).
3. Actor picks a **User Type** from the (rank-filtered) list and fills in the
   conditional scope field (branches / nothing).
4. `PATCH /users/:id/access` → `UserHierarchyService.setUserAccess`:
   - Validates rank (`target rank > actor rank`, unless super_admin).
   - Updates `user_tenants.user_type` (+ `is_org_admin`).
   - `org_admin` → syncs the org's `organization_admin_user_id`/`assigned_by_super_admin`
     pointer (only reachable by a super admin actor); `branch_admin`/`admin` → syncs
     `branch_user_access` accordingly, revoking stale grants.
   - Optionally updates Position assignment.
   - Writes an audit log row (`user_type_assigned`).
5. UI refreshes the Roles & Users table — `UserTypeBadge` + `ScopeCell` reflect the new
   type/scope immediately.

### 6.2 Login → routing

1. `POST /auth/login` returns `tenants[]` each with their own `userType`, plus
   `isSuperAdmin` and `selectedTenantId` (auto-selected if the user belongs to exactly
   one org).
2. Frontend selects the active tenant (`POST /auth/select-tenant` if needed), storing
   the resulting `userType` in `auth.store`.
3. `isAtLeast(userType, 'admin')` ?
   - **Yes** (`admin`/`branch_admin`/`org_admin`/`super_admin`) →
     `/dashboard` (full admin app, sidebar/data scoped per §5.4 / §4.4).
   - **No** (`employee`) → `/home` (mobile employee self-service portal).

### 6.3 Day-to-day data access (e.g. viewing Employees/Attendance/Payroll)

1. Request hits a controller (e.g. `EmployeeController.findAll`).
2. Controller calls `hierarchyService.getAccessibleBranchIds(req.user, tenantId)`.
   - `super_admin` / `org_admin` → `null` (see everything in the org).
   - `branch_admin` / `admin` → `string[]` of their assigned branch IDs (from
     `branch_user_access`).
3. Service query appends `AND ($N::uuid[] IS NULL OR branch_id = ANY($N))` — so the
   same query naturally returns org-wide or branch-scoped results depending on caller.

---

## 7. Quick Reference — "Who can do what?"

| Capability | super_admin | org_admin | branch_admin | admin | employee |
|---|:---:|:---:|:---:|:---:|:---:|
| Create / delete / suspend organizations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign / reassign Organization Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| See all organizations | ✅ | — (only their one assigned org) | — | — | — |
| Manage org settings / Positions / Templates / Finance / System | ✅ | ✅ (their one org) | ❌ | ❌ | ❌ |
| See all branches in an org | ✅ | ✅ | ❌ (only assigned branches) | ❌ (only their 1 branch) | ❌ |
| HR/Attendance/Payroll/Branch dashboards | ✅ | ✅ | ✅ (branch-scoped) | ✅ (single branch) | ❌ |
| Roles & Users (view/edit) | ✅ | ✅ | ✅ (branch-scoped) | ✅ (branch-scoped) | ❌ |
| Assign user types to others | any type | types ranked below org_admin | types ranked below branch_admin | types ranked below admin | — |
| Admin dashboard vs Employee portal | Dashboard | Dashboard | Dashboard | Dashboard | `/home` portal only |
