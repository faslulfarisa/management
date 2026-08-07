'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { isAtLeast } from '@/lib/hierarchy';
import {
  complianceDocumentRequestsApi, complianceCategoriesApi, complianceDocumentsApi, ComplianceCategory,
} from '@/lib/compliance-api';
import { DocumentExplorer } from '@/components/compliance/document-explorer';
import { StatusBadge } from '@/components/compliance/badges';

interface EmployeeOption { id: string; first_name: string; last_name: string; employee_code: string; }

function NewRequestDrawer({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const [categories, setCategories] = useState<ComplianceCategory[]>([]);
  const [form, setForm] = useState({ category_id: '', title: '', instructions: '', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { complianceCategoriesApi.list('employee').then(setCategories).catch(() => {}); }, []);

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    try {
      await complianceDocumentRequestsApi.create({ employee_id: employeeId, category_id: form.category_id || undefined, title: form.title, instructions: form.instructions || undefined, due_date: form.due_date || undefined });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create request');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold">Request Document</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
            <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="">Custom / not category-specific</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Upload PAN Card" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Instructions</label>
            <textarea value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} rows={2} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Due Date</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>
        </div>
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FulfilRequestRow({ request, employeeId, onChanged }: { request: any; employeeId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const fulfil = async (file: File) => {
    setBusy(true);
    try {
      const meta = await complianceDocumentsApi.uploadFile(file);
      const doc = await complianceDocumentsApi.create({
        scope: 'employee', employee_id: employeeId, category_id: request.category_id || undefined,
        document_type: request.category_name || request.title, title: request.title,
        file_url: meta.url, file_name: meta.fileName, file_size_bytes: meta.sizeBytes, mime_type: meta.mimeType,
      } as any);
      await complianceDocumentRequestsApi.fulfil(request.id, doc.id);
      onChanged();
    } catch {
      alert('Failed to upload document');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center justify-between border border-border rounded-xl px-4 py-3 text-sm">
      <div>
        <p className="font-medium">{request.title}</p>
        {request.instructions && <p className="text-xs text-muted-foreground">{request.instructions}</p>}
        {request.remarks && <p className="text-xs text-amber-600">{request.remarks}</p>}
        {request.due_date && <p className="text-xs text-muted-foreground">Due {new Date(request.due_date).toLocaleDateString('en-IN')}</p>}
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={request.status} />
        {(request.status === 'pending') && (
          <label className="inline-flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-muted cursor-pointer">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
            <input type="file" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && fulfil(e.target.files[0])} />
          </label>
        )}
      </div>
    </div>
  );
}

export default function EmployeeDocumentsPage() {
  const { userType, employeeProfile } = useAuthStore();
  const isSelfService = !isAtLeast(userType, 'admin');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [tab, setTab] = useState<'vault' | 'requests'>('vault');
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);

  useEffect(() => {
    if (isSelfService) {
      if (employeeProfile?.id) setSelectedEmployeeId(employeeProfile.id);
    } else {
      api.get('/employees?limit=500').then((r) => setEmployees(r.data.data || [])).catch(() => {});
    }
  }, [isSelfService, employeeProfile]);

  const employeeId = isSelfService ? employeeProfile?.id : selectedEmployeeId;

  const fetchRequests = useCallback(async () => {
    if (!employeeId && !isSelfService) { setRequests([]); return; }
    setLoadingRequests(true);
    try {
      setRequests(await complianceDocumentRequestsApi.list({ employeeId: employeeId || undefined }));
    } catch { setRequests([]); } finally { setLoadingRequests(false); }
  }, [employeeId, isSelfService]);

  useEffect(() => { if (tab === 'requests') fetchRequests(); }, [tab, fetchRequests]);

  const decide = async (id: string, approve: boolean) => {
    const remarks = approve ? undefined : window.prompt('Reason for requesting resubmission:') || undefined;
    try {
      if (approve) await complianceDocumentRequestsApi.approve(id);
      else await complianceDocumentRequestsApi.requestResubmission(id, remarks);
      fetchRequests();
    } catch { alert('Action failed'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Employee Documents</h1>
        <p className="text-muted-foreground">Secure per-employee document vault and document requests</p>
      </div>

      {!isSelfService && (
        <Card><CardContent className="p-4 flex items-center gap-3">
          <label className="text-sm font-medium shrink-0">Employee</label>
          <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm flex-1 max-w-sm">
            <option value="">Select an employee…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</option>)}
          </select>
        </CardContent></Card>
      )}

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {(['vault', 'requests'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'vault' ? 'Vault' : 'Requests'}
          </button>
        ))}
      </div>

      {tab === 'vault' && (
        employeeId ? (
          <DocumentExplorer scope="employee" employeeId={employeeId} title="" />
        ) : (
          <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">Select an employee to view their document vault.</CardContent></Card>
        )
      )}

      {tab === 'requests' && (
        <div className="space-y-3">
          {!isSelfService && (
            <div className="flex justify-end">
              <Button onClick={() => setShowNewRequest(true)} disabled={!selectedEmployeeId} className="gap-1.5"><Plus className="w-4 h-4" /> Request Document</Button>
            </div>
          )}
          {showNewRequest && selectedEmployeeId && (
            <NewRequestDrawer employeeId={selectedEmployeeId} onClose={() => setShowNewRequest(false)} onSaved={fetchRequests} />
          )}
          {loadingRequests ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
          ) : requests.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No document requests.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => isSelfService ? (
                <FulfilRequestRow key={r.id} request={r} employeeId={employeeId!} onChanged={fetchRequests} />
              ) : (
                <div key={r.id} className="flex items-center justify-between border border-border rounded-xl px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{r.title} <span className="text-muted-foreground">— {r.first_name} {r.last_name}</span></p>
                    {r.remarks && <p className="text-xs text-amber-600">{r.remarks}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    {r.status === 'uploaded' && (
                      <div className="flex gap-2">
                        <button onClick={() => decide(r.id, true)} className="text-xs text-green-700 hover:underline">Approve</button>
                        <button onClick={() => decide(r.id, false)} className="text-xs text-red-600 hover:underline">Resubmit</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
