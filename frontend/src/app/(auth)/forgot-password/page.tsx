'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Mail, Send, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeroPanel, AuthBrandMark, HeroStep } from '@/components/auth/auth-hero-panel';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', data);
      setSentEmail(data.email);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email: sentEmail });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to resend. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <AuthHeroPanel
        headline={
          <>
            Locked out?{' '}
            <span className="text-cyan-400">We&apos;ve got you.</span>
          </>
        }
        description="Enter your work email and we'll send a one-time code to get you back into your workspace in seconds."
      >
        <div className="space-y-4">
          <HeroStep number="1" title="Enter your email" desc="The address you use to sign in to Ai-HRMS." />
          <HeroStep number="2" title="Check your inbox" desc="A reset code will arrive within a minute." />
          <HeroStep number="3" title="Set a new password" desc="Pick something strong and get back to work." />
        </div>
      </AuthHeroPanel>

      {/* Right: form panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">
          {/* mobile brand */}
          <div className="lg:hidden mb-8">
            <AuthBrandMark variant="light" />
          </div>

          {sent ? (
            <SuccessState
              email={sentEmail}
              loading={loading}
              error={error}
              onResend={handleResend}
            />
          ) : (
            <RequestForm
              register={register}
              handleSubmit={handleSubmit}
              onSubmit={onSubmit}
              errors={errors}
              error={error}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RequestForm({ register, handleSubmit, onSubmit, errors, error, loading }: any) {
  return (
    <>
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted">
          <KeyRound className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Forgot password?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No worries — enter your email and we'll send you a reset code.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">Email address</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              className={`pl-10 h-11 ${errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              autoComplete="email"
              autoFocus
              {...register('email')}
            />
          </div>
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full h-11 text-base font-semibold shadow-sm" disabled={loading}>
          {loading ? (
            'Sending…'
          ) : (
            <span className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send reset code
            </span>
          )}
        </Button>

        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </form>
    </>
  );
}

function SuccessState({ email, loading, error, onResend }: {
  email: string;
  loading: boolean;
  error: string;
  onResend: () => void;
}) {
  return (
    <>
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Check your inbox</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a password reset code to{' '}
          <span className="font-medium text-foreground">{email}</span>.
          It expires in 15 minutes.
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
          <Button className="w-full h-11 text-base font-semibold shadow-sm">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Enter code & set new password
          </Button>
        </Link>

        <Button
          variant="outline"
          className="w-full h-11"
          disabled={loading}
          onClick={onResend}
        >
          {loading ? 'Resending…' : "Didn't receive it? Resend"}
        </Button>

        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 pt-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    </>
  );
}

