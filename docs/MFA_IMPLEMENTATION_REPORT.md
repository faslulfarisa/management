# MFA Login Enforcement — Implementation Report

## 1. Current Architecture (before this change)

MFA setup/verify/disable already existed and worked correctly:

- `speakeasy` (TOTP, RFC 6238) + `qrcode` for secret/QR generation — already in `backend/package.json`.
- `users.mfa_secret` / `users.mfa_enabled` columns already existed (`001_initial_schema.sql`).
- `AuthController`/`AuthService` already exposed `GET /auth/mfa/status`, `POST /auth/mfa/setup`, `POST /auth/mfa/verify`, `POST /auth/mfa/disable`.
- A basic MFA settings page existed at `/dashboard/system/settings/mfa` (enable/disable only).

**The gap**: `AuthService.login()` always issued a full JWT + refresh token and only returned `mfaRequired: user.mfa_enabled` as an informational flag. The login page never read that flag. A user with `mfa_enabled = true` could log in and reach the dashboard without ever entering a TOTP code — MFA was decorative, not enforced.

## 2. New Authentication Flow

**No MFA enabled** — unchanged: `email + password → validateUser() → issueTokensForUser() → JWT + refresh_token cookie → dashboard`.

**MFA enabled, no trusted device**:
```
email + password → validateUser() succeeds → AuthService.login() detects mfa_enabled
  → no trusted_device_token cookie matches → INSERT mfa_login_sessions (5 min TTL)
  → response: { requiresMfa: true, loginSessionId, expiresIn: 300 } — no JWT, no cookie
  → frontend redirects to /mfa-verify
  → user submits TOTP or recovery code → POST /auth/mfa/login/verify
  → AuthService.verifyMfaLogin() validates the session + code
  → on success: issueTokensForUser() → JWT + refresh_token cookie (+ trusted_device_token if requested)
  → on failure: 401, no tokens issued, failure counted toward lockout
```

**MFA enabled, trusted device present**: `AuthService.login()` finds a matching, unexpired, unrevoked `trusted_devices` row for the `trusted_device_token` cookie and calls `issueTokensForUser()` directly — MFA is skipped for that device only, for 30 days.

A JWT is never minted anywhere in this flow except inside `issueTokensForUser()`, and that method is only ever called after password validation with no MFA, after a trusted-device match, or after a successful `verifyMfaLogin()`.

## 3. Files Modified / Added

**Backend**
- `backend/migrations/103_mfa_login_enforcement.sql` — new tables/columns (see §4).
- `backend/src/modules/auth/auth.service.ts` — refactored `login()`; extracted `issueTokensForUser()`; added `verifyMfaLogin()`, trusted-device helpers, recovery-code helpers, `regenerateRecoveryCodes()`, `listTrustedDevices()`, `revokeTrustedDevice()`, `getMfaActivity()`, and a `@Cron` sweep for expired login sessions.
- `backend/src/modules/auth/auth.controller.ts` — `POST /auth/login` now branches on `requiresMfa`; new `POST /auth/mfa/login/verify`, `POST /auth/mfa/recovery-codes/regenerate`, `GET /auth/mfa/trusted-devices`, `DELETE /auth/mfa/trusted-devices/:id`, `GET /auth/mfa/activity`; `POST /auth/mfa/setup` now requires a password.
- `backend/src/modules/auth/dto/auth.dto.ts` — `MfaSetupDto`, `MfaLoginVerifyDto`, `RecoveryCodesRegenerateDto`.
- `backend/src/modules/auth/exceptions/mfa-locked.exception.ts` — 429 for the MFA brute-force lockout.
- `backend/src/modules/auth/email.service.ts` — `sendMfaEnabledEmail`, `sendMfaDisabledEmail`, `sendRecoveryCodeUsedEmail`, `sendNewTrustedDeviceEmail`, `sendMfaRateLimitedEmail`.
- `backend/src/modules/auth/auth.module.ts` — imports `NotificationsModule` (via `forwardRef`, mirroring the existing cyclic import with `PlatformModule`).
- `backend/src/modules/auth/auth.service.spec.ts`, `backend/src/modules/auth/auth.controller.spec.ts` — new tests (§7).

