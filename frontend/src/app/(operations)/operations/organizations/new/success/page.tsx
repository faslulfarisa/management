'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Building2, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

function SuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tenantId = params.get('tenantId') ?? '';
  const name = params.get('name') ?? 'Organization';

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/operations/organizations')} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Organizations
      </Button>

      <div className="max-w-lg mx-auto space-y-6 py-8">
        {/* Success card */}
        <div className="ops-panel p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Organization Created</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              <strong className="text-slate-700">{name}</strong> has been submitted and is now in the pipeline.
            </p>
          </div>
          {tenantId && (
            <p className="text-xs text-slate-400 font-mono bg-slate-50 rounded-lg px-3 py-2 inline-block">
              Tenant ID: {tenantId}
            </p>
          )}
          <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Pending Review
          </div>
        </div>

        {/* Next steps */}
        <div className="ops-panel p-5">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-violet-600" />
            Next Steps
          </h2>
          <ul className="space-y-3">
            {[
              'A verification email has been sent to the org admin. They must verify before logging in.',
              'Review and approve the organization from the Approvals section.',
              'Once approved, the organization workspace will be activated.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                <span className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => router.push('/operations/organizations')}
            className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
          >
            View All Organizations <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/operations/organizations/new')}
            className="w-full"
          >
            Create Another Organization
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CreateOrgSuccessPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}
