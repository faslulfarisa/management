'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, Building2, User, ClipboardCheck } from 'lucide-react';
import { registrationApi } from '@/lib/organization-registration-api';
import { useRegistrationStore } from '@/store/registration.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeroPanel, AuthBrandMark, HeroFeature } from '@/components/auth/auth-hero-panel';
import { RegistrationProgress } from '@/components/auth/registration-progress';
import { PasswordStrengthMeter } from '@/components/auth/password-strength-meter';

const schema = z
  .object({
    fullName: z.string().min(1, 'Full name is required'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    mobile: z.string().optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Must include an uppercase letter, lowercase letter, and a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useRegistrationStore((s) => s.setSession);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', mobile: '', password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password', '');

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      const { registrationId, accessToken } = await registrationApi.createAccount(data);
      setSession({ registrationId, accessToken, email: data.email, fullName: data.fullName, mobile: data.mobile });
      router.push('/register/verify-email');
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <AuthHeroPanel
        headline={
          <>
            Bring your organization{' '}
            <span className="text-cyan-400">on board.</span>
          </>
        }
        description="Create your account, tell us about your organization, and our onboarding team will review and activate your HRMS workspace."
      >
        <div className="space-y-4">
          <HeroFeature icon={<User className="h-5 w-5" />} title="Step 1 of 4" desc="Create your personal account." />
          <HeroFeature icon={<Building2 className="h-5 w-5" />} title="Step 2 of 4" desc="Tell us about your organization." />
          <HeroFeature icon={<ClipboardCheck className="h-5 w-5" />} title="Step 3 of 4" desc="Share your business requirements." />
          <HeroFeature icon={<ShieldCheck className="h-5 w-5" />} title="Step 4 of 4" desc="Review, submit, and we'll take it from there." />
        </div>
      </AuthHeroPanel>

      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden mb-8">
            <AuthBrandMark variant="light" />
          </div>

          <RegistrationProgress step={1} />

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Create your account</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Already registered?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
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
              <label htmlFor="fullName" className="text-sm font-medium text-foreground">Full Name</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="fullName" placeholder="Jane Doe" className="pl-10 h-11" autoComplete="name" {...register('fullName')} />
              </div>
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" placeholder="you@company.com" className="pl-10 h-11" autoComplete="email" {...register('email')} />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="mobile" className="text-sm font-medium text-foreground">Mobile Number <span className="text-muted-foreground font-normal">(optional)</span></label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="mobile" placeholder="+1 555 000 0000" className="pl-10 h-11" autoComplete="tel" {...register('mobile')} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10 h-11"
                  autoComplete="new-password"
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
              <PasswordStrengthMeter password={passwordValue} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirm Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 h-11"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                />
              </div>
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <Button type="submit" className="w-full h-11 text-base font-semibold shadow-sm" disabled={loading}>
              {loading ? 'Creating account…' : 'Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
