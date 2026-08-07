'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { candidatesApi } from '@/lib/candidates-api';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';

export function CandidateResumes({ candidateId }: { candidateId: string }) {
  const [resumes, setResumes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const load = () => { candidatesApi.resumes.list(candidateId).then(setResumes).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [candidateId]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      await candidatesApi.resumes.upload(candidateId, file);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  const download = async (docId: string) => {
    const { url } = await candidatesApi.resumes.download(docId);
    window.open(url, '_blank');
  };

  const remove = async (docId: string) => {
    if (!confirm('Remove this resume?')) return;
    await candidatesApi.resumes.remove(docId);
    load();
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Resumes</h3>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : resumes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No resume on file yet.</p>
      ) : (
        <div className="space-y-2">
          {resumes.map((r, idx) => (
            <div key={r.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
              <button onClick={() => download(r.id)} className="flex items-center gap-2 text-sm text-foreground hover:underline text-left">
                <FileText className="w-4 h-4 text-primary shrink-0" /> {r.name} {idx === 0 && <span className="text-xs text-emerald-600">(current)</span>}
              </button>
              <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </Can>
            </div>
          ))}
        </div>
      )}
      <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) uploadFile(e.dataTransfer.files[0]); }}
          className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center gap-1 text-sm text-muted-foreground">
              <Upload className="w-4 h-4" />
              Upload a new resume version
              <span className="text-[11px]">PDF, DOC, DOCX, JPG, PNG — max 25MB</span>
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
            </label>
          )}
        </div>
      </Can>
    </div>
  );
}
