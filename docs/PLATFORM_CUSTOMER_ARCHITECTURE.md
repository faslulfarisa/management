# AI-HRMS Platform / Customer HRMS Separation

This document describes the separation between the **AI-HRMS Platform** (internal staff — Sales,
Marketing, Technical, Finance, Customer Success, Customer Support, Platform Super Admin) and the
**Customer HRMS Workspace** (Super Admin, Org Admin, Branch Admin, Admin, Employee), implemented
across five phases on `nuhad-dev` (2026-06-27).

**This was a hardening effort, not a rewrite.** Most of the separation already existed via the
Internal Operations Portal (`/operations`, built 2026-06-24) — a fully separate user population,
RBAC track, and UI for internal staff, isolated from the customer-side hierarchy. The five phases
below closed the remaining gaps: separate login entry points, the conflated super-admin identity,
branding, and two module-ownership leaks (staff provisioning, billing plan mutations).

**Naming note:** the codebase keeps "Operations" as the internal route/code name (`(operations)`
route group, `OpsPermissionGuard`, `ops-permissions.constants.ts`, etc.) — it *is* the Platform
Portal conceptually, but was not mechanically renamed (decided in Phase 1, to avoid pure-churn risk
on a large, already-working route tree).

---

## 1. Overall Architecture

Two independent identity populations share one Next.js/NestJS deployment and one Postgres
database, distinguished by a single boolean at the database layer:

```
                    users.is_internal_staff
                    /                      \
              false                          true
                |                              |
        Customer User                   Platform User
   (user_tenants.user_type            (users.internal_role)
    + users.is_super_admin)
```

- **Customer User** — belongs to one or more `tenants` (organizations) via `user_tenants`. Scope
  and rank come from `user_type` (`super_admin > org_admin > branch_admin > admin > employee`).
  Lives in `(admin)`, `(employee)`, `(manager)` route groups.
- **Platform User** — never belongs to a tenant (`tenant_id` is a placeholder, forced to `null` in
  the JWT). Role comes from `internal_role` (12 team roles + `platform_super_admin`). Lives
  entirely in the `(operations)` route group, rendered as `/operations/*`.

The two populations **never share a guard, a permission registry, a sidebar, or a layout**.
Backend authorization for one population literally cannot evaluate the other's rules — there is
no shared `can()` function; `AuthorizationService` (customer) and `OpsPermissionGuard` (platform)
are independent code paths.

---

## 2. Authentication Design

### Two login entry points, one backend

- **Customer login** — `frontend/src/app/(auth)/login/page.tsx`. Posts `{ email, password, portal:
  'customer' }` to `POST /auth/login`.
- **Platform login** — `frontend/src/app/(auth)/platform-login/page.tsx`. Distinct branding/copy,
  no customer signup CTAs. Posts `{ ..., portal: 'platform' }`.

Both hit the same `AuthController.login()` / `AuthService.login()`. The `portal` field is an
**optional** hint (omitting it preserves old behavior for any caller that predates this work) — when
present, `AuthService.login()` rejects with `403` at the very top of the method, before the
existing MFA / forced-password-change branches, if it doesn't match the account's
`is_internal_staff` flag:

```ts
if (portal === 'platform' && !user.is_internal_staff) throw new ForbiddenException(...);
if (portal === 'customer' && user.is_internal_staff) throw new ForbiddenException(...);
```

This means a platform account can never authenticate through the customer login page and vice
versa — enforced server-side, not just by which page the user happened to land on.

### Session / routing-hint cookie

On successful login, `frontend/src/lib/auth/complete-login.ts` sets a **non-sensitive** cookie:
`portal=platform` or `portal=customer` (30-day, `samesite=lax`, no `httpOnly`/`Secure` — it carries
no secret, only a routing hint). Cleared on logout (`auth.store.ts`).

The actual session/auth token (JWT) continues to live in the Zustand store + `localStorage`,
exactly as before this work — `middleware.ts` (below) cannot read that, which is why the routing
hint cookie exists as a separate, deliberately low-stakes signal.

