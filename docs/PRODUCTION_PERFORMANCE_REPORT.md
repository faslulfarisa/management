# Production Performance Optimization Report

Date: 2026-06-24
Branch: `nuhad-dev`

This audit covered the Next.js 14 frontend and NestJS backend. All fixes below are
implemented in the working tree (not just recommended) and verified by either a
successful production build or a clean `nest build` compile. Database migrations and
Redis caching are **code-complete but not yet applied/exercised against the live
database** — see [Not Run Against Production](#not-run-against-production-needs-your-go-ahead)
for why, and what to run when you're ready.

---

## 1. Bottlenecks Found

| # | Bottleneck | Impact |
|---|---|---|
| 1 | `npm run build` failed outright — dead import of a non-existent `@/components/ui/table` module | **0 successful production builds.** The app could only have been running via `next dev` or a stale `dist`. |
| 2 | 2 pages call `useSearchParams()` without a `<Suspense>` boundary | Build failure under Next 14's static-export rules (`/register/pending`, `/register/verify-email`) |
| 3 | `country-state-city` (world country/state/city dataset) imported eagerly on the employee form | **2.52 MB** First Load JS on `/dashboard/hr/employees/new` and `/dashboard/hr/employees/[id]/edit` — the single largest bundle bottleneck in the app |
| 4 | `xlsx`, `jspdf`, `jspdf-autotable` imported statically in shared export helpers | +230–340 KB First Load JS on every report page, payroll, and audit-logs page, even though export is a rare, user-triggered action |
| 5 | `recharts` imported statically in `TrendChart`/`BranchComparisonChart`/`PayrollAnalytics` | Extra ~110 KB pulled into every page using the shared `reports` barrel, including pages that don't render a chart on first paint |
| 6 | `DashboardService.getNotifications()` ran up to 7 (admin) / 4 (employee) independent queries **sequentially**, each in its own try/catch | Endpoint latency ≈ sum of all query times instead of the slowest one |
| 7 | `DashboardService.globalSearch()` ran all 8 entity-type queries **sequentially** | Same issue — used by the header command palette on every keystroke (debounced, but still serial under the hood) |
| 8 | `AuthorizationService` re-queries `role_permissions` and `position_permissions` from Postgres on **every permission check**, with no caching | Two JOIN-heavy queries per request on most authenticated endpoints |
| 9 | Postgres pool hardcoded to `max: 5`, no env override, no slow-query visibility | Under any real concurrency this pool will starve; nothing surfaces a slow query until the whole request is slow |
| 10 | Missing compound indexes on the permission/role join paths (`user_roles`, `role_permissions`, `position_permissions`, `user_positions`) | Each permission check pays a partial table scan instead of an index lookup |
| 11 | No request-duration or DB-query-duration metrics, no frontend Web Vitals collection | No way to see p95/p99 latency or slow queries without grepping logs by hand |

---

## 2. Files Modified

**Frontend**
- `frontend/src/app/(admin)/dashboard/platform/users/page.tsx` — removed dead import (build blocker)
- `frontend/src/app/(auth)/register/pending/page.tsx`, `register/verify-email/page.tsx` — Suspense boundary
- `frontend/src/app/layout.tsx` — mounted `WebVitalsReporter`
- `frontend/src/components/employee/AddressFields.tsx` — `country-state-city` → dynamic `import()`
- `frontend/src/lib/report-export.ts`, `export-pdf.ts`, `generate-payslip-pdf.ts` — `xlsx`/`jspdf`/`jspdf-autotable` → dynamic `import()`
- `frontend/src/components/reports/BranchComparisonChart.tsx`, `TrendChart.tsx`, `employee/payroll/payroll-analytics.tsx` — split into `next/dynamic(ssr:false)` wrapper + `*Impl` component
- `frontend/src/components/reports/ReportTable.tsx` — added sortable headers (client- or server-side via `onSortChange`)
- **New:** `BranchComparisonChartImpl.tsx`, `TrendChartImpl.tsx`, `employee/payroll/payroll-analytics-impl.tsx`, `components/web-vitals-reporter.tsx`

**Backend**
- `backend/src/modules/dashboard/services/dashboard.service.ts` — parallelized `getNotifications()` and `globalSearch()`
- `backend/src/shared/database.service.ts` — env-configurable pool, slow-query logging, pool metrics
- `backend/src/shared/metrics/biometrics-metrics.service.ts` — added HTTP/DB/Web-Vitals Prometheus metrics
- `backend/src/middleware/logging.interceptor.ts` — records request duration into Prometheus, flags slow requests
- `backend/src/shared/health/health.controller.ts` — new `POST /health/web-vitals` endpoint
- `backend/src/shared/shared.module.ts` — registered `PermissionsCacheService`
- `backend/src/modules/platform/services/role.service.ts`, `position.service.ts`, `user.service.ts` — wired permission caching + invalidation
- `backend/.env.example` — documented new env vars
- **New:** `backend/migrations/098_performance_indexes.sql`, `backend/src/shared/permissions-cache.service.ts`, `backend/src/shared/health/web-vitals.dto.ts`

**Monitoring**
- **New:** `monitoring/grafana/dashboards/hms-performance.json` (auto-provisioned alongside the existing biometrics dashboard)

30 files touched (22 modified, 8 new).

---

## 3. Optimizations Implemented

### Frontend
- Fixed the build blocker and both missing-Suspense pages — `npm run build` now exits 0.
- Converted `xlsx`, `jspdf`, `jspdf-autotable`, `recharts`, and `country-state-city` from static to dynamic imports. Each now loads only when the user actually opens an export/chart/address field, in its own chunk.
- Added click-to-sort headers to the shared `ReportTable` (`@tanstack/react-table`'s `getSortedRowModel`, plus an optional `onSortChange` for server-side sort) — sticky headers and server pagination were already present.
- Added a `WebVitalsReporter` (Next.js `useReportWebVitals`) shipping FCP/LCP/TTFB/INP to the backend via `navigator.sendBeacon`.

### Backend
- `DashboardService.getNotifications()` and `.globalSearch()`: every independent query is now an isolated async fetcher run through `Promise.all`, instead of one query waiting on the last. Error isolation per source is preserved (each fetcher still swallows its own "table may not exist" errors and resolves to `[]`).
- `DatabaseService`: pool `max`/idle/connection timeouts now read from `DATABASE_POOL_MAX` / `DATABASE_POOL_IDLE_TIMEOUT_MS` / `DATABASE_POOL_CONNECTION_TIMEOUT_MS` (default `max=10`, sized for Supabase's Session Pooler). Every query is timed; anything over `DATABASE_SLOW_QUERY_MS` (default 200ms) is logged as a structured `slow_query` warning. Pool `total`/`idle`/`waiting` counts are sampled every 5s into Prometheus gauges.
- `PermissionsCacheService` (new): caches `RoleService.getUserPermissions` and `PositionService.getUserPermissions` output in Redis with a short TTL, invalidated explicitly on every mutation that can change a user's effective permissions (see [§6](#6-cache-keys-added)).
- `LoggingInterceptor`: now records every request into a `hms_http_request_duration_ms` histogram (labelled by method/route/status) and flags anything over `SLOW_REQUEST_MS` (default 1000ms) at `warn` level.
- `POST /health/web-vitals`: validated, unauthenticated endpoint that feeds browser Web Vitals into the same Prometheus registry the biometrics dashboards already use.

---

## 4. Indexes Added

`backend/migrations/098_performance_indexes.sql` — all four use `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, so they don't lock the table on a live database:

| Index | Table | Why |
|---|---|---|
| `idx_user_roles_tenant_user` | `user_roles(tenant_id, user_id)` | `RoleService.getUserPermissions` filters on both columns; only `user_id` was indexed |
| `idx_role_permissions_role_permission` | `role_permissions(role_id, permission_id)` | Covers the join in the same query without a row lookup |
| `idx_position_permissions_position_permission` | `position_permissions(position_id, permission_id)` | Same pattern for `PositionService.getUserPermissions` |
| `idx_user_positions_tenant_user` | `user_positions(tenant_id, user_id)` | Mirrors the `user_roles` fix for position-based permissions |

`employees`, `attendance_records`, `notifications`, `approval_requests`, and the payroll tables already had appropriate indexes (verified against `migrations/001`–`097`) — no changes needed there.

---

## 5. APIs Optimized

| Endpoint | Before | After |
|---|---|---|
| `GET /dashboard/notifications` (admin) | 7 sequential queries | 7 queries in parallel via `Promise.all` |
| `GET /dashboard/notifications` (employee) | 4 sequential queries | 4 queries in parallel |
| `GET /dashboard/search` | 8 sequential queries | 8 queries in parallel |
| Every permission-gated endpoint (`AuthorizationService.hasPermission` / `getEffectivePermissions`) | 2 DB round-trips (role + position permissions) on every call | Served from Redis after the first call per user, TTL 60s |

`getOverview()`, `getHrMetrics()`, and `getFinanceMetrics()` were already using `Promise.all` — no change needed.

---

## 6. Cache Keys Added

All in `PermissionsCacheService` (`backend/src/shared/permissions-cache.service.ts`), TTL via `PERMISSIONS_CACHE_TTL_SECONDS` (default **60s**):

- `permissions:role:{tenantId}:{userId}` — `RoleService.getUserPermissions` result
- `permissions:position:{tenantId}:{userId}` — `PositionService.getUserPermissions` result

**Invalidation wired into every mutation that can change these:**
- `RoleService.setPermissions()` → invalidates every user holding that role
- `PositionService.setPermissions()` → invalidates every user holding that position
- `PositionService.assignUser()` / `unassignUser()` → invalidates that one user
- `UserService.assignRoles()` → invalidates that one user

The TTL is deliberately short (60s, configurable) as a safety net: if a future code path mutates `user_roles`/`role_permissions`/`user_positions`/`position_permissions` without calling an invalidation hook, a revoked permission self-heals within 60 seconds instead of staying wrong indefinitely. Redis is already optional in this codebase (`REDIS_ENABLED=false` falls back to a no-op client per `mock-redis.client.ts`), so with Redis disabled this is simply a no-op pass-through to the existing DB query — no new failure mode.

---

## 7. Build Size Improvements

`npm run build` output, summed across all 119 comparable routes:

| | Total First Load JS (all routes) |
|---|---|
| Before (static imports, build blocker fixed but bundle not optimized) | **25,072 KB** |
| After (all dynamic-import optimizations) | **16,500 KB** |
| **Reduction** | **8,572 KB (−34.2%)** |

Largest single-route wins:

| Route | Before | After | Cause |
|---|---|---|---|
| `/dashboard/hr/employees/new` | 2,580 KB | 242 KB | `country-state-city` → dynamic import |
| `/dashboard/hr/employees/[id]/edit` | 2,580 KB | 234 KB | same |
| `/dashboard/reports/*` (8 report pages) | 503–504 KB | 163–164 KB | `xlsx`/`jspdf` → dynamic import |
| `/payslips` | 428 KB | 183 KB | `jspdf` + `recharts` → dynamic import |
| `/dashboard/platform/audit-logs` | 366 KB | 136 KB | `xlsx`/`jspdf` → dynamic import |
| `/dashboard/hr/payroll` | 297 KB | 160 KB | `xlsx`/`jspdf` → dynamic import |
| `/dashboard/reports/analytics` | 276 KB | 166 KB | `recharts` → dynamic import |
| `/dashboard/reports/hr` | 253 KB | 116 KB | `xlsx`/`jspdf` → dynamic import |

Build time: the build never completed successfully before this work (see below). After the fix it completes reliably in **~3.5 minutes** (`next build`, cold `.next` cache, this machine).

---

## 8. Response Time Improvements

These are **structural** improvements (query count → wall-clock latency), not yet measured against live traffic — see the note in §9. The relationship is mechanical: N sequential queries of average duration *d* take *N×d*; running them concurrently takes ≈`max(d)` (bounded by Postgres pool/CPU contention).

| Endpoint | Sequential queries before | Concurrent after | Expected latency change |
|---|---|---|---|
| `GET /dashboard/notifications` (admin) | 7 | 7 in parallel | ~`Σd → max(d)`, i.e. roughly an N-fold cut for N similarly-sized queries |
| `GET /dashboard/search` | 8 | 8 in parallel | same shape |
| Permission check (`hasPermission`) | 2 queries every call | 0 queries on a cache hit (60s TTL) | cache-hit calls drop straight to a Redis round-trip (~1ms) instead of two Postgres JOIN queries |

---

## 9. Before vs After Metrics

| Metric | Before | After |
|---|---|---|
| `npm run build` | **Fails** (missing module, then missing Suspense) | **Succeeds**, ~3.5 min |
| Total First Load JS (119 routes) | 25,072 KB | 16,500 KB (**−34.2%**) |
| Largest route bundle | 2.52 MB (`employees/new`) | 242 KB |
| Backend `nest build` | n/a (not previously a blocker) | Succeeds, clean |
| `dashboard.service.ts` sequential DB calls (worst case) | 8 | 0 (all parallel) |
| Permission-check DB round-trips per request | 2 (always) | 0 on cache hit, 2 on cache miss (every 60s/user) |
| Postgres pool size | hardcoded 5 | env-configurable, default 10 |
| Slow query/request visibility | none | structured logs + Prometheus histograms |
| Frontend performance telemetry | none | FCP/LCP/TTFB/INP → Grafana |

### Verified against production

`backend/.env` on this machine points `DATABASE_URL` at a live Supabase database
(`aws-1-ap-south-1.pooler.supabase.com`). With explicit go-ahead, both verification steps
were run:

- **`npm run db:migrate`** — applied `098_performance_indexes.sql`. All 4 indexes were
  created via `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (non-locking); migrations 001–097
  were already applied and were correctly skipped.
- **`node dist/main.js`** against the live `DATABASE_URL` — full successful boot: every
  module (including the new `PermissionsCacheService` and metrics wiring) resolved with
  no DI errors, logged `Database connected (pool max=10)` confirming the new env-driven
  pool config took effect, registered `POST /api/v1/health/web-vitals`, and reached
  `Nest application successfully started`. It then exited on `EADDRINUSE :::3001` — a
  different, already-running backend instance on this machine owns that port, which is
  expected and unrelated to this change; the smoke-test process was not left running.

Actual p50/p95 query latency under real traffic still requires watching the new
`hms-performance` Grafana dashboard (or running `EXPLAIN ANALYZE` on the hot queries)
once this branch is deployed — the numbers in §8 remain structural estimates until then.

---

## 10. Remaining Recommendations

Scoped out of this pass — listed so they're not silently dropped:

1. **Column filters on `ReportTable`** — sorting and debouncing are in place; per-column filter UI (dropdown/range filters wired to `getFilteredRowModel`) is a larger, separate feature.
2. **Server Component conversion of the dashboard shell** — `sidebar.tsx`, `header.tsx`, and `(admin)/dashboard/layout.tsx` are `'use client'` because they read auth/permission state via hooks at render time. Converting them safely means first moving that data-fetch to a server-side session read, which is a bigger refactor than this pass; flagging it rather than half-doing it.
3. **Full DTO/payload audit** — `globalSearch`/`getNotifications` were fixed for *query count*; a pass over response payloads (field projection, removing unused joins) across all list endpoints wasn't done.
4. **Apply `098_performance_indexes.sql` and restart the backend** against the real environment, then capture actual p50/p95 latency from the new Grafana dashboard (`monitoring/grafana/dashboards/hms-performance.json`) to replace the estimates in §8.
5. **`country-state-city`** is still a large dependency even lazy-loaded (~2.4 MB transferred once per session, cached after). If address entry is common, consider replacing it with a slimmer country/state list and a city free-text field, or a server-side lookup endpoint.
6. **Transaction-path queries** (`DatabaseService.transaction()`) aren't covered by the new slow-query/metrics instrumentation — only the plain `query()` path is. Low-traffic today; revisit if transactions become a hot path.
