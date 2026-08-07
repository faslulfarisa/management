# Production Performance Optimization Report

Date: 2026-06-30

Scope: follow-up performance pass across the Next.js frontend and NestJS backend, preserving existing business logic, workflows, permissions, and UI design.

## 1. Bottlenecks Discovered

| Impact | Area | Bottleneck |
|---|---|---|
| High | Production build | `frontend` production build failed before optimization could be validated: `User.branches` was used by the platform users page but was missing from the local `User` type. |
| High | Production build | After fixing the first blocker, `CreateUserDrawer` had a TypeScript narrowing error in the branch-location required flag. |
| High | Backend API latency | Several paginated endpoints executed independent `COUNT(*)` and page-data queries serially. |
| High | Network | Backend responses were not compressed at the Nest/Express layer. Large JSON list responses, dashboards, and reports paid unnecessary transfer cost. |
| Medium | Frontend navigation | React Query had no default `staleTime`, so pages without explicit freshness settings could refetch immediately during navigation. |
| Medium | Static files | Locally served uploads had default static middleware caching behavior instead of explicit `ETag`, `Last-Modified`, and max-age controls. |
| Medium | Monitoring | Queries executed inside `DatabaseService.transaction()` were not captured by the slow-query timing wrapper. |
| Medium | Bundle/build config | Next.js production config did not opt into package import optimization for the largest UI/chart/icon packages. |
| Remaining | Backend API latency | Additional serial count/data patterns remain in recruitment, finance, HR attendance, operations, fines, and platform data services. |

## 2. Optimizations Performed

- Added global React Query defaults: `staleTime: 30s`, `gcTime: 5m`, with existing retry and no-focus-refetch behavior preserved.
- Enabled Next.js production hardening/import optimization:
  - `poweredByHeader: false`
  - `compress: true`
  - `experimental.optimizePackageImports` for `lucide-react`, `recharts`, and heavily used Radix packages.
- Added backend response compression with configurable threshold:
  - `RESPONSE_COMPRESSION_THRESHOLD_BYTES=1024`
- Added explicit local upload caching:
  - `ETag`
  - `Last-Modified`
  - configurable `LOCAL_UPLOADS_CACHE_MAX_AGE=1d`
- Extended DB query timing to transaction-scoped queries by wrapping the transaction client query method.
- Parallelized independent list count/data queries with `Promise.all` on high-traffic list endpoints.
- Fixed two frontend production build blockers without changing UI or workflows.

## 3. Files Modified

- `backend/.env.example`
- `backend/package.json`
- `package-lock.json`
- `backend/src/main.ts`
- `backend/src/shared/database.service.ts`
- `backend/src/modules/approvals/services/approval-engine.service.ts`
- `backend/src/modules/compliance/services/compliance-document.service.ts`
- `backend/src/modules/hr/services/employee.service.ts`
- `backend/src/modules/notifications/services/notifications.service.ts`
- `backend/src/modules/platform/services/audit-log.service.ts`
- `backend/src/modules/recruitment/services/candidate.service.ts`
- `backend/src/modules/recruitment/services/vacancy.service.ts`
- `backend/src/modules/recruitment/services/workforce-plan.service.ts`
- `frontend/next.config.js`
- `frontend/src/components/query-provider.tsx`
- `frontend/src/app/(admin)/dashboard/platform/users/page.tsx`
- `frontend/src/components/users/create-user-drawer.tsx`

## 4. APIs Optimized

| API/service path | Optimization |
|---|---|
| Notifications list | Count and data query now execute in parallel. |
| Candidates list | Count and data query now execute in parallel. |
| Vacancies list | Count and data query now execute in parallel. |
| Workforce plans list | Count and data query now execute in parallel. |
| Compliance documents list | Count and data query now execute in parallel. |
| Approval inbox | Count and data query now execute in parallel. |
| Submitted approvals | Count and data query now execute in parallel. |
| Audit logs | Count and data query now execute in parallel. |
| Cross-tenant audit logs | Count and data query now execute in parallel. |
| Employees list | Count and data query now execute in parallel. |

