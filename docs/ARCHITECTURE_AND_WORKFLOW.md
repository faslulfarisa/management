# Ai-HRMS Architecture and Workflow

## 1. Project Summary

Ai-HRMS is a hotel workforce management platform built as a multi-part system:

- `frontend`: Next.js application for platform operations, customer admin portals, branch admin screens, employee self-service, manager views, auth, and public career pages.
- `backend`: NestJS API serving the core business domain, authentication, authorization, reports, realtime gateways, background jobs, file handling, billing, and integrations.
- `biometric-service`: Independent FastAPI service for biometric device management, ZKTeco communication, attendance synchronization, Celery workers, and HRMS callbacks.
- `monitoring` and `grafana`: Prometheus, Grafana, Loki, Promtail, and dashboard assets for operational visibility.
- `docs`: Functional and implementation reports for major modules and production readiness work.

The root package uses npm workspaces for the frontend and backend. The biometric service is separate Python infrastructure.

## 2. Top-Level Runtime Architecture

```text
Browser / User
  |
  | Next.js pages, middleware, React Query, Zustand
  v
frontend
  |
  | HTTP /api/v1, cookies, bearer access token, Socket.IO
  v
backend NestJS API
  |
  | pg Pool, SQL migrations, Redis/Bull, schedulers, websockets, external APIs
  v
PostgreSQL / Redis / Storage / Email / Payment / Integrations

Biometric Devices
  |
  | pyzk / device polling / local sync
  v
biometric-service FastAPI + Celery
  |
  | HRMS callback API key / HTTP
  v
backend biometrics ingestion
```

## 3. Repository Layout

```text
AI-HRMS/
  backend/                     NestJS API and SQL migrations
    src/
      app.module.ts            Main module composition
      main.ts                  HTTP bootstrap, CORS, Swagger, static uploads
      modules/                 Business modules
      shared/                  Database, Redis, metrics, uploads, permissions cache
      config/                  Runtime configuration helpers
    migrations/                Ordered SQL migrations
    scripts/                   Migration and seed scripts
    uploads/                   Local file storage when STORAGE_DRIVER=local

  frontend/                    Next.js application
    src/
      app/                     App Router route groups
      components/              UI, domain, layout, and portal components
      lib/                     API clients, schemas, utilities, exports
      store/                   Zustand stores
      hooks/                   Feature and realtime hooks
      services/                Websocket clients
      middleware.ts            Cross-portal route guard and branch-admin rewrite

  biometric-service/           FastAPI biometric microservice
    app/
      api/                     Devices, employees, attendance, shifts, sync APIs
      services/                Device and sync services
      tasks/                   Celery worker and beat tasks
      utils/                   pyzk client, punch forwarder, HRMS callback
    alembic/                   Biometric DB migrations

  monitoring/                  Prometheus, Grafana, Loki, Promtail config
  docs/                        Architecture and module documentation
```

## 4. Frontend Architecture

The frontend is a Next.js 14 App Router application.

Primary route groups:

- `(auth)`: Login, MFA verification, password reset, registration, organization registration, platform login.
- `(admin)`: Customer/admin dashboard, branch admin rewrite target, HR, finance, platform configuration, biometrics, reports, compliance, approvals, schedules, settings.
- `(operations)`: Internal platform operations portal for non-tenant staff.
- `(employee)`: Employee self-service portal for home, attendance, leave, payroll, profile, documents, requests, shifts, notifications, performance, exit.
- `(manager)`: Manager-facing views.
- `(career)`: Public career portal and application/preboarding pages.

Important frontend building blocks:

- `src/lib/api.ts`: Axios API client using `NEXT_PUBLIC_API_URL` or `/api/v1`. It attaches bearer access tokens from localStorage, sends cookies, and serializes concurrent token refreshes.
- `src/store/auth.store.ts`: Central Zustand auth state, tenant selection, employee profile, permissions, access scope, and hydration from localStorage.
- `src/lib/auth/complete-login.ts`: Shared post-login routing and tenant resolution logic for normal login and MFA completion.
- `src/middleware.ts`: Defense-in-depth route separation between platform and customer portals using a non-sensitive `portal` cookie. Also rewrites `/branch-admin/*` to `/dashboard/*`.
- `src/components/query-provider.tsx`: React Query provider for data fetching.
- `src/components/store-hydration.tsx`: Client-side state hydration.
- `src/services/*-ws.ts` and `src/hooks/use-*-socket.ts`: Socket.IO clients and hooks for realtime approval and biometric events.

The frontend does not enforce business authorization by itself. It improves UX and route separation, while backend guards remain the security boundary.

## 5. Backend Architecture

The backend is a NestJS API with a modular domain structure.

Bootstrap behavior in `backend/src/main.ts`:

