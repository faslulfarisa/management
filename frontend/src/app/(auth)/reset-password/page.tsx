'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff,
  KeyRound, Lock, Mail, ShieldCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeroPanel, AuthBrandMark, HeroStep } from '@/components/auth/auth-hero-panel';
import { PasswordStrengthMeter } from '@/components/auth/password-strength-meter';

/* ── Validation ─────────────────────────────────────────────────── */

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  otp: z
    .string()
    .min(1, 'Reset code is required')
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/(?=.*[a-z])/, 'Must include a lowercase letter')
    .regex(/(?=.*[A-Z])/, 'Must include an uppercase letter')
    .regex(/(?=.*\d)/, 'Must include a number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

/* ── Error message mapper ───────────────────────────────────────── */

function friendlyError(raw?: string): string {
  if (!raw) return 'Something went wrong. Please try again.';
  const s = raw.toLowerCase();
  if (s.includes('expired')) return 'This reset code has expired. Please request a new one.';
  if (s.includes('invalid reset code') || s.includes('invalid otp')) return 'The code you entered is incorrect. Please check your email and try again.';
  if (s.includes('not found') || s.includes('no user')) return 'We could not find an account with that email address.';
  if (s.includes('already used')) return 'This reset code has already been used. Please request a new one.';
  if (s.includes('too many') || s.includes('throttle')) return 'Too many attempts. Please wait a minute before trying again.';
  return raw;
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showPw, setShowPw]       = useState(false);
  const [showCf, setShowCf]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);
  const [countdown, setCountdown] = useState(5);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: searchParams?.get('email') ?? '',
      otp: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const pwValue = watch('newPassword', '');

  // Auto-redirect after success
  useEffect(() => {
    if (!done) return;
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); router.push('/login'); }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [done, router]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', {
        email: data.email,
        otp: data.otp,
        newPassword: data.newPassword,
      });
      setDone(true);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        ?? err.response?.data?.message
        ?? err.response?.data?.error
        ?? '';
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">

      <AuthHeroPanel
        headline={
          <>
            Almost there.{' '}
            <span className="text-cyan-400">Set your new password.</span>
          </>
        }
        description="Enter the 6-digit code from your email, choose a strong new password, and you'll be back in your workspace in seconds."
      >
        <div className="space-y-4">
          <HeroStep number="1" title="Enter your email" desc="The address you used to request the reset." />
          <HeroStep number="2" title="Enter your reset code" desc="The 6-digit code we sent to your inbox." />
          <HeroStep number="3" title="Choose a strong password" desc="At least 8 characters with uppercase, lowercase, and a number." />
        </div>
      </AuthHeroPanel>

      {/* ── Right form panel ──────────────────────────────────────── */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">

          {/* mobile brand */}
          <div className="lg:hidden mb-8">
            <AuthBrandMark variant="light" />
          </div>

          {done ? (
            <SuccessState countdown={countdown} />
          ) : (
            <ResetForm
              register={register}
              handleSubmit={handleSubmit}
              onSubmit={onSubmit}
              errors={errors}
              error={error}
              loading={loading}
              showPw={showPw}
              setShowPw={setShowPw}
              showCf={showCf}
              setShowCf={setShowCf}
              pwValue={pwValue}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Success state ─────────────────────────────────────────────── */

function SuccessState({ countdown }: { countdown: number }) {
  return (
    <div className="text-center">
      <div className="mb-6 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
      </div>
      <h2 className="text-3xl font-bold tracking-tight text-foreground">Password updated!</h2>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        Your password has been changed successfully. All previous sessions have been signed out for your security.
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        Redirecting to sign in in{' '}
        <span className="font-semibold text-foreground tabular-nums">{countdown}s</span>…
      </p>
      <Link href="/login" className="mt-4 block">
        <Button className="w-full h-11 text-base font-semibold shadow-sm">
          <ShieldCheck className="mr-2 h-4 w-4" />
          Sign in now
        </Button>
      </Link>
    </div>
  );
}

/* ── Reset form ────────────────────────────────────────────────── */

function ResetForm({
  register, handleSubmit, onSubmit, errors, error, loading,
  showPw, setShowPw, showCf, setShowCf, pwValue,
}: any) {
  return (
    <>
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Set new password</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the code from your email and choose a new secure password.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">Email address</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              className={`pl-10 h-11 ${errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              {...register('email')}
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        {/* OTP */}
        <div className="space-y-2">
          <label htmlFor="otp" className="text-sm font-medium text-foreground">Reset code</label>
          <Input
            id="otp"
            type="text"
            inputMode="numeric"
            placeholder="6-digit code from your email"
            maxLength={6}
            autoComplete="one-time-code"
            className={`h-11 tracking-[0.4em] text-center font-mono text-lg ${errors.otp ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            {...register('otp')}
          />
          {errors.otp
            ? <p className="text-xs text-destructive">{errors.otp.message}</p>
            : <p className="text-xs text-muted-foreground">Check your inbox — the code expires in 15 minutes.</p>
          }
        </div>

        {/* New password */}
        <div className="space-y-2">
          <label htmlFor="newPassword" className="text-sm font-medium text-foreground">New password</label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="newPassword"
              type={showPw ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              className={`pl-10 pr-10 h-11 ${errors.newPassword ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              {...register('newPassword')}
            />
            <button
              type="button"
              onClick={() => setShowPw((v: boolean) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <PasswordStrengthMeter password={pwValue} />

          {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}

          {!errors.newPassword && (
            <p className="text-xs text-muted-foreground">
              Must contain uppercase, lowercase, and a number.
            </p>
          )}
        </div>

        {/* Confirm password */}
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
              onClick={() => setShowCf((v: boolean) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
        </div>

        <Button
          type="submit"
          className="w-full h-11 text-base font-semibold shadow-sm"
          disabled={loading}
        >
          {loading ? (
            'Updating password…'
          ) : (
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Set new password
            </span>
          )}
        </Button>

        <div className="flex flex-col items-center gap-2">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Need a new code?
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>

      </form>
    </>
  );
}
