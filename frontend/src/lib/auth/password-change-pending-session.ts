// sessionStorage (not localStorage) on purpose — see mfa-pending-session.ts.
// This represents an unauthenticated, in-progress forced password change.
const KEY = 'password_change_pending_login';

export interface PasswordChangePendingSession {
  changeSessionId: string;
  email: string;
  /** Epoch ms when the session expires — derived once from the server's `expiresIn`. */
  expiresAt: number;
}

export function savePasswordChangePendingSession(changeSessionId: string, email: string, expiresIn: number) {
  const payload: PasswordChangePendingSession = { changeSessionId, email, expiresAt: Date.now() + expiresIn * 1000 };
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function readPasswordChangePendingSession(): PasswordChangePendingSession | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PasswordChangePendingSession;
  } catch {
    return null;
  }
}

export function clearPasswordChangePendingSession() {
  sessionStorage.removeItem(KEY);
}
