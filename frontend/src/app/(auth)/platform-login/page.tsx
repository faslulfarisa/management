'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle, Ban, CalendarOff, Eye, EyeOff, Lock, ShieldAlert, UserX,
  UserRound, ArrowRight, Building2, TrendingUp,
} from 'lucide-react';
import api from '@/lib/api';
import { completeLogin } from '@/lib/auth/complete-login';
import { loginSchema, type LoginFormData } from '@/lib/auth/login-validation';
import { saveMfaPendingSession } from '@/lib/auth/mfa-pending-session';
import { savePasswordChangePendingSession } from '@/lib/auth/password-change-pending-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthBrandMark } from '@/components/auth/auth-hero-panel';

const REMEMBER_KEY = 'remembered_platform_login_identifier';

// Static node graph — a stand-in for the organizations this console manages.
// Coordinates are hardcoded (not randomized) so server/client markup matches.
const NODES = [
  { id: 0, x: 60, y: 70, r: 4, hub: false },
  { id: 1, x: 160, y: 40, r: 3, hub: false },
  { id: 2, x: 250, y: 90, r: 5, hub: true },
  { id: 3, x: 340, y: 60, r: 3, hub: false },
  { id: 4, x: 100, y: 160, r: 3, hub: false },
  { id: 5, x: 210, y: 190, r: 6, hub: true },
  { id: 6, x: 320, y: 170, r: 3.5, hub: false },
  { id: 7, x: 50, y: 260, r: 3, hub: false },
  { id: 8, x: 150, y: 290, r: 4, hub: false },
  { id: 9, x: 260, y: 280, r: 3, hub: false },
  { id: 10, x: 350, y: 300, r: 5, hub: true },
  { id: 11, x: 190, y: 360, r: 3, hub: false },
  { id: 12, x: 90, y: 380, r: 3.5, hub: false },
];

