# Production Performance Optimization Phase 2 Report

Date: 2026-06-30

Scope: Phase 2 performance work only. This pass deliberately did not repeat Phase 1 changes such as compression setup, React Query defaults, or the earlier broad count/data query parallelization.

## 1. Bottlenecks Discovered

| Impact | Area | Bottleneck |
|---|---|---|
| High | Dashboard loading | Admin and branch dashboards blocked the whole page behind a full-page spinner until overview, HR metrics, and finance metrics all returned. |
| High | Dashboard network | Admin and branch dashboards made 3 separate API requests on first load: `/dashboard/overview`, `/dashboard/hr-metrics`, and `/dashboard/finance-metrics`. |
| Medium | Dashboard authorization overhead | Each of those 3 dashboard endpoints resolved branch access independently, repeating the same scope lookup. |
| Medium | Search/network | Command palette search was debounced, but previous in-flight searches were not cancelled; slow old responses could overwrite newer results. |
| Medium | Notifications/network | Header notification polling could overlap with socket-triggered refreshes or a slow prior poll. |
| Medium | SQL | Dashboard hot paths use combined tenant/date/status/branch filters, while existing indexes were mostly single-column or only partially aligned. |
| Remaining | Live profiling | Production p95 API latency, SQL execution plans, browser render counts, and Web Vitals require production-like traffic and database access. |

## 2. Optimizations Performed

- Added `GET /dashboard/summary`, returning the same dashboard data needed by the existing dashboard screens in one response.
- Reused a single resolved access scope inside `DashboardService.getSummary()` so the summary bundle does not repeat branch-scope lookup three times.
- Updated admin and branch dashboards to call `/dashboard/summary` instead of firing 3 separate requests.
- Removed blocking full-page dashboard loaders for non-super-admin admin dashboard and branch dashboard.
- Added lightweight skeleton rows and in-place placeholder values so the dashboard shell and layout render immediately.
- Added `AbortController` cancellation to command palette searches.
- Added `AbortController` cancellation to notification polling/refreshing.
- Added a focused concurrent index migration for dashboard hot filters.

## 3. APIs Optimized

| API | Change |
|---|---|
| `GET /dashboard/summary` | New aggregation endpoint for dashboard first paint. |
| `GET /dashboard/overview` | Preserved for backward compatibility. Internally can now accept a pre-resolved scope. |
| `GET /dashboard/hr-metrics` | Preserved for backward compatibility. Internally can now accept a pre-resolved scope. |
| `GET /dashboard/finance-metrics` | Preserved for backward compatibility. Internally can now accept a pre-resolved scope. |
| `GET /dashboard/search` | Frontend now cancels superseded requests. Backend contract unchanged. |
| `GET /dashboard/notifications` | Frontend now cancels superseded polling/socket refreshes. Backend contract unchanged. |

## 4. SQL Queries Optimized

- Dashboard summary now resolves branch scope once before running overview, HR, and finance queries.
- Added composite indexes for dashboard predicates:
  - `attendance_records(tenant_id, date, branch_id)`
  - `attendance_records(tenant_id, date, branch_id) WHERE late_minutes > 0`
  - `leave_requests(tenant_id, status, employee_id)`
  - `expenses(tenant_id, status, branch_id)`
  - `gst_invoices(tenant_id, invoice_date)`

## 5. Components Optimized

- `frontend/src/app/(admin)/dashboard/page.tsx`
  - Uses summary endpoint.
  - Renders shell immediately.
  - Uses skeleton rows for lower dashboard panels.
  - Keeps existing visual design and workflows.
- `frontend/src/app/(admin)/branch-admin/page.tsx`
  - Uses summary endpoint.
  - Renders shell immediately.
  - Uses skeleton rows for detail panels.
- `frontend/src/components/layout/command-palette.tsx`
  - Cancels stale searches and prevents stale response updates.
- `frontend/src/components/layout/notification-dropdown.tsx`
  - Cancels overlapping notification refreshes and aborts on unmount.

## 6. New Indexes Added

