'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Gift, Mail, MessageSquare, XCircle } from 'lucide-react';
import { registrationApi, OrganizationStatus } from '@/lib/organization-registration-api';
import { AuthBrandMark } from '@/components/auth/auth-hero-panel';
import { RegistrationProgress } from '@/components/auth/registration-progress';

const SUPPORT_EMAIL = 'support@ai-hrms.com';

const STATUS_COPY: Record<string, { title: string; desc: string; icon: React.ElementType; tone: string }> = {
  pending_review: {
    title: 'Your organization request has been submitted',
    desc: 'Your request for organization registration is under review. Our onboarding team will contact you shortly to activate your HRMS workspace.',
    icon: CheckCircle2,
    tone: 'text-emerald-600 bg-emerald-100',
  },
  under_discussion: {
    title: "We're in touch about your registration",
    desc: 'Our onboarding team is reviewing your registration and may reach out for a quick conversation before activation.',
    icon: MessageSquare,
    tone: 'text-blue-600 bg-blue-100',
  },
  needs_clarification: {
    title: 'We need a bit more information',
    desc: 'Our team has requested more details. Please check your email for next steps, or wait for us to reach out.',
    icon: MessageSquare,
    tone: 'text-amber-600 bg-amber-100',
  },
  approved: {
    title: 'Your organization is approved!',
    desc: 'Your HRMS workspace is active. You can now sign in and get started.',
    icon: CheckCircle2,
    tone: 'text-emerald-600 bg-emerald-100',
  },
  rejected: {
    title: 'Your registration was not approved',
    desc: 'Please check your email for details, or contact our support team for more information.',
    icon: XCircle,
    tone: 'text-red-600 bg-red-100',
  },
};

function referenceNumber(tenantId: string): string {
  return `ORG-${tenantId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export default function RegistrationPendingPage() {
  return (
    <Suspense fallback={null}>
      <RegistrationPendingContent />
    </Suspense>
  );
}

function RegistrationPendingContent() {
  const params = useSearchParams();
  const tenantId = params.get('tenantId');
  const [status, setStatus] = useState<OrganizationStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    const load = () => {
      registrationApi.getOrganizationStatus(tenantId)
        .then(setStatus)
        .catch(() => setError('Could not load registration status.'));
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [tenantId]);

  const copy = status ? STATUS_COPY[status.approval_status] ?? STATUS_COPY.pending_review : STATUS_COPY.pending_review;
  const Icon = copy.icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 flex justify-center">
          <AuthBrandMark variant="light" />
        </div>

        <RegistrationProgress step={3} />

        <div className="rounded-2xl border border-border bg-white p-8 shadow-sm text-center">
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${copy.tone}`}>
            <Icon className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{copy.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{copy.desc}</p>

          {status?.approval_status === 'rejected' && status.rejection_reason && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive">
              {status.rejection_reason}
            </div>
          )}

          {error && <p className="mt-4 text-xs text-destructive">{error}</p>}

          {status?.trial_ends_at && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-700">
              <Gift className="h-4 w-4" />
              Free trial active until {new Date(status.trial_ends_at).toLocaleDateString()}
            </div>
          )}

          {status && (
            <div className="mt-6 space-y-2.5 rounded-lg bg-muted/40 p-4 text-left text-sm">
              <DetailRow label="Organization Name" value={status.name} />
              <DetailRow label="Registration Reference" value={referenceNumber(status.id)} />
              <DetailRow
                label="Support Contact"
                value={SUPPORT_EMAIL}
                href={`mailto:${SUPPORT_EMAIL}`}
                icon={<Mail className="h-3.5 w-3.5" />}
              />
            </div>
          )}

          {status?.approval_status === 'approved' && (
            <Link href="/admin-login" className="mt-6 inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Sign in to Admin Portal
            </Link>
          )}

          {!status?.approval_status || ['pending_review', 'under_discussion', 'needs_clarification'].includes(status.approval_status) ? (
            <p className="mt-6 text-xs text-muted-foreground">This page updates automatically. You can safely close it and check back later.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, href, icon }: { label: string; value: string; href?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <a href={href} className="flex items-center gap-1.5 font-medium text-primary hover:underline">
          {icon}{value}
        </a>
      ) : (
        <span className="font-medium text-foreground">{value}</span>
      )}
    </div>
  );
}