### JWT payload (`backend/src/modules/auth/strategies/jwt.strategy.ts`, unchanged shape)

```ts
{
  sub: string;                 // user id
  tenantId: string | null;     // forced null for internal staff
  email: string;
  employeeId: string | null;
  isSuperAdmin: boolean;       // customer hierarchy only
  userType: string;            // 'super_admin' | user_tenants.user_type | 'employee'
  isInternalStaff: boolean;
  internalRole: string | null; // one of INTERNAL_ROLES, or null
}
```

### MFA / forced password change

Both are session-based continuations (`mfa_login_sessions`, `password_change_sessions`) created by
the *first* `login()` call, which already evaluated the `portal` check. `verifyMfaLogin()` and
`verifyPasswordChange()` need no `portal` parameter — by the time either runs, the identity has
already been confirmed to match the portal that was used.

---

## 3. Platform Portal

- **Route root:** `/operations` (route group `frontend/src/app/(operations)/`).
- **Layout/guard:** `(operations)/operations/layout.tsx` — client-side check: `isInternalStaff`
  required (NOT `isSuperAdmin` — see §5).
- **Navigation:** `frontend/src/components/operations/operations-sidebar.tsx` — four permission-gated
  sections (Organizations, Administration, Technical Operations, Reports), each item individually
  gated by an `OPS_PERMISSIONS` value via `canOps(internalRole, permission)`. Sections render
  themselves empty (`return null`) if the current role has zero visible items in them — no
  team-specific sidebar code was needed when Finance/Customer Success/Customer Support were added
  in Phase 2; the existing permission-driven filter just started matching their new grants.
- **Owns exclusively:** organization lifecycle (create/suspend/archive/restore — see
  `organization-ops.controller.ts`), self-registration approval review, platform staff
  provisioning (`/operations/staff`, Phase 4), subscription plan *definitions*
  (`/operations/billing`, Phase 4), signup incentive campaigns (`/operations/offers`,
  Phase 6 — relocated from the customer admin dashboard, where it had been sitting as a
  super-admin-only page despite being a Marketing/Sales growth lever, not a customer concern),
  organization analytics/activity reports.
- **Still a stub (not built in this initiative):** `/operations/subscriptions` (per-org plan
  assignment/renewal) — a pre-existing "coming soon" placeholder, untouched.
- **Removed in Phase 6 (user request):** the entire "Technical Operations" sidebar section and its
  3 pages (`/operations/integrations`, `/operations/biometric-devices`, `/operations/tickets`) —
  these were "coming soon" stubs with no real backend behind them. `OPS_PERMISSIONS.
  ORGANIZATIONS_TECHNICAL_MANAGE` (the permission that gated all 3) was deliberately **left in
  place** — it isn't asked to be removed, no backend route ever enforced it (grep-confirmed: it
  only ever gated these 3 now-deleted nav items), and removing it would be an unrequested RBAC
  change. Practical effect: Technical and Customer Support roles currently have no sidebar section
  of their own — both still see Dashboard/Organizations/Reports (via their shared
  `ORGANIZATIONS_VIEW` grant), just nothing tied to their one distinguishing permission until a real
  integrations/devices/ticketing module is built.

---

## 4. Customer HRMS

- **Route root:** `/dashboard` (admin/org-management) + `/home` (employee) + `/manager` (manager
  views) — route groups `(admin)`, `(employee)`, `(manager)`.
- **Layout/guard:** `(admin)/layout.tsx` — `isSuperAdmin || activeOrg?.isOrgAdmin` (or
  branch/admin-tier) required; routes regular employees/managers to their own portals.
- **Navigation:** `frontend/src/components/layout/sidebar.tsx` — gated per item by
  `isAtLeast(userType, minRank)` (hierarchy) and a per-tenant `accessConfig` (template-driven
  module visibility). Has its own pre-existing nav group literally labeled **"Platform"**
  (Branches/Departments/Positions/User Management/Audit Logs — meaning "system configuration").
  This is a naming coincidence with the new "AI-HRMS Platform" identity, not a leak — confirmed in
  Phase 3's audit. No code in this sidebar evaluates `isInternalStaff` or any `ops.*` permission.
