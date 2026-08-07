'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Printer } from 'lucide-react';
import api from '@/lib/api';
import type { EnrichedPayslipDetail } from '@/types/employee';
import { PayslipTemplate } from './payslip-template';
import { generatePayslipPdf } from '@/lib/generate-payslip-pdf';

interface AdminPayslipModalProps {
  payslipId: string | null;
  onClose: () => void;
}

export function AdminPayslipModal({ payslipId, onClose }: AdminPayslipModalProps) {
  const [detail, setDetail] = useState<EnrichedPayslipDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!payslipId) { setDetail(null); return; }
    setLoading(true);
    api.get(`/payslips/${payslipId}`)
      .then(r => setDetail(r.data.data ?? r.data))
      .catch(() => {})
      .finally(() => setLoading(false));

    api.post(`/payslips/${payslipId}/log-access`, { action: 'view' }).catch(() => {});
  }, [payslipId]);

  const handleDownload = async () => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await generatePayslipPdf(detail, {
        download: true,
        filename: detail.period?.payslip_number ?? undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      const blob = await generatePayslipPdf(detail, { download: false });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  };

  const title = detail
    ? `${detail.period?.period_label ?? ''} · ${detail.employee?.first_name ?? ''} ${detail.employee?.last_name ?? ''}`
    : 'Payslip';

  return (
    <Dialog open={!!payslipId} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl flex flex-col p-0 max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {loading || !detail ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <PayslipTemplate data={detail} />
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={!detail || busy}
            className="gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Print
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!detail || busy}
            className="gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
