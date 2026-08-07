'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeroPanel, AuthBrandMark, HeroStep } from '@/components/auth/auth-hero-panel';
import { OtpInput } from '@/components/auth/otp-input';
import { completeLogin } from '@/lib/auth/complete-login';
import { readMfaPendingSession, clearMfaPendingSession, type MfaPendingSession } from '@/lib/auth/mfa-pending-session';

function friendlyError(raw?: string): string {
  if (!raw) return 'Something went wrong. Please try again.';
  const s = raw.toLowerCase();
  if (s.includes('too many failed')) return raw;
  if (s.includes('already been used') || s.includes('expired')) return 'This login session has expired. Please log in again.';
  if (s.includes('invalid recovery code')) return 'That recovery code is incorrect or has already been used.';
  if (s.includes('invalid verification code')) return 'That code is incorrect. Please check your authenticator app and try again.';
  return raw;
}

export default function MfaVerifyPage() {
  const router = useRouter();
  const [session, setSession] = useState<MfaPendingSession | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const pending = readMfaPendingSession();
    if (!pending || pending.expiresAt <= Date.now()) {
      clearMfaPendingSession();
      router.replace('/login');
      return;
    }
    setSession(pending);
    setSecondsLeft(Math.max(0, Math.round((pending.expiresAt - Date.now()) / 1000)));
  }, [router]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        clearMfaPendingSession();
        router.replace('/login');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session, router]);

  const handleCancel = () => {
    clearMfaPendingSession();
    router.push('/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/mfa/login/verify', {
        loginSessionId: session.loginSessionId,
        ...(useRecovery ? { recoveryCode: recoveryCode.toUpperCase() } : { token: code }),
        trustDevice,
      });
      clearMfaPendingSession();
      await completeLogin(res.data.data, session.email, router);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.response?.data?.message ?? '';
      setError(friendlyError(msg));
      if (!useRecovery) setCode('');
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const canSubmit = useRecovery ? /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(recoveryCode) : code.length === 6;

  return (
    <div className="min-h-screen flex bg-background">
      <AuthHeroPanel
        headline={<>One more step to <span className="text-cyan-400">secure your sign-in.</span></>}
        description="Your account is protected with multi-factor authentication. Enter the code from your authenticator app to continue."
      >
        <div className="space-y-4">
          <HeroStep number="1" title="Open your authenticator app" desc="Google Authenticator, Microsoft Authenticator, Authy, 1Password, or any RFC 6238 TOTP app." />
          <HeroStep number="2" title="Enter the 6-digit code" desc="Codes refresh every 30 seconds — enter the current one." />
          <HeroStep number="3" title="Trust this device (optional)" desc="Skip this step on this browser for the next 30 days." />
        </div>
      </AuthHeroPanel>

      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden mb-8">
            <AuthBrandMark variant="light" />
          </div>

          <div className="mb-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Multi-Factor Authentication</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {useRecovery
                ? 'Enter one of your 10 recovery codes.'
                : 'Enter the 6-digit code from your Authenticator App.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {useRecovery ? (
              <div className="space-y-2">
                <label htmlFor="recoveryCode" className="text-sm font-medium text-foreground">Recovery code</label>
                <Input
                  id="recoveryCode"
                  placeholder="XXXX-XXXX"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={9}
                  className="h-11 text-center font-mono text-lg tracking-widest"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <OtpInput value={code} onChange={setCode} disabled={loading} />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This verification expires in{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {minutes}:{seconds.toString().padStart(2, '0')}
              </span>
            </p>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Trust this device for 30 days
            </label>

            <Button type="submit" className="w-full h-11 text-base font-semibold shadow-sm" disabled={loading || !canSubmit}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </Button>

            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setUseRecovery((v) => !v); setError(''); }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {useRecovery ? <Smartphone className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                {useRecovery ? 'Use my authenticator app instead' : 'Use a recovery code instead'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Cancel and return to sign in
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