- **Owns:** all day-to-day HR operations — Employees, Attendance, Leave, Payroll, Recruitment,
  Performance, Compliance, Assets, Exit Management, Reports, Finance, Roles & Users, Organization
  Settings. None of this was touched by the separation work; it's the pre-existing, unaffected
  HRMS surface.
- **Subscription visibility:** read-only-ish (`(admin)/dashboard/system/settings/saas-billing/page.tsx`)
  — view plans, view own subscription, pay invoices, subscribe/cancel own subscription
  (legitimate self-service, since it's scoped to the caller's own tenant). **Cannot** create, edit,
  or deactivate the platform-wide plan catalog (Phase 4 — see §6/§9).

---

## 5. RBAC Matrix

### Customer hierarchy (`backend/src/shared/user-hierarchy.constants.ts`)

| Rank | User Type | Scope | Stored |
|---|---|---|---|
| 0 | `super_admin` | All organizations (global) | `users.is_super_admin` |
| 1 | `org_admin` | One organization | `user_tenants.user_type` |
| 2 | `branch_admin` | ≥2 branches | `user_tenants.user_type` + `branch_user_access` |
| 3 | `admin` | Exactly 1 branch | `user_tenants.user_type` + `branch_user_access` |
| 4 | `employee` | Self only | `user_tenants.user_type` (default) |

