'use client';

import { CorrectionHistoryTable } from '@/components/biometrics/corrections/correction-history-table';
import { CorrectionRequestForm } from '@/components/biometrics/corrections/correction-request-form';
import { useQueryClient } from '@tanstack/react-query';

export default function CorrectionsPage() {
  const qc = useQueryClient();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Attendance Corrections</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Manager approval workflow — review, approve, or reject employee attendance corrections
        </p>
      </div>

      <div className="space-y-4">
        <CorrectionRequestForm onSubmitted={() => qc.invalidateQueries({ queryKey: ['biometrics', 'corrections'] })} />
        <CorrectionHistoryTable />
      </div>
    </div>
  );
}
