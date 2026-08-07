'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Loader2, Mail, Phone, UserCheck } from 'lucide-react';
import { applicationsApi, Application, Candidate, candidatesApi } from '@/lib/candidates-api';
import { conversionApi, ConversionPreview } from '@/lib/onboarding-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || '-'}</p>
    </div>
  );
}

export default function OnboardingDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [preview, setPreview] = useState<ConversionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const app = await applicationsApi.get(applicationId);
      const [cand, prev] = await Promise.all([
        candidatesApi.get(app.candidate_id),
        conversionApi.preview(applicationId),
      ]);
      setApplication(app);
      setCandidate(cand);
      setPreview(prev);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load onboarding details');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !application || !candidate || !preview) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {error || 'Onboarding details are unavailable.'}
        </CardContent>
      </Card>
    );
  }

  const openEmployeeForm = () => {
    router.push(`/dashboard/hr/employees/new?source=recruitment&applicationId=${encodeURIComponent(applicationId)}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/onboarding')} className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{candidate.first_name} {candidate.last_name}</h1>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {candidate.email}</span>
              {candidate.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {candidate.phone}</span>}
              <span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> {application.job_title || 'No role linked'}</span>
            </div>
          </div>
        </div>

        <Can permission={PERMISSIONS.EMPLOYEES_CREATE}>
          {application.converted_employee_id ? (
            <button onClick={() => router.push(`/dashboard/hr/employees/${application.converted_employee_id}`)} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
              View Employee
            </button>
          ) : (
            <button onClick={openEmployeeForm} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              <UserCheck className="h-3.5 w-3.5" /> Convert as Employee
            </button>
          )}
        </Can>
      </div>

      <Card>
        <CardContent className="grid gap-5 p-5 md:grid-cols-3">
          <Field label="Application Status" value={application.status.replace(/_/g, ' ')} />
          <Field label="Pipeline Stage" value={application.stage_name || 'Not staged'} />
          <Field label="Hired / Applied Date" value={formatDate(application.applied_at)} />
          <Field label="Date of Birth" value={formatDate(candidate.date_of_birth)} />
          <Field label="Gender" value={candidate.gender} />
          <Field label="Experience" value={candidate.experience_years != null ? `${candidate.experience_years} year(s)` : null} />
          <Field label="Current Company" value={candidate.current_company} />
          <Field label="Current Designation" value={candidate.current_designation || preview.prefill.designation} />
          <Field label="Source" value={candidate.source || application.source} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-base font-bold text-foreground">Employee Form Prefill</h2>
            <p className="mt-1 text-sm text-muted-foreground">These common fields will be carried into the employee creation form. Missing compliance fields can be completed there.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Branch" value={preview.prefill.branch_name} />
            <Field label="Department" value={preview.prefill.department_name} />
            <Field label="Position" value={preview.prefill.position_name} />
            <Field label="Employment Type" value={preview.prefill.employment_type_name} />
            <Field label="Reporting Manager" value={preview.prefill.reporting_manager_id ? 'Selected from vacancy' : null} />
            <Field label="Joining Date" value={formatDate(preview.prefill.date_of_joining)} />
            <Field label="Bank Name" value={preview.prefill.bank_name} />
            <Field label="Bank Account" value={preview.prefill.bank_account_number} />
            <Field label="IFSC" value={preview.prefill.ifsc_code} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