Migration: `backend/migrations/126_dashboard_phase2_indexes.sql`

All indexes use `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for safer production deployment.

## 7. Payload Reductions

- Dashboard first-load network envelopes reduced from 3 HTTP responses to 1 HTTP response.
- The response payload still preserves the same nested `overview`, `hr_metrics`, and `finance_metrics` data. No business-facing fields were removed in this phase.

## 8. Render Optimizations

- Removed full-page dashboard blocking for normal admin and branch-admin dashboard pages.
- Critical shell/header/quick actions render before dashboard metrics finish.
- Secondary dashboard panels hydrate independently through skeleton states instead of preventing the whole page from appearing.

## 9. Memory Optimizations

- Command palette aborts stale search requests and avoids stale state writes.
- Notification dropdown aborts stale refreshes and aborts on unmount.
- This reduces retained request callbacks and overlapping network work during fast typing, tab changes, and socket refresh bursts.

## 10. Dashboard Optimizations

Before:

- Page waited for all dashboard calls before rendering.
- Admin/branch dashboards made 3 round trips.
- Branch scope was resolved once per endpoint.

After:

- Page shell renders immediately.
- Admin/branch dashboards make 1 summary round trip.
- Summary endpoint resolves scope once and runs the existing dashboard sections in parallel.

## 11. API Latency Before/After

Measured locally as structural change, not live p95:

| Dashboard first load | Before | After |
|---|---:|---:|
| HTTP round trips | 3 | 1 |
| Scope resolution path | 3 endpoint-level resolutions | 1 summary-level resolution |
| Data contracts | 3 separate response envelopes | 1 bundled response envelope |

Actual p50/p95 latency needs production traffic or a load test against a production-like database.

## 12. SQL Latency Before/After

No live `EXPLAIN ANALYZE` was run in this environment. Expected improvement is from:

- fewer repeated access-scope lookups during summary load
- composite indexes aligned to dashboard filter predicates

The new indexes must be applied to the target database before SQL latency improves.

## 13. Bundle Size Before/After

Route sizes from `next build` after Phase 2:

| Route | First Load JS |
|---|---:|
| `/dashboard` | 170 kB |
| `/branch-admin` | 120 kB |
| Shared first-load JS | 88 kB |

Bundle size was not the primary target of this phase. The dashboard route size changed only slightly because the work was about data loading and rendering behavior, not removing modules.

## 14. Largest Performance Improvements

1. Dashboard first-load network round trips reduced from 3 to 1.
2. Dashboard shell no longer blocks behind all metrics.
3. Repeated dashboard branch-scope resolution reduced inside the summary path.
4. Stale command palette searches are cancelled.
5. Notification polling no longer piles up overlapping refreshes.
6. New dashboard-focused composite indexes align with hot tenant/date/status/branch filters.

## 15. Remaining Bottlenecks

- Super-admin platform dashboard still has several organization-specific tabs with independent client-side fetches.
- Deeper table virtualization was not implemented in this phase.
- DTO field-level payload trimming across every endpoint still needs a frontend field usage audit.
- Production SQL plans need to be captured after applying the new migration.
- File thumbnail generation and full image/document optimization remain for a dedicated assets phase.
- Backgrounding large exports/imports remains for a queue-focused phase.

## 16. Recommendations For Phase 3

1. Run `EXPLAIN ANALYZE` on dashboard summary queries after migration `126` is applied.
2. Add Playwright/Lighthouse profiling for dashboard first paint and navigation timing.
3. Convert the super-admin organization dashboard tabs to lazy query modules with cached master data.
4. Add table virtualization to the largest admin lists that still render many rows.
5. Add a DTO payload audit for employees, users, reports, and recruitment list endpoints.
6. Move large export/report generation to background jobs with downloadable artifacts.

## 17. Validation

- `npm run build --workspace=backend`: passed.
- `npm run build --workspace=frontend`: passed.
- `npm run test --workspace=frontend -- --run`: 6 test files passed, 49 tests passed.
- `npm test --workspace=backend -- --runInBand`: 30 test suites passed, 236 tests passed.
