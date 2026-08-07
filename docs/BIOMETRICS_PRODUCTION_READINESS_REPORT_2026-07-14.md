# Biometrics Production Readiness Report

Date: 2026-07-14  
Scope: database schema, Python biometric adapter, NestJS biometrics backend, attendance engine, queues, Redis, replay protection, circuit breakers, offline buffering, device communication, ADMS, EasyTimePro, TCP pull, trusted terminals, mobile/terminal punch flow, attendance records, audit logs, notifications, WebSockets, security, tenant isolation, RBAC, performance, scalability, and payroll consumption.

## Certification Decision

**Not certified for production.**

Production certification is blocked because critical issues remain, a high-risk security/configuration gap remains, attendance data loss is possible, and automated validation did not pass cleanly.

The intended architecture is mostly preserved:

- NestJS is the single attendance computation engine through `AttendanceEngineService.processPunchEvents`.
- Python is positioned as a synchronization bridge; deprecated Python attendance processing endpoints return `410`.
- Provider/device inputs generally normalize raw punches and enqueue them into NestJS ingestion.

However, the current source state does not satisfy the required production gates.

## Validation Results

- `npm run build --workspace=backend`: **passed**.
- `python -m pytest` from `biometric-service`: **failed at import**. Active Python is `3.6.7` with `pydantic 1.9.2`, while the service requires Python `>=3.11` and Pydantic `2.13.4`.
- `npm test --workspace=frontend`: **passed**, 7 files / 51 tests.
- `npm run build --workspace=frontend`: **failed** on a TypeScript error in `frontend/src/app/(admin)/dashboard/hr/employees/[id]/edit/page.tsx`.
- Targeted backend payroll/attendance tests: `attendance-summary.service.spec.ts` passed, `payroll.service.spec.ts` failed because the spec injects a template mock where `CurrencyService` is now expected.
- Live end-to-end device to payroll validation was **not completed** because the Python adapter tests fail in the active runtime and no live Postgres/Redis/device stack was validated.

## Critical Issues

1. **Python scheduled TCP pull sync can lose all pulled punches**
   - Evidence: `biometric-service/app/tasks/sync_tasks.py` opens `async_session_factory()` directly in `_sync_all_devices_async`; `biometric-service/app/services/sync_service.py` only calls `flush()`, not `commit()`.
   - Impact: scheduled TCP pull writes can be rolled back when the session closes, so device punches may never persist or forward.
   - Gate failed: no attendance data loss is possible.

2. **Unknown ZKTeco TCP pull users are skipped before NestJS pending-review handling**
   - Evidence: `biometric-service/app/services/sync_service.py` logs unknown `user_id` and continues.
   - Impact: raw punches for unmapped users never reach NestJS `pending_punch_reviews`; this is data loss for valid device punches.
   - Gate failed: no attendance data loss is possible.

3. **Python adapter cannot be validated in the active runtime**
   - Evidence: `python --version` is `3.6.7`; `python -m pytest` fails importing `field_validator`.
   - Impact: the synchronization bridge cannot be certified from this workspace runtime.

4. **Attendance dashboard production build is blocked**
   - Evidence: `npm run build --workspace=frontend` fails with a TypeScript error.
   - Impact: the dashboard layer in the requested E2E path cannot be certified as production-buildable.

## High Issues

1. **ADMS device authentication is configurable, not mandatory by default**
   - Evidence: `AdmsService.assertDeviceAuthentication` allows unauthenticated ADMS if no expected key is configured and `require_device_auth` / `BIOMETRICS_ADMS_REQUIRE_DEVICE_AUTH` is false.
   - Impact: production safety depends on environment/config discipline. This is a high-risk security issue unless production enforces device auth and source allowlists.

2. **Browser/mobile terminal CORS headers are incomplete**
   - Evidence: `backend/src/main.ts` does not include `x-api-key`, `x-signature`, `x-timestamp`, `x-nonce`, or `x-terminal-token` in `allowedHeaders`.
   - Impact: trusted terminal/mobile browser clients using signed custom headers can fail preflight.

3. **BullMQ requirement is not met literally**
   - Evidence: backend uses `@nestjs/bull` and `bull` Queue/Job APIs, not BullMQ.
   - Impact: queue semantics may be acceptable, but the requested BullMQ verification cannot be certified as implemented.

4. **Payroll consumption safety tests are currently broken**
   - Evidence: `payroll.service.spec.ts` fails because test injection order does not include `CurrencyService`.
   - Impact: payroll logic appears to consume approved/locked `payroll_attendance_summary`, but the automated safety tests for that path are not runnable.

## Medium Issues

1. **Redis-disabled mode silently disables processing**
   - Evidence: `REDIS_ENABLED=false` registers mock queues and omits processors.
   - Impact: acceptable for dev, unsafe for production unless explicitly blocked by deployment policy.

2. **Queue isolation is application-filtered, not physically tenant-isolated**
   - Evidence: DLQ/failed job APIs filter jobs by `tenantId`, while queues are shared.
   - Impact: code-level tenant checks exist, but stronger operational isolation would require Redis prefix/queue partition policy.

3. **SQL identifier interpolation exists in EasyTimePro adapters**
   - Evidence: EasyTimePro table/column names come from integration config.
   - Impact: values are partially quoted/bracketed but remain sensitive configuration inputs; restrict config mutation to trusted admins and validate identifiers.

## Low Issues

1. Comments and filenames refer to BullMQ while implementation uses Bull.
2. Python tests are present for adapter boundary/security, but no runnable E2E test currently proves Device -> Python -> NestJS -> Queue -> Attendance -> Dashboard -> Payroll.
3. Frontend tests pass, but production build failure elsewhere blocks full release confidence.

## Verified Positive Controls

- Durable fingerprint replay/dedup exists via `punch_fingerprints`.
- Durable nonce registries exist via `terminal_replay_nonces` and `punch_submission_nonces`.
- Terminal punches require nonce, request timestamp, and HMAC signature.
- NestJS attendance engine writes attendance records with tenant-scoped employee lookup and `ON CONFLICT (tenant_id, employee_id, date)` upsert.
- Unknown NestJS-side employee codes are preserved in `pending_punch_reviews`.
- Offline buffering has Redis hot path plus durable `biometric_offline_punch_buffers`.
- EasyTimePro sync has circuit breakers and advances cursors only after successful processing.
- WebSocket biometrics gateway validates JWT tenant context and joins tenant-scoped rooms.
- Payroll generation reads approved/payroll-locked attendance summaries and does not compute payroll directly from raw punches.

## Required Remediation Before Certification

1. Commit Python scheduled sync transactions and add tests proving scheduled TCP pull persists and forwards punches.
2. Forward unknown Python TCP pull punches to NestJS pending review, or persist them durably for later mapping without skipping.
3. Run Python validation under Python 3.11 with dependencies from `requirements.txt`.
4. Fix frontend production build.
5. Fix payroll service tests by injecting a `CurrencyService` mock and rerun payroll/attendance tests.
6. Enforce ADMS auth and network allowlists for production deployments.
7. Add custom biometric auth headers to CORS if browser/mobile terminal clients are supported.
8. Decide whether to migrate to BullMQ or formally accept Bull v4 and update the requirement/docs.

## E2E Status

The intended E2E path is implemented in pieces:

Device -> Python Adapter -> NestJS -> Queue -> Attendance Engine -> Attendance Record -> Dashboard -> Payroll Consumption

But it is **not production-certified** because the Python adapter validation fails, scheduled TCP pull can lose data, frontend production build fails, and payroll consumption tests are broken.