## 5. Database Indexes Added

No new database indexes were added in this pass. Migration `098_performance_indexes.sql` already exists for the hot permission/RBAC paths from the prior performance pass.

## 6. Queries Optimized

- Replaced serial `COUNT(*)` then list query execution with parallel execution where both queries are independent and use the same filters.
- Preserved all existing filters, joins, sort order, pagination, access scope, and returned response shapes.
- Added timing visibility for queries executed through transaction clients.

## 7. Components Optimized

- `QueryProvider`: centralized default freshness window to reduce unnecessary refetching during route changes and tab switches.
- `platform/users/page.tsx`: fixed `branches` type so production builds can validate the existing scope UI.
- `CreateUserDrawer`: simplified the already-narrowed branch-location required flag to unblock production type checking.

## 8. Bundle Size Before/After

Before this pass, a reliable full bundle comparison could not be generated because `next build` failed during type checking.

After this pass, `next build` succeeds. Representative output:

| Metric | After |
|---|---|
| Shared first-load JS | 88 kB |
| `/dashboard/hr/employees/new` | 243 kB |
| `/dashboard/hr/employees/[id]/edit` | 236 kB |
| `/dashboard/platform/users` | 152 kB |
| `/dashboard/reports/*` | 123-166 kB |
| Largest listed route | `/dashboard/hr/employees/new`, 243 kB first-load JS |

## 9. API Latency Before/After

Live p50/p95 latency was not measured because this pass ran locally without production traffic. Structural improvement is deterministic for the optimized list endpoints:

- Before: page response time included `COUNT(*)` latency plus page-data latency.
- After: page response time is bounded closer to the slower of the two independent queries.

This primarily benefits high-use list screens: employees, notifications, audit logs, approvals, compliance documents, and recruitment lists.

## 10. Database Performance Before/After

Live `EXPLAIN ANALYZE` and production query timings were not run in this pass. The database performance improvement is structural:

- Reduced wall-clock wait for list endpoints by parallelizing independent reads.
- Increased observability by timing transaction-scoped queries.
- Existing slow-query Prometheus/logging support now covers more DB paths.

## 11. Validation

- `npm run build --workspace=backend`: passed.
- `npm run build --workspace=frontend`: passed.
- `npm run test --workspace=frontend -- --run`: 6 test files passed, 49 tests passed.
- `npm test --workspace=backend -- --runInBand`: 30 test suites passed, 236 tests passed.

Note: `npm install` reported 44 dependency audit findings in the existing dependency tree. They were not auto-fixed because that could introduce breaking dependency upgrades outside the performance scope.

## 12. Remaining Bottlenecks

- Additional serial list count/data query patterns remain in:
  - `recruitment` probation, offer, job description, interview, campaign, and application services
  - `operations` organization lifecycle service
  - `finance` list services
  - `hr` attendance services
  - `platform-data` services
  - `fines` services
- Live production latency still needs measurement from the Prometheus/Grafana stack after deployment.
- Some large routes remain around 230-243 kB due to employee form/address functionality; replacing `country-state-city` with a slimmer server-side lookup remains the largest future frontend win.
- Payload field projection across every list endpoint has not been fully audited against frontend field usage.
- No production DB `EXPLAIN ANALYZE` run was performed for the remaining report and dashboard aggregations.

## 13. Recommended Next Optimizations

1. Apply the same safe count/data parallelization pattern to the remaining services listed above.
2. Capture live p50/p95 API and SQL latency after deployment using the existing metrics dashboard.
3. Add route-level bundle tracking to CI so future heavy imports are caught before merge.
4. Audit frontend list pages for unused payload fields and reduce DTOs where safe.
5. Consider replacing `country-state-city` with a smaller lookup strategy if employee create/edit remains a critical route.