**Frontend**
- `frontend/src/lib/auth/complete-login.ts` — shared post-auth routing logic (tenant resolution, role-based landing page), used by both the normal login path and the post-MFA-verify path.
- `frontend/src/lib/auth/mfa-pending-session.ts` — sessionStorage-backed (not localStorage) holder for the in-progress MFA challenge.
- `frontend/src/app/(auth)/login/page.tsx` — branches on `requiresMfa` instead of ignoring it.
- `frontend/src/app/(auth)/mfa-verify/page.tsx` — new dedicated verification screen.
- `frontend/src/components/auth/otp-input.tsx` — reusable 6-digit segmented input.
- `frontend/src/app/(admin)/dashboard/system/settings/mfa/page.tsx` — rewritten security console (status, recovery codes, trusted devices, recent activity).
- `frontend/src/components/auth/otp-input.test.tsx` — new tests.

## 4. Database Changes

`backend/migrations/103_mfa_login_enforcement.sql`:

| Object | Purpose |
|---|---|
| `users.mfa_failed_attempts`, `users.mfa_locked_until` | Per-user MFA brute-force lockout — mirrors the existing `failed_login_count`/`locked_until` account-lockout columns. |
| `users.mfa_enabled_at` | Drives "Last Enabled Date" in Security Settings. |
| `mfa_login_sessions` | The short-lived (5 min) intermediate session created after password validation when MFA is required. Swept by a cron every 5 minutes. |
| `trusted_devices` | Hashed device tokens (`device_hash`), 30-day expiry, revocable. |
| `mfa_recovery_codes` | Bcrypt-hashed one-time codes; `used_at` marks consumption. |

## 5. API Changes

| Endpoint | Change |
|---|---|
| `POST /auth/login` | Returns `{ requiresMfa: true, loginSessionId, expiresIn }` (no cookie, no token) instead of issuing tokens when `mfa_enabled` and no trusted device matches. |
| `POST /auth/mfa/login/verify` | **New.** Public (no JWT — none exists yet), rate-limited (10/min/IP). Accepts `loginSessionId` + (`token` or `recoveryCode`) + optional `trustDevice`. |
| `POST /auth/mfa/setup` | Now requires `password` in the body. |
| `POST /auth/mfa/verify` | Now also generates and returns 10 recovery codes (once). |
| `GET /auth/mfa/status` | Now also returns `enabledAt`, `recoveryCodesRemaining`, `trustedDeviceCount`. |
| `POST /auth/mfa/recovery-codes/regenerate` | **New.** Password-gated. |
| `GET /auth/mfa/trusted-devices` / `DELETE /auth/mfa/trusted-devices/:id` | **New.** |
| `GET /auth/mfa/activity` | **New.** Last 25 `mfa_%` audit-log entries for the current user. |

## 6. Frontend Changes

- Login no longer stores any token when `requiresMfa` is true — the pending session (`loginSessionId`, `email`, expiry) lives in `sessionStorage` only, never `localStorage`, so it can't look like an authenticated session if abandoned.
- `/mfa-verify` — 6-digit auto-advancing/backspacing/paste-aware OTP input, live countdown derived from `expiresIn`, "Trust this device for 30 days" checkbox, "use a recovery code instead" toggle, cancel back to `/login`. On expiry it clears state and redirects to `/login`.
- The MFA settings page replaced `alert()`/`confirm()`/`prompt()` with proper dialogs, and gates both QR/secret (re)generation and recovery-code regeneration behind a password-confirmation dialog.

## 7. Security Improvements

- **No bypass path**: a JWT is only produced by `issueTokensForUser()`, called from exactly three places — no-MFA login, a verified trusted device, and a successful `verifyMfaLogin()`. Frontend behavior has no bearing on this; the backend never trusts a client-supplied "MFA passed" signal.
- **Brute-force protection** is tracked on the user row (not the session), so an attacker who knows the password can't reset the failure counter by simply starting a new login.
- **Recovery codes and trusted-device tokens are never stored in plaintext** — bcrypt for recovery codes, sha256 for the device token (a high-entropy random secret, not a guessable password, so a deterministic hash is appropriate and allows O(1) lookup, unlike the per-row bcrypt scan used for `refresh_tokens`).
- **Disabling MFA revokes the safety net**: it clears recovery codes and revokes all trusted devices for that user, so a compromised "disable" doesn't leave a dangling trusted-device bypass.
- Every MFA state change (enable, disable, login success/failure, rate-limit, recovery-code use, trusted-device add/remove) is audit-logged and triggers a best-effort email + in-app notification.

