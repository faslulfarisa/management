'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeroPanel, AuthBrandMark, HeroStep } from '@/components/auth/auth-hero-panel';
import { PasswordStrengthMeter } from '@/components/auth/password-strength-meter';
import { completeLogin } from '@/lib/auth/complete-login';
import { saveMfaPendingSession } from '@/lib/auth/mfa-pending-session';
import {
  readPasswordChangePendingSession, clearPasswordChangePendingSession,
  type PasswordChangePendingSession,
} from '@/lib/auth/password-change-pending-session';

const schema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/(?=.*[a-z])/, 'Must include a lowercase letter')
    .regex(/(?=.*[A-Z])/, 'Must include an uppercase letter')
    .regex(/(?=.*\d)/, 'Must include a number')
    .regex(/(?=.*[^A-Za-z0-9])/, 'Must include a special character'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

function friendlyError(raw?: string): string {
  if (!raw) return 'Something went wrong. Please try again.';
  const s = raw.toLowerCase();
  if (s.includes('already been used') || s.includes('expired')) return 'This session has expired. Please log in again.';
  return raw;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [session, setSession] = useState<PasswordChangePendingSession | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const {
    register, handleSubmit, watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const pwValue = watch('newPassword', '');

  useEffect(() => {
    const pending = readPasswordChangePendingSession();
    if (!pending || pending.expiresAt <= Date.now()) {
      clearPasswordChangePendingSession();
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
        clearPasswordChangePendingSession();
        router.replace('/login');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session, router]);

  const handleCancel = () => {
    clearPasswordChangePendingSession();
    router.push('/login');
  };

  const onSubmit = async (data: FormData) => {
    if (!session) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/change-password/verify', {
        changeSessionId: session.changeSessionId,
        newPassword: data.newPassword,
      });
      const resultData = res.data.data;
      clearPasswordChangePendingSession();

      if (resultData.requiresMfa) {
        saveMfaPendingSession(resultData.loginSessionId, session.email, resultData.expiresIn);
        router.push('/mfa-verify');
        return;
      }

      await completeLogin(resultData, session.email, router);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.response?.data?.message ?? '';
      setError(friendlyError(Array.isArray(msg) ? msg[0] : msg));
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="min-h-screen flex bg-background">
      <AuthHeroPanel
        headline={<>Let&apos;s secure your <span className="text-cyan-400">new account.</span></>}
        description="This account was set up with a temporary password. Choose a new one to continue to your workspace."
      >
        <div className="space-y-4">
          <HeroStep number="1" title="Choose a strong password" desc="At least 8 characters with uppercase, lowercase, a number, and a special character." />
          <HeroStep number="2" title="Confirm it" desc="Re-enter it to make sure it matches." />
          <HeroStep number="3" title="You're in" desc="This temporary password won't work again after today." />
        </div>
      </AuthHeroPanel>

      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden mb-8">
            <AuthBrandMark variant="light" />
          </div>

          <div className="mb-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted">
              <KeyRound className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Set a new password</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Signing in as <span className="font-medium text-foreground">{session.email}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium text-foreground">New password</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  autoFocus
                  className={`pl-10 pr-10 h-11 ${errors.newPassword ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <PasswordStrengthMeter password={pwValue} />

              {errors.newPassword ? (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Must contain uppercase, lowercase, a number, and a special character.</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirm password</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showCf ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  className={`pl-10 pr-10 h-11 ${errors.confirmPassword ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowCf(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <p className="text-xs text-muted-foreground">
              This page expires in{' '}
              <span className="font-semibold tabular-nums text-foreground">{minutes}:{seconds.toString().padStart(2, '0')}</span>
            </p>

            <Button type="submit" className="w-full h-11 text-base font-semibold shadow-sm" disabled={loading}>
              {loading ? 'Updating password…' : (
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Set new password & continue
                </span>
              )}
            </Button>

            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Cancel and return to sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