- Creates the Nest app with raw body support for Razorpay webhook signature verification.
- Enables Socket.IO adapter and shutdown hooks.
- Uses cookie parser and response compression.
- Serves `/uploads` from local disk when `STORAGE_DRIVER=local`.
- Enables CORS for `FRONTEND_URL`.
- Sets the global API prefix to `/api/v1`.
- Enables global validation with whitelist, non-whitelisted rejection, and DTO transformation.
- Publishes Swagger at `/api/docs`.

Core composition in `backend/src/app.module.ts`:

- Global configuration via `ConfigModule`.
- Request throttling.
- Scheduled jobs via `ScheduleModule`.
- Redis/Bull queue setup when Redis is enabled.
- Global shared services through `SharedModule`.
- Feature modules for auth, platform, operations, HR, finance, GST, dashboard, billing, integrations, biometrics, approvals, notifications, organization registration, recruitment, exit management, assets, reports, fines, compliance, and historical attendance import.
- Global logging interceptor.

## 6. Backend Shared Infrastructure

Shared services are registered globally in `backend/src/shared/shared.module.ts`.

Key shared services:

- `DatabaseService`: PostgreSQL `pg` pool wrapper, query timing, slow query logging, pool metrics, and transaction helper.
- `RedisProvider`: Redis access for modules that need it.
- `BiometricsMetricsService`: Prometheus metric primitives used by health and biometrics/performance work.
- `FileUploadService`: Shared file upload behavior.
- `CredentialEncryptionService`: AES-256-GCM credential protection.
- `BrandingEngineService`: Organization branding logic.
- `PermissionsCacheService`: Short-TTL permission lookup cache.

Database migrations live in `backend/migrations` and are applied by `backend/scripts/migrate.js`. The migration runner stores applied filenames in `schema_migrations` and handles `CREATE INDEX CONCURRENTLY` outside transactions.

## 7. Backend Domain Modules

The backend modules are grouped by business capability:

- `auth`: Login, refresh, logout, MFA, password reset, sessions, tenant selection, guards, strategies, permission decorators.
- `platform`: Organizations, branches, areas, departments, roles, permissions, users, templates, approval chains, analytics, audit logs, signup offers.
- `operations`: Internal platform operations portal, organization approvals, change requests, internal staff, operational reports.
- `hr`: Employees, attendance, leave, shifts, schedules, payroll, payslips, bank accounts, performance, overtime, Razorpay webhooks.
- `biometrics`: Device/provider management, terminal APIs, punch ingestion, attendance engine, websocket gateway, sync processors, queue health, corrections.
- `approvals`: Approval engine, approval APIs, realtime approval gateway, scheduled escalation/maintenance.
- `notifications`: Notification center, preferences, document expiry alerts, realtime delivery through approval gateway integration.
- `recruitment`: Workforce planning, vacancies, candidates, applications, interviews, offers, pipeline stages, campaigns, job descriptions, preboarding, employee conversion.
- `compliance`: Document management, policies, categories, requests, approvals, expiry tracking, dashboards, reports.
- `exit-management`: Exit requests, manager/self-service flows, checklist, clearance, interview, knowledge transfer, final settlement, offboarding orchestration.
- `historical-attendance-import`: Import validation, mapping, reconciliation, rebuild, rollback, dependency rebuild, connectors, queue, websocket progress.
- `reports`: Attendance, payroll, HR, finance, branch, biometrics, leave, recruitment, performance, saved reports, operational analytics.
- `finance` and `gst`: Vendors, finance APIs, GST APIs.
- `billing`: Billing and billing engine.
- `assets`: Asset management.
- `fines`: Fines and deduction categories.
- `integrations`: External integration endpoints.
- `dashboard`: Aggregated dashboard APIs.

## 8. Authentication and Authorization Workflow

1. The user submits credentials to `POST /api/v1/auth/login`.
2. `LocalAuthGuard` validates credentials through the auth service.
3. The backend may require a forced password change or MFA verification before issuing full session credentials.
4. On successful login, the backend returns an access token and sets an httpOnly `refresh_token` cookie.
5. The frontend stores the access token in localStorage and keeps non-sensitive tenant/portal hints locally.
6. `completeLogin` resolves the correct portal:
   - Internal staff go to `/operations`.
   - Pending organization users go to registration pending status.
   - Branch-scoped admins go to `/branch-admin`, which middleware rewrites to dashboard routes.
   - Admin-level users go to `/dashboard`.
   - Employee users go to `/home`.
7. API calls attach `Authorization: Bearer <access_token>`.
8. On non-auth 401 responses, the frontend calls `/auth/refresh` once for all concurrent failures, updates the access token, and retries the original request.
9. Backend authorization is enforced by guards such as JWT, active organization, hierarchy, permission, internal staff, ops permission, org admin, super admin, branch access, and API key/JWT hybrid guards.

## 9. Tenant and Portal Model

