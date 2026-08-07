// sessionStorage (not localStorage) on purpose — this payload represents an
// unauthenticated, in-progress login. It must never persist across browser
// restarts or look like an authenticated session if left lying around.
const KEY = 'mfa_pending_login';

export interface MfaPendingSession {
  loginSessionId: string;
  email: string;
  /** Epoch ms when the login session expires — derived once from the server's `expiresIn`. */
  expiresAt: number;
}

export function saveMfaPendingSession(loginSessionId: string, email: string, expiresIn: number) {
  const payload: MfaPendingSession = { loginSessionId, email, expiresAt: Date.now() + expiresIn * 1000 };
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function readMfaPendingSession(): MfaPendingSession | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MfaPendingSession;
  } catch {
    return null;
  }
}

export function clearMfaPendingSession() {
  sessionStorage.removeItem(KEY);
}
