'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, UserCheck } from 'lucide-react';
import { applicationsApi, Application } from '@/lib/candidates-api';
import { preboardingApi, conversionApi, probationApi, PreboardingChecklist, ConversionPreview, ProbationReview } from '@/lib/onboarding-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { PreboardingChecklistCard } from '@/components/recruitment/preboarding-checklist';
import { EmployeeConversionDrawer } from '@/components/recruitment/employee-conversion-drawer';
import { ProbationReviewCard } from '@/components/recruitment/probation-review-card';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (<div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm text-foreground font-medium">{value ?? '—'}</p></div>);
}

export default function OnboardingDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [checklist, setChecklist] = useState<PreboardingChecklist | null>(null);
  const [preview, setPreview] = useState<ConversionPreview | null>(null);
  const [probationReview, setProbationReview] = useState<ProbationReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConvert, setShowConvert] = useState(false);

  const load = useCallback(async () => {
    const app = await applicationsApi.get(applicationId);
    const [cl, prev] = await Promise.all([
      preboardingApi.get(applicationId),
      conversionApi.preview(applicationId),
    ]);
    setApplication(app);
    setChecklist(cl);
    setPreview(prev);

    if (app.converted_employee_id) {
      const reviews = await probationApi.byEmployee(app.converted_employee_id);
      setProbationReview(reviews[0] ?? null);
    } else {
      setProbationReview(null);
    }
    setLoading(false);
  }, [applicationId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !application || !checklist || !preview) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const canConvert = application.status === 'hired' && !application.converted_employee_id;

  return (
    <div className="space-y-6">
      {showConvert && (
        <EmployeeConversionDrawer
          applicationId={applicationId}
          preview={preview}
          onClose={() => setShowConvert(false)}
          onConverted={() => load()}
        />
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/onboarding')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{application.first_name} {application.last_name}</h1>
              {application.converted_employee_id ? (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><UserCheck className="w-3 h-3" /> Converted</span>
              ) : (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Pending Conversion</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{application.candidate_email} • {application.job_title}</p>
          </div>
        </div>

        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          {canConvert && (
            <button onClick={() => setShowConvert(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
              <UserCheck className="w-3.5 h-3.5" /> Convert to Employee
            </button>
          )}
        </Can>
      </div>

      {application.converted_employee_id && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <Field label="Employee Record" value="This candidate has been converted to an employee" />
            <button onClick={() => router.push(`/dashboard/hr/employees/${application.converted_employee_id}`)} className="border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
              View Employee Profile
            </button>
          </CardContent>
        </Card>
      )}

      <PreboardingChecklistCard applicationId={applicationId} checklist={checklist} onSaved={load} />

      {application.converted_employee_id && (
        <ProbationReviewCard
          employeeId={application.converted_employee_id}
          applicationId={applicationId}
          review={probationReview}
          onSaved={load}
        />
      )}
    </div>
  );
}