The application supports multiple user populations:

- Platform/internal staff: No tenant context; use the operations portal.
- Customer organization users: Work inside an active organization/tenant.
- Branch-scoped admins: Enter through `/branch-admin`, then reuse dashboard route implementations.
- Employees: Use employee self-service routes and employee-profile-specific APIs.
- Public users/candidates: Use career and registration routes without full authenticated tenant context.

Tenant selection is explicit through `/auth/select-tenant`, which returns a tenant-scoped access token. The frontend remembers the last selected tenant per user and refreshes permissions after tenant switches.

## 10. Request and Data Flow

Typical dashboard API flow:

```text
Page component
  -> feature component or hook
  -> frontend lib API wrapper
  -> Axios client with bearer token and cookies
  -> NestJS controller
  -> guards and DTO validation
  -> service layer
  -> DatabaseService query or transaction
  -> response envelope
  -> React Query cache / Zustand state / local component state
```

Typical write flow:

```text
User action
  -> form validation or component state
  -> POST/PATCH/DELETE API call
  -> backend DTO validation
  -> permission and tenant checks
  -> service transaction
  -> audit/event/notification where applicable
  -> frontend invalidates queries or updates local state
```

Typical realtime flow:

```text
Backend domain event
  -> gateway service
  -> Socket.IO namespace/event
  -> frontend websocket service
  -> hook/store update
  -> UI refresh
```

## 11. Biometrics Workflow

The project has two biometrics paths:

1. Core backend biometrics module:
   - Manages providers, devices, terminals, punch ingestion, queue health, corrections, attendance engine, and realtime biometric updates.
   - Uses Bull queues when Redis is enabled.
   - Provides endpoints under `/api/v1/biometrics` and `/api/v1/biometrics/terminals`.

2. Standalone `biometric-service`:
   - FastAPI service on port `8100`.
   - Exposes `/api/v1/devices`, `/api/v1/employees`, `/api/v1/attendance`, `/api/v1/shifts`, and `/api/v1/sync`.
   - Uses PostgreSQL, Redis, Celery worker, and Celery beat.
   - Uses `pyzk` to communicate with ZKTeco devices.
   - Can callback into HRMS using the legacy-compatible `HMS_BASE_URL` and `HMS_API_KEY` variables.

Biometric flow:

```text
Device punch
  -> biometric-service polling/sync or backend terminal/provider ingestion
  -> duplicate detection and normalization
  -> attendance engine
  -> attendance records and audit trail
  -> realtime event to dashboards
  -> reports/payroll/attendance summaries consume normalized records
```

## 12. Background Jobs and Scheduled Work

The backend uses `@nestjs/schedule` for recurring jobs and Bull for queue-backed work when Redis is enabled.

Observed scheduled and queued areas:

- Auth session cleanup for password-change and MFA login sessions.
- Device and terminal stale-status sweeps.
- EasyTimePro biometric sync.
- Punch ingestion queue.
- Biometric sync queue.
- Payroll payout queue.
- Approval escalation/maintenance.
- Notification document expiry checks.
- Compliance expiry checks.
- Interview scheduling reminders.
- Break monitoring.
- Attendance summary generation.
- Historical attendance import processing.

Redis is configurable. In development, `REDIS_ENABLED=false` allows the API to run without Redis and queue-backed features degrade instead of blocking startup.

## 13. Files, Storage, and Documents

The backend supports local uploads when `STORAGE_DRIVER=local`; files are stored under `backend/uploads` and served from `/uploads`. The environment file also supports MinIO/S3-style configuration with bucket, endpoint, credentials, and SSL flags.

Document-heavy modules include compliance, platform documents, branding assets, recruitment resumes/attachments, and exit-management documents. Keep upload and file-serving concerns inside shared upload/storage utilities rather than duplicating file handling in feature modules.

## 14. Observability and Health

Backend health APIs live under `/api/v1/health`. Prometheus is configured to scrape backend metrics at `/api/v1/health/metrics`.

Monitoring stack:

- Prometheus on port `9090`.
- Grafana on port `3003`.
- Loki on port `3100`.
- Optional Promtail shipping JSON logs from `/var/log/ai-hrms`.

Dashboards exist for HRMS performance and biometrics. The backend also records DB query duration, pool counts, slow query logs, and slow request logs.

## 15. Local Development Workflow

Install dependencies from the repository root:

```bash
npm install
```

Run frontend and backend together:

```bash
npm run dev
```

Run individually:

```bash
npm run dev:backend
npm run dev:frontend
```

Apply backend migrations:

```bash
npm run db:migrate
```

Seed backend data:

```bash
npm run db:seed
```

Build both workspaces:

```bash
npm run build
```

Run backend tests:

```bash
npm run test --workspace=backend
```

Run frontend tests:

```bash
npm run test --workspace=frontend
```

Run biometric service stack:

