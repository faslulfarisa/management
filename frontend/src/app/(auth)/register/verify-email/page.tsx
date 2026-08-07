'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2, Mail, RefreshCw, Smartphone } from 'lucide-react';
import { registrationApi } from '@/lib/organization-registration-api';
import { useRegistrationStore } from '@/store/registration.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthBrandMark } from '@/components/auth/auth-hero-panel';
import { RegistrationProgress } from '@/components/auth/registration-progress';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, hydrate } = useRegistrationStore();
  const [hydrated, setHydrated] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const [mobileStep, setMobileStep] = useState<'idle' | 'sent' | 'done'>('idle');
  const [otp, setOtp] = useState('');
  const [mobileError, setMobileError] = useState('');

  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, [hydrate]);

  useEffect(() => {
    const registrationId = params.get('registrationId');
    const token = params.get('token');
    if (!registrationId || !token) return;

    setVerifying(true);
    registrationApi
      .verifyEmail(registrationId, token)
      .then(() => setVerified(true))
      .catch((err) => setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Verification link is invalid or expired'))
      .finally(() => setVerifying(false));
  }, [params]);

  const checkStatus = async () => {
    if (!session) return;
    try {
      const status = await registrationApi.getAccountStatus(session);
      if (status.emailVerified) setVerified(true);
      else setError("We haven't seen your verification yet. Check your inbox and click the link.");
    } catch {
      setError('Could not check verification status. Please try again.');
    }
  };

  const resend = async () => {
    if (!session) return;
    setError('');
    setResent(false);
    try {
      await registrationApi.resendVerification(session);
      setResent(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? 'Could not resend verification email');
    }
  };

  const sendMobileOtp = async () => {
    if (!session) return;
    setMobileError('');
    try {
      await registrationApi.requestMobileOtp(session);
      setMobileStep('sent');
    } catch (err: any) {
      setMobileError(err.response?.data?.error?.message ?? 'Could not send OTP');
    }
  };

  const confirmMobileOtp = async () => {
    if (!session) return;
    setMobileError('');
    try {
      await registrationApi.verifyMobile({ ...session, otp });
      setMobileStep('done');
    } catch (err: any) {
      setMobileError(err.response?.data?.error?.message ?? 'Invalid OTP');
    }
  };

  if (!hydrated) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8">
          <AuthBrandMark variant="light" />
        </div>

        <RegistrationProgress step={2} />

        <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
          {verifying ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verifying your email…</p>
            </div>
          ) : verified ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Email verified</h2>
              <p className="text-sm text-muted-foreground">
                {session
                  ? "Great — let's set up your organization next."
                  : 'Your email is verified. Return to the browser tab where you started registration to continue, or start a new registration below.'}
              </p>
              {session ? (
                <Button className="mt-2 w-full h-11" onClick={() => router.push('/register/organization')}>
                  Continue to Organization Setup
                </Button>
              ) : (
                <Link href="/register" className="mt-2 text-sm font-medium text-primary hover:underline">Start a new registration</Link>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a verification link to <strong className="text-foreground">{session?.email ?? 'your email address'}</strong>. Click it to continue, or check below once you have.
                </p>
              </div>

              {error && <p className="text-center text-xs text-destructive">{error}</p>}
              {resent && <p className="text-center text-xs text-emerald-600">Verification email resent.</p>}

              {session && (
                <div className="space-y-3">
                  <Button className="w-full h-11" onClick={checkStatus}>I've verified — Continue</Button>
                  <Button variant="outline" className="w-full h-11" onClick={resend}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Resend verification email
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {session?.mobile && verified && (
          <div className="mt-6 rounded-2xl border border-border bg-white p-6">
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Verify mobile number <span className="text-muted-foreground font-normal">(optional)</span></h3>
            </div>
            {mobileStep === 'done' ? (
              <p className="text-sm text-emerald-600">Mobile number verified.</p>
            ) : mobileStep === 'sent' ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to {session.mobile}.</p>
                <Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" maxLength={6} />
                {mobileError && <p className="text-xs text-destructive">{mobileError}</p>}
                <Button size="sm" onClick={confirmMobileOtp}>Verify</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">You can verify your mobile number now or skip this for later.</p>
                {mobileError && <p className="text-xs text-destructive">{mobileError}</p>}
                <Button size="sm" variant="outline" onClick={sendMobileOtp}>Send code</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