const LINKS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [1, 4], [2, 5], [3, 6], [4, 5], [5, 6],
  [4, 7], [5, 8], [6, 9], [7, 8], [8, 9], [9, 10], [8, 11], [11, 12],
  [7, 12], [9, 6],
];

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
    defaultValues: { identifier: '', password: '' },
  });

  useEffect(() => {
    const remembered = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_KEY) : null;
    if (remembered) {
      setValue('identifier', remembered);
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
      const loginIdentifier = data.identifier.trim();
      const res = await api.post('/auth/login', { email: loginIdentifier, password: data.password, portal: 'platform' });
      const resultData = res.data.data;

      if (rememberMe) localStorage.setItem(REMEMBER_KEY, loginIdentifier);
      else localStorage.removeItem(REMEMBER_KEY);

      // Accounts flagged must_change_password (e.g. bulk-imported) never get a
      // token on this request — stash the pending session and force a password
      // change before they can reach the portal.
      if (resultData.requiresPasswordChange) {
        savePasswordChangePendingSession(resultData.changeSessionId, loginIdentifier, resultData.expiresIn);
        router.push('/change-password');
        return;
      }

      // MFA-enabled accounts never get a token on this request — stash the
      // pending session and send the user to the verification screen instead.
      if (resultData.requiresMfa) {
        saveMfaPendingSession(resultData.loginSessionId, loginIdentifier, resultData.expiresIn);
        router.push('/mfa-verify');
        return;
      }

      await completeLogin(resultData, loginIdentifier, router);
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
    <div className="flex min-h-screen bg-background">
      {/* ================= Left: bespoke hero / signature panel ================= */}
      <div
        className="relative hidden w-[44%] flex-col justify-between overflow-hidden p-12 lg:flex xl:w-[40%]"
        style={{ background: 'linear-gradient(160deg, #0A0A1B 0%, #14132E 55%, #1D1A42 100%)' }}
      >
        {/* ambient glow blobs */}
        <div className="phl-drift-a pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full opacity-40 blur-3xl" style={{ background: '#7C6CF6' }} />
        <div className="phl-drift-b pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full opacity-30 blur-3xl" style={{ background: '#5EEAD4' }} />

        <div className="relative z-10">
          <AuthBrandMark variant="dark" title="AI-HRMS Platform" subtitle="Internal Operations Portal" />
        </div>

        <div className="relative z-10 my-10 flex-1">
          {/* node graph */}
          <svg viewBox="0 0 400 420" className="h-full w-full max-h-[360px]" fill="none" xmlns="http://www.w3.org/2000/svg">
            {LINKS.map(([a, b], i) => {
              const na = NODES[a];
              const nb = NODES[b];
              return (
                <line
                  key={i}
                  x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                  stroke="#8B84D6" strokeOpacity="0.25" strokeWidth="1"
                />
              );
            })}
            {NODES.map((n) => (
              <circle
                key={n.id}
                cx={n.x} cy={n.y} r={n.r}
                className={n.hub ? 'phl-node-pulse' : ''}
                fill={n.hub ? '#5EEAD4' : '#B4A9FB'}
                fillOpacity={n.hub ? 0.95 : 0.55}
              />
            ))}
          </svg>

          {/* floating stat chips */}
          <div className="phl-float-a absolute left-4 top-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-md">
            <Building2 className="h-4 w-4 text-[#B4A9FB]" />
            <div className="leading-tight">
              <p className="text-xs font-semibold text-white">482 organizations</p>
              <p className="text-[10px] text-white/50">active on the platform</p>
            </div>
          </div>
          <div className="phl-float-b absolute bottom-2 right-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-md">
            <TrendingUp className="h-4 w-4 text-[#5EEAD4]" />
            <div className="leading-tight">
              <p className="text-xs font-semibold text-white">+12% signups</p>
              <p className="text-[10px] text-white/50">week over week</p>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            The console behind{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, #B4A9FB, #5EEAD4)' }}
            >
              every organization
            </span>{' '}
            on AI‑HRMS.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
            Sales, finance, support, and technical operations — organization lifecycle,
            billing, and platform-wide insight in one place.
          </p>
        </div>
      </div>

      {/* ================= Right: sign-in form ================= */}
      <div className="flex w-full flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex flex-col items-center gap-4 lg:items-start">
            <div className="lg:hidden">
              <AuthBrandMark variant="light" title="AI-HRMS Platform" subtitle="Internal Operations Portal" />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="phl-node-pulse h-1.5 w-1.5 rounded-full bg-primary" />
              Staff access only
            </span>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-8 shadow-xl shadow-black/[0.04] sm:p-9">
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: 'linear-gradient(90deg, #7C6CF6, #5EEAD4)' }}
            />

            <div className="mb-7 text-left">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Platform sign in</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Sign in with your internal AI‑HRMS credentials.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                    {isLocked ? (
                      <Lock className="h-3 w-3" />
                    ) : isDeactivated ? (
                      <DeactivationIcon status={deactivatedStatus} />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                  </span>
                  <span className="pt-0.5">{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email or username
                </label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="text"
                    placeholder="you@aihrms.com"
                    className={`h-11 rounded-xl pl-10 transition-shadow focus-visible:ring-2 focus-visible:ring-primary/30 ${errors.identifier ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                    autoComplete="username"
                    {...register('identifier')}
                  />
                </div>
                {errors.identifier && <p className="text-xs text-destructive">{errors.identifier.message}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">
                    Password
                  </label>
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
                    className={`h-11 rounded-xl pl-10 pr-10 transition-shadow focus-visible:ring-2 focus-visible:ring-primary/30 ${errors.password ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                    autoComplete="current-password"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <label className="flex select-none items-center gap-2 pt-1 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Remember me on this device
              </label>

              <Button
                type="submit"
                className="group h-11 w-full rounded-xl text-base font-semibold shadow-sm shadow-primary/20 transition-transform active:scale-[0.99]"
                disabled={loading}
              >
                {loading ? (
                  'Signing in…'
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    Sign in
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>
            </form>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes phl-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.6; }
        }
        .phl-node-pulse {
          transform-origin: center;
          transform-box: fill-box;
          animation: phl-pulse 2.6s ease-in-out infinite;
        }
        @keyframes phl-float-a {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes phl-float-b {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(8px); }
        }
        .phl-float-a { animation: phl-float-a 5s ease-in-out infinite; }
        .phl-float-b { animation: phl-float-b 6s ease-in-out infinite; }
        @keyframes phl-drift-a {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 30px); }
        }
        @keyframes phl-drift-b {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-25px, -15px); }
        }
        .phl-drift-a { animation: phl-drift-a 12s ease-in-out infinite; }
        .phl-drift-b { animation: phl-drift-b 14s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .phl-node-pulse, .phl-float-a, .phl-float-b, .phl-drift-a, .phl-drift-b {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function DeactivationIcon({ status }: { status: string }) {
  const className = 'h-3 w-3';
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
