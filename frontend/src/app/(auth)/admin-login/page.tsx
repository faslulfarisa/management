'use client';

import { useEffect, useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle, ArrowRight, Ban, Building2, CalendarOff, CheckCircle2, Clock3, Eye, EyeOff,
  Fingerprint, Lock, MessageSquare, RefreshCw, ShieldAlert, ShieldCheck, UserRound, UserX,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { completeLogin } from '@/lib/auth/complete-login';
import { adminLoginSchema, type AdminLoginFormData } from '@/lib/auth/login-validation';
import { saveMfaPendingSession } from '@/lib/auth/mfa-pending-session';
import { savePasswordChangePendingSession } from '@/lib/auth/password-change-pending-session';
import { registrationApi, type OrganizationStatus } from '@/lib/organization-registration-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthBrandMark } from '@/components/auth/auth-hero-panel';

const REMEMBER_IDENTIFIER_KEY = 'remembered_admin_login_identifier';
const REMEMBER_COMPANY_KEY = 'remembered_admin_company_code';

type PendingOrganization = {
  id: string;
  name: string;
  approvalStatus: string;
  rejectionReason: string | null;
};

const APPROVAL_STATUS_COPY: Record<string, { title: string; desc: string; tone: string; icon: ElementType }> = {
  pending_review: {
    title: 'Organization review is pending',
    desc: 'Your organization registration is under review. Admin portal access will be enabled after approval.',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: Clock3,
  },
  pending_approval: {
    title: 'Organization approval is pending',
    desc: 'Your organization is waiting for final approval. Admin portal access will be enabled after approval.',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: Clock3,
  },
  onboarding: {
    title: 'Organization onboarding is in progress',
    desc: 'Your workspace is being prepared. Admin portal access will open when onboarding is complete.',
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    icon: Clock3,
  },
  under_discussion: {
    title: 'Organization review is in progress',
    desc: 'Our onboarding team is discussing your registration details. Access will open after approval.',
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: MessageSquare,
  },
  needs_clarification: {
    title: 'Organization needs clarification',
    desc: 'More information is needed before this organization can be approved. Please check your registered email.',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: MessageSquare,
  },
  approved: {
    title: 'Organization approved',
    desc: 'Your organization is approved. Sign in again to enter the Admin Portal.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  rejected: {
    title: 'Organization was not approved',
    desc: 'This organization registration was rejected. Please review the reason below or contact support.',
    tone: 'border-red-200 bg-red-50 text-red-800',
    icon: XCircle,
  },
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [deactivatedStatus, setDeactivatedStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [pendingOrganization, setPendingOrganization] = useState<PendingOrganization | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AdminLoginFormData>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { companyCode: '', identifier: '', password: '' },
  });

  useEffect(() => {
    const rememberedIdentifier = localStorage.getItem(REMEMBER_IDENTIFIER_KEY);
    const rememberedCompany = localStorage.getItem(REMEMBER_COMPANY_KEY);
    if (rememberedIdentifier || rememberedCompany) {
      if (rememberedIdentifier) setValue('identifier', rememberedIdentifier);
      if (rememberedCompany) setValue('companyCode', rememberedCompany);
      setRememberMe(true);
    }
  }, [setValue]);

  useEffect(() => {
    if (!pendingOrganization?.id) return;

    let cancelled = false;
    const loadStatus = async () => {
      try {
        const status = await registrationApi.getOrganizationStatus(pendingOrganization.id);
        if (!cancelled) setPendingOrganization(toPendingOrganization(status));
      } catch {
        // Keep the last known status visible; the next poll can recover.
      }
    };

    const interval = setInterval(loadStatus, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingOrganization?.id]);

  const onSubmit = async (data: AdminLoginFormData) => {
    setLoading(true);
    setError('');
    setIsLocked(false);
    setIsDeactivated(false);
    setDeactivatedStatus('');
    setPendingOrganization(null);

    const loginIdentifier = data.identifier.trim();
    const companyCode = data.companyCode.trim();

    try {
      const res = await api.post('/auth/admin-login', {
        companyCode,
        email: loginIdentifier,
        password: data.password,
      });
      const resultData = res.data.data;

      if (rememberMe) {
        localStorage.setItem(REMEMBER_IDENTIFIER_KEY, loginIdentifier);
        localStorage.setItem(REMEMBER_COMPANY_KEY, companyCode);
      } else {
        localStorage.removeItem(REMEMBER_IDENTIFIER_KEY);
        localStorage.removeItem(REMEMBER_COMPANY_KEY);
      }

      if (resultData.requiresPasswordChange) {
        savePasswordChangePendingSession(resultData.changeSessionId, loginIdentifier, resultData.expiresIn);
        router.push('/change-password');
        return;
      }

      if (resultData.requiresMfa) {
        saveMfaPendingSession(resultData.loginSessionId, loginIdentifier, resultData.expiresIn);
        router.push('/mfa-verify');
        return;
      }

      if (!resultData.accessToken && resultData.pendingOrganization) {
        setPendingOrganization(resultData.pendingOrganization);
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

  const refreshOrganizationStatus = async () => {
    if (!pendingOrganization?.id) return;
    setStatusLoading(true);
    try {
      const status = await registrationApi.getOrganizationStatus(pendingOrganization.id);
      setPendingOrganization(toPendingOrganization(status));
    } catch {
      setError('Could not refresh organization status. Please try again.');
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <div className="hidden w-[46%] flex-col justify-between bg-[#0F172A] px-12 py-10 text-white lg:flex">
        <AuthBrandMark variant="dark" title="AI-HRMS Admin" subtitle="Customer Admin Portal" />

        <div className="max-w-md">
          <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Fingerprint className="h-8 w-8 text-emerald-300" />
          </div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Organization control starts with verified company access.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Use your company code and organization admin credentials to enter the customer administration workspace.
          </p>
        </div>

        <div className="grid gap-3">
          <AdminSignal icon={<Building2 className="h-4 w-4" />} title="Company code required" />
          <AdminSignal icon={<ShieldCheck className="h-4 w-4" />} title="Organization admins only" />
          <AdminSignal icon={<Lock className="h-4 w-4" />} title="MFA and session security preserved" />
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 lg:hidden">
            <AuthBrandMark variant="light" title="AI-HRMS Admin" subtitle="Customer Admin Portal" />
          </div>

          <div className="mb-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin portal
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Customer admin sign in</h2>
            <p className="mt-2 text-sm text-slate-600">Enter your organization identifier and admin credentials.</p>
          </div>

          <div className="mb-5 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100">
                <Building2 className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Company branding</p>
                <p className="text-xs text-slate-500">Logo and organization theme can appear here.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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

            {pendingOrganization && (
              <OrganizationStatusNotice
                organization={pendingOrganization}
                loading={statusLoading}
                onRefresh={refreshOrganizationStatus}
              />
            )}

            <div className="space-y-1.5">
              <label htmlFor="companyCode" className="text-sm font-medium text-slate-900">Company code</label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="companyCode"
                  type="text"
                  placeholder="ABC001"
                  autoComplete="organization"
                  className={`h-11 pl-10 uppercase ${errors.companyCode ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  {...register('companyCode')}
                />
              </div>
              {errors.companyCode && <p className="text-xs text-destructive">{errors.companyCode.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="identifier" className="text-sm font-medium text-slate-900">Email or username</label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="identifier"
                  type="text"
                  placeholder="admin@company.com"
                  autoComplete="username"
                  className={`h-11 pl-10 ${errors.identifier ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  {...register('identifier')}
                />
              </div>
              {errors.identifier && <p className="text-xs text-destructive">{errors.identifier.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-slate-900">Password</label>
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  className={`h-11 pl-10 pr-10 ${errors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-900"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <label className="flex select-none items-center gap-2 pt-1 text-sm text-slate-900">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-emerald-600"
              />
              Remember me
            </label>

            <Button type="submit" className="h-11 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Signing in...' : (
                <span className="inline-flex items-center gap-2">
                  Sign in to Admin Portal
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>

            <p className="pt-2 text-center text-xs text-slate-500">
              Not an organization admin? <Link href="/login" className="font-medium text-primary hover:underline">Use standard login</Link>.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function toPendingOrganization(status: OrganizationStatus): PendingOrganization {
  return {
    id: status.id,
    name: status.name,
    approvalStatus: status.approval_status,
    rejectionReason: status.rejection_reason,
  };
}

function OrganizationStatusNotice({
  organization,
  loading,
  onRefresh,
}: {
  organization: PendingOrganization;
  loading: boolean;
  onRefresh: () => void;
}) {
  const copy = APPROVAL_STATUS_COPY[organization.approvalStatus] ?? APPROVAL_STATUS_COPY.pending_review;
  const Icon = copy.icon;

  return (
    <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${copy.tone}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{copy.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-90">{copy.desc}</p>
          <div className="mt-3 rounded-md bg-white/60 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="opacity-80">Organization</span>
              <span className="truncate font-medium">{organization.name}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="opacity-80">Status</span>
              <span className="font-medium">{formatApprovalStatus(organization.approvalStatus)}</span>
            </div>
          </div>
          {organization.approvalStatus === 'rejected' && organization.rejectionReason && (
            <p className="mt-3 rounded-md bg-white/60 px-3 py-2 text-xs">{organization.rejectionReason}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-md p-1.5 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Refresh organization status"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}

function formatApprovalStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function AdminSignal({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-200">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-400/15 text-emerald-200">{icon}</span>
      <span>{title}</span>
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