(`tenant_admin` was removed from this hierarchy in a prior initiative, migration `093` — not part
of this work, noted here only so it isn't assumed to still exist.)

### Platform roles (`backend/src/shared/internal-roles.constants.ts`)

| Team | Roles | Notes |
|---|---|---|
| Marketing | `marketing_executive`, `marketing_manager` | Read-only on orgs + signup offer campaigns |
| Sales | `sales_executive`, `sales_manager` | Full org CRUD + lifecycle |
| Technical | `technical_executive`, `technical_manager` | View + technical management |
| Finance | `finance_executive`, `finance_manager` | Read-only orgs + billing plan management |
| Customer Success | `customer_success_executive`, `customer_success_manager` | View + lifecycle management |
| Customer Support | `customer_support_executive`, `customer_support_manager` | View + technical management |
| — | `platform_super_admin` | Standalone — every permission, not part of any team/tier |

`platform_super_admin` is **not** selectable via the "Add Internal Staff" team/tier picker
(`frontend/src/components/users/internal-staff-tab.tsx`) — it can currently only be assigned via
direct database access, the same way `is_super_admin` has no UI toggle either. There is exactly
one such account today: `platformadmin@demo.com` (seeded in Phase 2, with the user's explicit
sign-off — see §9).

### The core fix (Phase 2)

Before this work, `users.is_super_admin` was evaluated by **both** populations: it was the top of
the customer hierarchy *and* the bypass inside `InternalStaffGuard`/`OpsPermissionGuard` that let
a customer super admin into `/operations`. This violated the spec's "never share permissions
across these identities" requirement. Fixed by:

- `InternalStaffGuard`: `user.isInternalStaff || user.isSuperAdmin` → `user.isInternalStaff` only.
- `OpsPermissionGuard`: `if (user.isSuperAdmin) return true` → `if (user.internalRole ===
  'platform_super_admin') return true`.

`users.is_super_admin` itself was **never modified** — it remains exactly what it was for the
customer hierarchy. The two identities simply stopped overlapping.

---

## 6. Permission Matrix (Platform — `OPS_PERMISSIONS`)

| Permission | Marketing | Sales | Technical | Finance | Cust. Success | Cust. Support | Platform Super Admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `DASHBOARD_VIEW` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ORGANIZATIONS_VIEW` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ORGANIZATIONS_CREATE` | | ✓ | | | | | ✓ |
| `ORGANIZATIONS_EDIT` | | ✓ | | | | | ✓ |
| `ORGANIZATIONS_DELETE` | | ✓ | | | | | ✓ |
| `ORGANIZATIONS_MANAGE_LIFECYCLE` | | ✓ | | | ✓ | | ✓ |
| `ORGANIZATIONS_TECHNICAL_MANAGE` | | | ✓ | | | ✓ | ✓ |
| `STAFF_MANAGE` | | | | | | | ✓ (only) |
| `BILLING_MANAGE_PLANS` | | | | ✓ | | | ✓ |
| `MARKETING_MANAGE_OFFERS` | ✓ | | | | | | ✓ |

Enforced by `OpsPermissionGuard` (backend, authoritative) reading `DEFAULT_OPS_PERMISSIONS_BY_ROLE`
(`backend/src/shared/ops-permissions.constants.ts`), and mirrored client-side by `canOps()`
(`frontend/src/lib/internal-roles.ts`, defense-in-depth/UX only).

Customer-side permissions (`PERMISSIONS` / `DEFAULT_PERMISSIONS_BY_USER_TYPE` in
`backend/src/shared/permissions.constants.ts`) are a separate, pre-existing registry — admin-tier
roles get `'*'`, `employee` gets an explicit minimal list. Untouched by this initiative; see
`docs/USER_HIERARCHY_AND_ROLES.md` and `docs/ROLE_ACCESS_MATRIX.md` for that system.

---

## 7. Routing

```
                          GET request
                               |
                               v
                  ┌─────────────────────────┐
                  │   middleware.ts          │   reads `portal` cookie only
                  │   (matches /operations,  │   (no JWT access — edge runtime)
                  │   /dashboard, /home,     │
                  │   /manager)              │
                  └────────────┬─────────────┘
                               |
              portal=customer  |  portal=platform   |  no cookie / match
              hitting /operations → redirect          → pass through to the
              hitting customer routes → redirect         page; client-side
              with platform cookie                       layout guard decides
                               |
                               v
                  ┌─────────────────────────┐
                  │  Route group layout.tsx  │   reads Zustand auth store
                  │  (admin) / (operations)  │   (post-hydration)
                  └────────────┬─────────────┘
                               |
                     authorized? → render page : redirect to /login,
                                                  /dashboard, or /home
```

Route groups: `(auth)` [`/login`, `/platform-login`, `/register`, `/forgot-password`,
`/mfa-verify`, `/change-password` — all shared infrastructure, portal-agnostic], `(admin)`
[`/dashboard/*`], `(operations)` [`/operations/*`], `(employee)` [`/home/*`], `(manager)`
[`/manager/*`].

`middleware.ts` is **additive defense-in-depth**, not the authorization boundary — it only acts on
an actual cookie/path *mismatch*; a missing cookie (not logged in yet, or a session that predates
this change) falls through untouched to the pre-existing client-side layout guards, so no session
in flight at deploy time breaks.

---

## 8. Database Changes

| Migration | Change |
|---|---|
| `099_internal_operations_portal.sql` (pre-existing, 2026-06-24) | `users.is_internal_staff BOOLEAN`, `users.internal_role VARCHAR(32)` (6 values: marketing/sales/technical × executive/manager), `tenants.lifecycle_stage` |
| `115_platform_super_admin_and_extended_internal_roles.sql` (Phase 2, 2026-06-27) | Dropped/re-added `users_internal_role_check` to add `finance_executive/manager`, `customer_success_executive/manager`, `customer_support_executive/manager`, `platform_super_admin` (13 values total) |

No other schema changes were needed — `users.tenant_id` remains `NOT NULL` with a placeholder for
internal staff (pre-existing workaround, shared with `is_super_admin`'s same placeholder pattern;
`jwt.strategy.ts` forces `tenantId: null` in the JWT for `is_internal_staff` regardless of the
placeholder column value).

---

## 9. Migration Strategy

Implemented as five additive phases, each independently shippable and verified before the next
began (per explicit user instruction — no big-bang rewrite):

1. **Auth & routing** — `portal` field (optional, back-compat preserved), `/platform-login` page,
   `middleware.ts`. Zero RBAC changes.
2. **RBAC separation** — migration `115`, guard changes, new `platform_super_admin` role. Required
   a one-time human decision (see below) on how to bootstrap the first platform-super-admin
   identity, since none existed yet.
3. **Navigation & branding** — copy-only changes (no routes/permissions touched).
4. **Module migration** — relocated staff provisioning to `/operations`; found and fixed an
   unrelated pre-existing authorization gap in `/billing/plans` (was reachable by any authenticated
   user) while closing the module-ownership boundary.
5. **Cleanup & documentation** — this document, final regression pass.
6. **Follow-up module migration** (same day) — relocated Signup Offers (`/dashboard/platform/offers`
   → `/operations/offers`) on user request; in the course of verifying it, discovered and fixed a
   live, demonstrated cross-population leak — see §10.

**Bootstrap decision (Phase 2):** creating the first `platform_super_admin` account — a new,
standing, full-bypass identity — was explicitly *not* taken as a unilateral action. The agent's
first attempt to seed one was blocked by the environment's auto-mode safety classifier; the user
was asked directly and chose to create one persistent demo account
(`platformadmin@demo.com`) rather than a disposable one or none at all. Any future environment
repeating this migration needs the same human decision — there is no automated seed for this role.

**Backward compatibility:** the `portal` login field is optional and unenforced when absent — any
pre-existing integration or test script calling `POST /auth/login` without it continues to work
exactly as before. No existing customer or internal-staff account's data was altered by migration
`115` (it only widens a CHECK constraint).

---

## 10. Security Model

Three layers, in order of actual trust:

1. **Backend guards (authoritative).** `InternalStaffGuard`, `OpsPermissionGuard`,
   `SuperAdminGuard`, `ActiveOrgGuard`, `PermissionGuard` — every API route is protected here. This
   is the only layer that matters for actual data security; everything else is UX.
2. **Frontend layout guards (UX only).** Client-side `useEffect` redirects in each route group's
   `layout.tsx`, post-hydration. Prevents a logged-in user from *seeing* the wrong portal's shell;
   cannot prevent API access on its own (the backend guard does that).
3. **`middleware.ts` (UX only, pre-hydration).** Reads a non-sensitive cookie to redirect before
   the wrong page even starts rendering, closing the "flash of wrong content" gap layer 2 has on
   its own. Carries no secret and is not consulted by any backend guard.

**A real gap found and fixed during this work (Phase 4):** `billing.controller.ts`'s
`POST/PUT/DELETE /billing/plans` had no guard beyond "is logged in" — any authenticated user of any
role, including a plain employee, could create or delete platform-wide subscription plans. This
predates the Platform/Customer separation; it was found by reading the controller while scoping
Phase 4, not introduced by it. Fixed by adding `InternalStaffGuard + OpsPermissionGuard +
@RequireOpsPermission(BILLING_MANAGE_PLANS)` at the method level on just those three routes — reads
and the customer's own subscribe/cancel/pay-invoice actions remain open to any authenticated
tenant user, since those are legitimate self-service scoped to the caller's own tenant.

**Known boundary, not a gap:** internal staff *provisioning itself* (`POST /operations/staff`) is
gated to `platform_super_admin` only (`STAFF_MANAGE`), so a brand-new platform deployment has a
bootstrap problem identical to any root-account system — solved here by the explicit human-decision
seed described in §9, not by any automated path.

**A real gap found, demonstrated live, and fixed during this work (Phase 6):** every internal-staff
account's `users.tenant_id` is set to a placeholder value at creation time — specifically *the
oldest tenant row in the database* (see `internal-staff.service.ts`'s `create()`). This is harmless
on its own (the JWT layer forces `tenantId: null` for `is_internal_staff` regardless of this
column — see §2/§8). But `UserService.findAll()` (powering the customer admin dashboard's User
Management page, `/dashboard/platform/users`) filtered tenant users by `WHERE u.tenant_id = $1`
alone, with no `is_internal_staff` exclusion. Because the placeholder happens to equal a real,
in-use tenant's id, **every internal-staff account — including the `platform_super_admin` demo
account — appeared as an ordinary employee in that tenant's People list**, fully editable and
deactivatable by that tenant's own admins.

This was not theoretical: while verifying the Signup Offers relocation, the `platformadmin@demo.com`
account was found deactivated (`status: 'on_leave'`) and reassigned `user_type: 'employee'` in a
real tenant — both actions performed by a customer super admin (`testadmin@gmail.com`) through the
ordinary User Management UI, who almost certainly had no idea they were operating on a platform
account. Confirmed via `audit_logs` (`user_deactivated`, `deactivation_reason_selected`,
`user_type_assigned` rows, actor = the customer super admin, target = the platform account).

**Fix:** added `AND u.is_internal_staff = false` to both the row query and the count query in
`UserService.findAll()` — internal staff can no longer appear in any tenant's user list, regardless
of their placeholder `tenant_id`. The affected account was restored (`is_active = true`, `status =
'active'`, the bogus `user_tenants` row removed) and the fix verified live: re-ran the same listing
query as the same customer super admin and confirmed zero internal-staff rows returned.

**Not yet fixed — same root cause, narrower blast radius:** `UserService.findOne()`, `.update()`,
`.deactivate()`, and `.reactivate()` all share the identical `tenant_id`-only filter and were *not*
patched in this pass (scope was deliberately kept to the listing query that caused the demonstrated
incident, pending explicit confirmation before touching more mutation paths). Practical risk is
now low — an admin would need to already know an internal-staff account's UUID, since it no longer
appears in any list — but this is the next thing to fix if hardening this further.

---

## 11. Testing Strategy

No browser-based validation tool was available in this environment for any phase of this work (a
recurring, pre-existing constraint in this codebase — see e.g. `project_internal_operations_portal`
prior-session notes). Verification was therefore curl-driven against the live dev backend
(`localhost:3001`) plus `tsc --noEmit` on both `backend`/`frontend` as a compile-correctness gate,
the same methodology used throughout this codebase's history for similar initiatives. Per phase:

| Phase | Verified |
|---|---|
| 1 | Login without `portal` (back-compat), customer+correct portal, customer+wrong portal (403), staff+correct portal, staff+wrong portal (403); middleware redirects in both directions; no-cookie passthrough. |
| 2 | Customer super admin blocked from `/operations/organizations` (was previously allowed — the core regression check); `platform_super_admin` allowed; per-role grant correctness (marketing read-only allowed/blocked on the right routes); the deliberately-untouched staff-provisioning `SuperAdminGuard` carve-out still works both directions. |
| 3 | `tsc` clean; dev-server hot-recompile with no errors; new copy strings confirmed present in source (could not visually confirm in-browser — `/operations` only ever serves a pre-hydration loading shell to an unauthenticated `curl`). |
| 4 | Customer super admin 403 on `GET /operations/staff` and `POST /billing/plans` (both previously allowed — the two regressions being fixed); `platform_super_admin` 200/201 on both; customer super admin still 200 on `GET /billing/plans` (read path correctly untouched); deactivate→`includeInactive=true` round trip on a test plan. |
| 5 | See the consolidated pass below. |
| 6 | Signup Offers: customer super admin 403 / Marketing+Platform Super Admin 200 on `/signup-offers`; public wizard endpoint unaffected. The leak fix: re-ran the exact tenant user-listing query as the customer super admin who had triggered the incident, confirmed zero internal-staff rows in the result (was 1 before the fix); confirmed the restored `platform_super_admin` account could log in and reach `/operations` again. |

All disposable test accounts created for verification (e.g. `phase1verify_platform@opstest.local`,
`phase4verify_customer@opstest.local`) were soft-deleted (`deleted_at`) immediately after use —
hard delete is blocked by the `audit_logs` foreign key once an account has any audit history.

**Recommended for a real CI pipeline (not built here, no test framework wiring requested):** an
e2e suite covering the login-portal matrix, the RBAC matrix in §5/§6 as parametrized guard tests,
and a regression assertion that `GET /billing/plans` (and any future platform-wide-resource route)
never regresses to guard-less.

---

## 12. Deployment Checklist

- [ ] Run migration `115_platform_super_admin_and_extended_internal_roles.sql` (`node
      scripts/migrate.js`) before deploying the backend build that references the new
      `internal_role` values — the CHECK constraint must already allow them.
- [ ] Decide and provision the production `platform_super_admin` account(s) — there is no
      automated seed (see §9). Do this *before* relying on the new `STAFF_MANAGE`/full-bypass
      behavior in production.
- [ ] Confirm `FRONTEND_URL`/CORS config in `backend/src/main.ts` still matches whatever
      domain(s) `/login` and `/platform-login` are served from (both currently share one Next.js
      deployment — see §13 for the not-yet-done subdomain split).
- [ ] Frontend build: a fresh `next build` picks up `middleware.ts` and the new route folders
      automatically; no special build flag needed. (Dev-mode note, not relevant to production
      builds: this repo's `next dev` server needs a full restart + `.next` clear after any
      route-tree change — already accounted for during this work, not a deployment concern.)
- [ ] No data backfill required — migration `115` only widens a CHECK constraint; no existing rows
      are modified.

## 13. Production Readiness Checklist

**Done and production-ready:**
- Separate login portals with server-side identity enforcement (not just client-side routing).
- RBAC fully separated — no remaining code path lets a customer identity reach platform guards or
  vice versa.
- A real pre-existing authorization vulnerability (open `/billing/plans` mutation) closed.
- Staff provisioning correctly scoped to the platform's own super-admin role.
- Signup Offers relocated to the Platform Portal, owned by Marketing.
- A real, demonstrated cross-population leak (internal staff visible/editable in customer tenant
  user lists, due to the placeholder `tenant_id` colliding with a real tenant) found and closed —
  see §10.

**Explicitly not done — by scope decision, not oversight:**
- **No real subdomain/DNS separation** (`platform.aihrms.com` / `app.aihrms.com`) — both portals
  are served from one Next.js deployment today. Decided in Phase 1: this is an infrastructure/
  deployment concern, not a code change, and was out of scope.
- **No request-based "Upgrade Plan / Contact Sales" workflow** — customers still self-service
  subscribe/cancel directly against their own tenant (not a security issue, just not literally
  "creates a request" per the spec's exact wording). Building this would need a new persisted
  request entity + ops review UI, comparable in size to the existing organization-change-request
  system — deferred as a candidate, not started.
- **`/operations/subscriptions`** (per-org plan assignment/renewal) remains a `ComingSoonPanel`
  stub — pre-existing, intentional, unrelated to this initiative's scope. Integrations/Biometric
  Devices/Support Tickets were removed entirely in Phase 6 rather than left as stubs (user request)
  — if/when those modules are actually built, they'll need new pages and likely new dedicated ops
  permissions, since `ORGANIZATIONS_TECHNICAL_MANAGE` (left in place but now ungated by anything)
  is the natural permission to reuse.
- **No automated test suite** for the RBAC/routing matrix — verification was manual/curl-driven
  (see §11). Recommended as fast-follow before treating this as fully CI-gated.
- **The customer-side "Platform" nav group naming collision** (§4) was identified but intentionally
  left alone — renaming it wasn't requested and isn't an access-control issue, only a vocabulary
  coincidence worth knowing about if it comes up ambiguously in a future conversation.
- **`UserService.findOne()`/`.update()`/`.deactivate()`/`.reactivate()` still share the same
  `tenant_id`-only filter** that caused the §10 incident — only `.findAll()` (the listing query)
  was patched. An admin who already has an internal-staff account's UUID (e.g. from before the
  fix, from a stale browser tab, or from any other surface that still leaks it) could still act on
  it directly. Recommended next hardening step before this is considered fully closed.

**Before going live with real (non-demo) platform staff accounts:** review the permission
allocations in §6 — Finance/Customer Success/Customer Support were mapped onto the *closest
existing* permission rather than dedicated ones (no finance/CS/support-specific `OPS_PERMISSIONS`
exist yet), which was a reasonable default for standing up the identity model but may not match
the eventual real-world responsibility split exactly.
