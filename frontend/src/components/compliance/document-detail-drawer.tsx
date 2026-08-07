'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, Download, History, Upload, CheckCircle2, XCircle, Send, RefreshCw, Archive, Trash2 } from 'lucide-react';
import { complianceDocumentsApi, ComplianceDocument, DocumentVersion } from '@/lib/compliance-api';
import { StatusBadge, ConfidentialityBadge, ExpiryBadge } from './badges';

function PreviewPanel({ doc, signedUrl }: { doc: ComplianceDocument; signedUrl: string | null }) {
  if (!doc.file_url) return <div className="text-sm text-muted-foreground py-8 text-center">No file attached to this document.</div>;
  if (!signedUrl) return <div className="text-sm text-muted-foreground py-8 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading preview…</div>;

  const mime = doc.mime_type || '';
  if (mime === 'application/pdf') {
    return <iframe src={signedUrl} className="w-full h-[420px] rounded-xl border border-border" title={doc.title} />;
  }
  if (mime.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={signedUrl} alt={doc.title} className="max-h-[420px] mx-auto rounded-xl border border-border" />;
  }
  return (
    <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
      Preview not available for this file type.<br />
      <a href={signedUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">Download to view</a>
    </div>
  );
}

export function DocumentDetailDrawer({ documentId, onClose, onChanged }: { documentId: string; onClose: () => void; onChanged: () => void }) {
  const [doc, setDoc] = useState<ComplianceDocument | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [d, v] = await Promise.all([complianceDocumentsApi.get(documentId), complianceDocumentsApi.listVersions(documentId)]);
      setDoc(d);
      setVersions(v);
      if (d.file_url) {
        complianceDocumentsApi.download(documentId).then((res) => setSignedUrl(res.url)).catch(() => {});
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [documentId]);

  const run = async (action: () => Promise<any>) => {
    setBusy(true); setError('');
    try { await action(); await load(); onChanged(); }
    catch (err: any) { setError(err.response?.data?.message || err.response?.data?.error || 'Action failed'); }
    finally { setBusy(false); }
  };

  const submit = () => run(() => complianceDocumentsApi.submit(documentId));
  const approve = () => {
    const reason = window.prompt('Approval reason (min 5 characters):', 'Verified and approved');
    if (reason) run(() => complianceDocumentsApi.approve(documentId, reason));
  };
  const reject = () => {
    const reason = window.prompt('Rejection reason (min 5 characters):');
    if (reason) run(() => complianceDocumentsApi.reject(documentId, reason));
  };
  const archive = () => run(() => complianceDocumentsApi.archive(documentId));
  const remove = () => { if (window.confirm('Delete this document?')) run(() => complianceDocumentsApi.remove(documentId)).then(onClose); };
  const restoreVersion = (vn: number) => { if (window.confirm(`Restore version ${vn}? This creates a new version copying that file.`)) run(() => complianceDocumentsApi.restoreVersion(documentId, vn)); };

  const uploadNewVersion = () => {
    if (!newVersionFile) return;
    run(async () => {
      const meta = await complianceDocumentsApi.uploadFile(newVersionFile);
      await complianceDocumentsApi.uploadVersion(documentId, { file_url: meta.url, file_name: meta.fileName, file_size_bytes: meta.sizeBytes, mime_type: meta.mimeType, change_note: 'Manual update' });
      setNewVersionFile(null);
    });
  };

  const requestRenewal = () => {
    if (!newVersionFile) { window.alert('Attach the renewed document file first.'); return; }
    run(async () => {
      const meta = await complianceDocumentsApi.uploadFile(newVersionFile);
      await complianceDocumentsApi.requestRenewal(documentId, { file_url: meta.url, file_name: meta.fileName, file_size_bytes: meta.sizeBytes, mime_type: meta.mimeType, change_note: 'Renewal' });
      setNewVersionFile(null);
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-foreground truncate pr-4">{doc?.title || 'Document'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {loading || !doc ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={doc.status} />
              <ConfidentialityBadge level={doc.confidentiality_level} />
              <span className="text-xs text-muted-foreground">v{doc.current_version}</span>
              {doc.tags?.map((t) => <span key={t} className="text-[11px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">#{t}</span>)}
            </div>

            <PreviewPanel doc={doc} signedUrl={signedUrl} />
            {signedUrl && (
              <a href={signedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Download className="w-3.5 h-3.5" /> Download current version
              </a>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Category</p><p>{doc.category_name || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Document Type</p><p>{doc.document_type}</p></div>
              <div><p className="text-xs text-muted-foreground">Document Number</p><p>{doc.document_number || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Issuing Authority</p><p>{doc.issuing_authority || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Issue Date</p><p>{doc.issue_date ? new Date(doc.issue_date).toLocaleDateString('en-IN') : '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Expiry Date</p><ExpiryBadge expiryDate={doc.expiry_date} /></div>
            </div>
            {doc.description && <div><p className="text-xs text-muted-foreground mb-1">Description</p><p className="text-sm">{doc.description}</p></div>}
            {doc.remarks && <div><p className="text-xs text-muted-foreground mb-1">Remarks</p><p className="text-sm">{doc.remarks}</p></div>}
            {doc.rejection_reason && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">Rejected: {doc.rejection_reason}</p>}

            {/* Workflow actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {['draft', 'rejected', 'renewal_pending'].includes(doc.status) && (
                <button disabled={busy} onClick={submit} className="inline-flex items-center gap-1.5 text-sm bg-primary text-white rounded-lg px-3 py-2 hover:bg-primary/90 disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" /> Submit for Approval
                </button>
              )}
              {doc.approval_status === 'pending' && (
                <>
                  <button disabled={busy} onClick={approve} className="inline-flex items-center gap-1.5 text-sm bg-green-600 text-white rounded-lg px-3 py-2 hover:bg-green-700 disabled:opacity-50">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button disabled={busy} onClick={reject} className="inline-flex items-center gap-1.5 text-sm bg-red-600 text-white rounded-lg px-3 py-2 hover:bg-red-700 disabled:opacity-50">
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </>
              )}
              {['expired', 'renewal_pending'].includes(doc.status) && (
                <label className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted cursor-pointer">
                  <RefreshCw className="w-3.5 h-3.5" /> {newVersionFile ? newVersionFile.name : 'Request Renewal (attach file)'}
                  <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && setNewVersionFile(e.target.files[0])} />
                </label>
              )}
              {newVersionFile && ['expired', 'renewal_pending'].includes(doc.status) && (
                <button disabled={busy} onClick={requestRenewal} className="text-sm bg-orange-600 text-white rounded-lg px-3 py-2 hover:bg-orange-700 disabled:opacity-50">Submit Renewal</button>
              )}
              {!['archived', 'deleted'].includes(doc.status) && (
                <button disabled={busy} onClick={archive} className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted disabled:opacity-50">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              )}
              <button disabled={busy} onClick={remove} className="inline-flex items-center gap-1.5 text-sm border border-red-200 text-red-600 rounded-lg px-3 py-2 hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>

            {/* Versions */}
            <div className="pt-2 border-t border-border">
              <button onClick={() => setShowVersions((s) => !s)} className="text-sm font-medium flex items-center gap-1.5 text-foreground">
                <History className="w-4 h-4" /> Version History ({versions.length})
              </button>
              {showVersions && (
                <div className="mt-3 space-y-2">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs border border-border rounded-lg px-3 py-2">
                      <div>
                        <span className="font-medium">v{v.version_number}</span>{' '}
                        <span className="text-muted-foreground">{v.file_name} · {new Date(v.created_at).toLocaleString('en-IN')}</span>
                        {v.change_note && <p className="text-muted-foreground">{v.change_note}</p>}
                      </div>
                      {v.version_number !== doc.current_version && (
                        <button onClick={() => restoreVersion(v.version_number)} className="text-primary hover:underline shrink-0 ml-2">Restore</button>
                      )}
                    </div>
                  ))}
                  <label className="flex items-center gap-2 text-xs border border-dashed border-border rounded-lg px-3 py-2 cursor-pointer hover:bg-muted">
                    <Upload className="w-3.5 h-3.5" /> {newVersionFile ? newVersionFile.name : 'Upload new version'}
                    <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && setNewVersionFile(e.target.files[0])} />
                  </label>
                  {newVersionFile && !['expired', 'renewal_pending'].includes(doc.status) && (
                    <button disabled={busy} onClick={uploadNewVersion} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50">Save new version</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
