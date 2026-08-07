'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Download, FileSpreadsheet, FileText as FileTextIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { complianceReportsApi } from '@/lib/compliance-api';
import { exportReportCsv, exportReportXlsx } from '@/lib/report-export';

interface ReportCfg {
  label: string;
  fetch: () => Promise<any[]>;
  columns: { header: string; key: string }[];
}

const REPORTS: Record<string, ReportCfg> = {
  inventory: {
    label: 'Document Inventory',
    fetch: complianceReportsApi.documentInventory,
    columns: [
      { header: 'Title', key: 'title' }, { header: 'Scope', key: 'scope' }, { header: 'Category', key: 'category' },
      { header: 'Employee', key: 'employee' }, { header: 'Status', key: 'status' },
      { header: 'Issue Date', key: 'issue_date' }, { header: 'Expiry Date', key: 'expiry_date' }, { header: 'Version', key: 'current_version' },
    ],
  },
  expired: {
    label: 'Expired Documents',
    fetch: complianceReportsApi.expiredDocuments,
    columns: [
      { header: 'Title', key: 'title' }, { header: 'Scope', key: 'scope' }, { header: 'Employee', key: 'employee' },
      { header: 'Expiry Date', key: 'expiry_date' }, { header: 'Owner', key: 'owner_email' },
    ],
  },
  renewals: {
    label: 'Upcoming Renewals',
    fetch: complianceReportsApi.upcomingRenewals,
    columns: [
      { header: 'Title', key: 'title' }, { header: 'Status', key: 'status' },
      { header: 'Expiry Date', key: 'expiry_date' }, { header: 'Days Remaining', key: 'days_remaining' },
    ],
  },
  missing: {
    label: 'Employee Missing Documents',
    fetch: complianceReportsApi.employeeMissingDocuments,
    columns: [
      { header: 'Employee Code', key: 'employee_code' }, { header: 'Employee', key: 'employee' }, { header: 'Missing Category', key: 'missing_category' },
    ],
  },
  licenses: {
    label: 'Company License Report',
    fetch: complianceReportsApi.companyLicenseReport,
    columns: [
      { header: 'Title', key: 'title' }, { header: 'Category', key: 'category' }, { header: 'License No.', key: 'document_number' },
      { header: 'Issuing Authority', key: 'issuing_authority' }, { header: 'Status', key: 'status' }, { header: 'Expiry Date', key: 'expiry_date' },
    ],
  },
  policy: {
    label: 'Policy Acknowledgement Report',
    fetch: complianceReportsApi.policyAcknowledgementReport,
    columns: [
      { header: 'Policy', key: 'policy' }, { header: 'Version', key: 'current_version' },
      { header: 'Total Employees', key: 'total_employees' }, { header: 'Acknowledged', key: 'acknowledged' }, { header: 'Pending', key: 'pending' },
    ],
  },
  audit: {
    label: 'Audit Report',
    fetch: () => complianceReportsApi.auditReport(),
    columns: [
      { header: 'Action', key: 'action' }, { header: 'Entity Type', key: 'entity_type' },
      { header: 'Actor', key: 'actor_email' }, { header: 'IP', key: 'ip_address' }, { header: 'Timestamp', key: 'created_at' },
    ],
  },
};

export default function ComplianceReportsPage() {
  const [tab, setTab] = useState('inventory');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await REPORTS[tab].fetch();
      setRows(Array.isArray(data) ? data.map((row) => ({
        ...row,
        employee: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
      })) : []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const cfg = REPORTS[tab];
  const buildExportData = () => ({
    columns: cfg.columns.map((c) => c.header),
    rows: rows.map((r) => cfg.columns.map((c) => String(r[c.key] ?? ''))),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Compliance Reports</h1>
          <p className="text-muted-foreground">Document inventory, expiry, renewal, license, and policy acknowledgement reports</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportReportCsv(buildExportData(), `compliance_${tab}`)} className="inline-flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm hover:bg-muted">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => exportReportXlsx(buildExportData(), `compliance_${tab}`, cfg.label)} className="inline-flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm hover:bg-muted">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit flex-wrap">
        {Object.entries(REPORTS).map(([key, r]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${tab === key ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {r.label}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <CardContent className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
            <FileTextIcon className="w-6 h-6" /> No data for this report.
          </CardContent>
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>{cfg.columns.map((c) => <TableHead key={c.key} className="text-left p-3 font-medium normal-case">{c.header}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {cfg.columns.map((c) => <TableCell key={c.key} className="p-3">{String(r[c.key] ?? '—')}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
