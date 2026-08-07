'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle, Ban, CalendarOff, Eye, EyeOff, Lock, Mail, ShieldAlert, ShieldCheck,
  BarChart3, Building2, UserX,
} from 'lucide-react';
import api from '@/lib/api';
import { completeLogin } from '@/lib/auth/complete-login';
import { saveMfaPendingSession } from '@/lib/auth/mfa-pending-session';
import { savePasswordChangePendingSession } from '@/lib/auth/password-change-pending-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeroPanel, AuthBrandMark, HeroFeature } from '@/components/auth/auth-hero-panel';

const REMEMBER_KEY = 'remembered_platform_login_email';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function PlatformLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [deactivatedStatus, setDeactivatedStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    const remembered = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_KEY) : null;
    if (remembered) {
      setValue('email', remembered);
      setRememberMe(true);
    }
  }, [setValue]);

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    setError('');
    setIsLocked(false);
    setIsDeactivated(false);
    setDeactivatedStatus('');
    try {
      const res = await api.post('/auth/login', { email: data.email, password: data.password, portal: 'platform' });
      const resultData = res.data.data;

      if (rememberMe) localStorage.setItem(REMEMBER_KEY, data.email);
      else localStorage.removeItem(REMEMBER_KEY);

      // Accounts flagged must_change_password (e.g. bulk-imported) never get a
      // token on this request — stash the pending session and force a password
      // change before they can reach the portal.
      if (resultData.requiresPasswordChange) {
        savePasswordChangePendingSession(resultData.changeSessionId, data.email, resultData.expiresIn);
        router.push('/change-password');
        return;
      }

      // MFA-enabled accounts never get a token on this request — stash the
      // pending session and send the user to the verification screen instead.
      if (resultData.requiresMfa) {
        saveMfaPendingSession(resultData.loginSessionId, data.email, resultData.expiresIn);
        router.push('/mfa-verify');
        return;
      }

      await completeLogin(resultData, data.email, router);
    } catch (err: any) {
      setIsLocked(err.response?.status === 423);
      setIsDeactivated(err.response?.data?.error === 'AccountDeactivated');
      setDeactivatedStatus(err.response?.data?.status ?? '');
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <AuthHeroPanel
        headline={
          <>
            Run the business{' '}
            <span className="text-violet-400">behind the platform.</span>
          </>
        }
        description="Sales, marketing, finance, support, and technical operations for AI-HRMS — organization lifecycle, billing, and platform-wide insight in one console."
      >
        <div className="space-y-4">
          <HeroFeature icon={<Building2 className="h-5 w-5" />} title="Organization lifecycle" desc="Review, approve, suspend, and manage every customer organization." />
          <HeroFeature icon={<BarChart3 className="h-5 w-5" />} title="Platform analytics" desc="Signup trends, plan distribution, and activity across all customers." />
          <HeroFeature icon={<ShieldCheck className="h-5 w-5" />} title="Internal staff only" desc="Restricted to AI-HRMS employees — never customer HR data." />
        </div>
      </AuthHeroPanel>

      {/* Right: form panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">
          {/* mobile brand */}
          <div className="lg:hidden mb-8">
            <AuthBrandMark variant="light" />
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Platform sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              For AI-HRMS internal staff only.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {isLocked ? (
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                ) : isDeactivated ? (
                  <DeactivationIcon status={deactivatedStatus} />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@aihrms.com"
                  className={`pl-10 h-11 ${errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  autoComplete="email"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={`pl-10 pr-10 h-11 ${errors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  autoComplete="current-password"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Remember me
            </label>

            <Button type="submit" className="w-full h-11 text-base font-semibold shadow-sm" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Not platform staff?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">Go to customer sign in</Link>
            </p>
          </form>


        </div>
      </div>
    </div>
  );
}

function DeactivationIcon({ status }: { status: string }) {
  const className = 'mt-0.5 h-4 w-4 shrink-0';
  switch (status) {
    case 'suspended':
      return <ShieldAlert className={className} />;
    case 'on_leave':
      return <CalendarOff className={className} />;
    case 'resigned':
    case 'retired':
    case 'terminated':
      return <UserX className={className} />;
    default:
      return <Ban className={className} />;
  }
}