```bash
cd biometric-service
docker compose up -d
```

Run monitoring stack:

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

## 16. Environment Configuration

Important backend variables:

- `PORT`: Backend port, default `3001`.
- `DATABASE_URL`: PostgreSQL connection string.
- `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS`, `DATABASE_POOL_CONNECTION_TIMEOUT_MS`: Pool tuning.
- `DATABASE_SLOW_QUERY_MS`, `SLOW_REQUEST_MS`: Performance logging thresholds.
- `REDIS_ENABLED`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis and Bull configuration.
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN`: Auth token configuration.
- `STORAGE_DRIVER`: `local` or `minio`.
- `FRONTEND_URL`: CORS origin.
- SMTP, SMS, WhatsApp, Razorpay, Cashfree, Google Maps, ZKTeco, and credential encryption variables.

Important frontend variables:

- `NEXT_PUBLIC_API_URL`: Browser API base URL, typically `http://localhost:3001/api/v1`.
- `BACKEND_URL`: Optional Next.js rewrite target origin.

Important biometric-service variables:

- `DATABASE_URL` and `SYNC_DATABASE_URL`.
- `REDIS_URL`.
- `HMS_BASE_URL` and `HMS_API_KEY` for the legacy-compatible HRMS callback integration.
- pyzk timeout/retry defaults.
- sync, heartbeat, and processing intervals.
- attendance threshold defaults.

## 17. Testing and Quality Workflow

Backend:

- Jest is configured for `*.spec.ts` under `backend/src`.
- Existing tests cover services and utilities in auth, recruitment, compliance, exit management, attendance filtering, and related modules.
- Use focused service tests for domain logic and controller tests for guard/contract behavior.

Frontend:

- Vitest is configured with React Testing Library and jsdom.
- Existing tests cover navigation, breadcrumbs, back button behavior, and route labels.
- Use component tests for complex UI state and utility tests for shared route/data logic.

Before merging meaningful changes:

1. Run the relevant workspace tests.
2. Run the relevant build if the change touches TypeScript contracts, routing, or module exports.
3. Apply migrations locally if database shape changed.
4. Verify auth/tenant behavior when touching guards, login, permissions, or route middleware.
5. Verify queue/realtime behavior when touching biometrics, approvals, imports, notifications, or payroll payouts.

## 18. Extension Guidelines

When adding a backend feature:

1. Place it in the existing domain module when possible.
2. Add DTOs with class-validator decorators.
3. Enforce tenant, hierarchy, branch, or permission guards at controller boundaries.
4. Put business rules in services.
5. Use `DatabaseService.transaction` for multi-step writes.
6. Emit notifications, approval requests, audit records, or realtime events only through existing services.
7. Add SQL migrations for schema changes.
8. Add focused tests for risky business logic.

When adding a frontend feature:

1. Add the route under the correct App Router group.
2. Reuse existing layout and domain components.
3. Add API calls in `src/lib/*-api.ts` or the closest existing feature client.
4. Use React Query for server state.
5. Use Zustand only for cross-page client state.
6. Keep permission and portal checks aligned with backend authorization.
7. Invalidate or update queries after mutations.

When adding biometric functionality:

1. Decide whether it belongs in the core backend biometrics module or the standalone biometric service.
2. Keep device communication and polling concerns in the biometric service.
3. Keep HRMS business outcomes, attendance records, reports, payroll impact, and tenant permissions in the backend.
4. Preserve idempotency for punch ingestion.
5. Use queues for heavy sync/import processing.

## 19. Architectural Risks and Watchpoints

- The backend is SQL-first with many migrations and direct queries. Keep query logic centralized in services and use transactions consistently.
- Auth state spans httpOnly cookies, localStorage, tenant-scoped JWTs, and middleware portal hints. Changes here need careful end-to-end verification.
- Redis can be disabled, so queue-backed modules should continue to degrade gracefully in development.
- Several modules are approval, notification, and audit aware. New write workflows should check whether they need to participate in those cross-cutting systems.
- There are two biometric integration surfaces. Avoid duplicating device logic in the backend if it belongs in the standalone service.
- File uploads can be local or object-storage backed. Feature modules should not assume local paths directly.
- Route groups share some implementations through middleware rewrites, especially branch admin. Navigation and authorization changes should consider both paths.

## 20. Recommended Mental Model

Think of the system as:

- Frontend portals for different user populations.
- One modular NestJS business API as the source of truth.
- PostgreSQL as the primary system of record.
- Redis/Bull as optional acceleration for background work.
- Socket.IO as the realtime delivery layer.
- A separate biometric edge service for hardware/device concerns.
- Monitoring as a first-class operational layer.

Most new product work should start by identifying the correct business module, the tenant/permission boundary, the required data model change, and whether the workflow needs approvals, notifications, audit history, queues, or realtime updates.