## 8. Automated Tests

- `backend/src/modules/auth/auth.service.spec.ts` (16 tests) — no-MFA login, MFA challenge creation, `MfaLockedException` short-circuit, trusted-device skip and miss, correct/incorrect TOTP, 5th-failure lockout + notification, expired/already-used session rejection, recovery-code login + single-use enforcement, trusted-device registration, password-gated setup/regeneration rejecting a wrong password.
- `backend/src/modules/auth/auth.controller.spec.ts` (5 tests) — HTTP-level, through the real Nest pipeline (guards, `ValidationPipe`, controller) with `AuthService` mocked: confirms no cookie/token leaks out on the MFA-challenge path, cookies are set correctly on success, no cookies leak on failure, and malformed bodies are rejected before the service is ever called.
- `frontend/src/components/auth/otp-input.test.tsx` (6 tests) — auto-focus, auto-advance, backspace-to-previous, paste distribution, non-digit stripping.
- All 34 backend Jest tests and all 47 frontend Vitest tests pass with no regressions.

## 9. Remaining Risks / Known Gaps

- **No browser-level E2E harness** (Playwright/Cypress) exists in this repo. The controller tests above exercise the real HTTP pipeline with the service mocked, which is the closest equivalent available, but they do not click through an actual browser. A full login → enable MFA → logout → MFA-gated login → recovery code → trusted device run-through should be done manually (see Production Readiness Checklist) before this ships.
- **Device "fingerprint" is a label, not a security boundary.** `browser_fingerprint` is parsed from `User-Agent` for human-readable display only; the actual trust decision is the sha256-hashed random cookie token. A user-agent string is spoofable but irrelevant to the security model — flagging this so it's not mistaken for real device fingerprinting.
- **Email delivery is best-effort.** If `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` aren't configured, all MFA emails (enabled/disabled/recovery-code-used/new-device/rate-limited) silently log to console instead of sending — this matches the existing behavior of `sendPasswordResetEmail` etc., but must be confirmed configured before production launch.
- **In-app notification delivery** uses the existing `NotificationEmitterService`; if a tenant has notification preferences that suppress `auth`-sourced notifications, MFA security alerts would not reach the in-app feed (email is a separate, independent channel).
- **Recovery codes are not rate-limited separately from TOTP** — a recovery-code guess counts toward the same 5-attempt/5-minute lockout as a TOTP guess, which is intentional (one shared brute-force budget) but worth knowing.

## 10. Production Readiness Checklist

- [x] JWT never issued before MFA verification for `mfa_enabled` users.
- [x] Backend enforces MFA regardless of any frontend state (no client-trusted bypass signal exists).
- [x] Login sessions expire after 5 minutes and are swept by a cron.
- [x] TOTP remains RFC 6238–compatible (Google/Microsoft Authenticator, Authy, 1Password, Bitwarden, Duo Mobile) — no change to the `speakeasy` verification parameters.
- [x] Trusted devices: hashed storage, 30-day expiry, revocable from Security Settings.
- [x] Recovery codes: hashed storage, single use, downloadable/printable once, regenerable behind a password prompt.
- [x] Rate limiting: 5 failed attempts → 5-minute lockout (server-side, per user) + `@Throttle` at the HTTP layer.
- [x] Audit logging + email/in-app notifications for every MFA security event.
- [x] MFA behavior is role-agnostic — `issueTokensForUser`/`login`/`verifyMfaLogin` never branch on `userType`/`internalRole`, only on `mfa_enabled` and trusted-device state.
- [ ] Confirm `SMTP_*` env vars are set in the production environment before relying on MFA email notifications.
- [ ] Run the manual end-to-end pass described in §9 against a staging environment with a real authenticator app before rollout.
