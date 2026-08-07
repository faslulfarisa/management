'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { vacanciesApi, VacancyAttachment } from '@/lib/vacancies-api';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';

export function VacancyAttachments({ vacancyId }: { vacancyId: string }) {
  const [attachments, setAttachments] = useState<VacancyAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    vacanciesApi.attachments.list(vacancyId).then(setAttachments).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [vacancyId]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const meta = await vacanciesApi.attachments.upload(file);
      await vacanciesApi.attachments.attach(vacancyId, {
        name: meta.fileName, file_url: meta.url, file_size_bytes: meta.sizeBytes, mime_type: meta.mimeType,
      });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to upload attachment');
    } finally {
      setUploading(false);
    }
  };

  const download = async (docId: string) => {
    const { url } = await vacanciesApi.attachments.download(docId);
    window.open(url, '_blank');
  };

  const remove = async (docId: string) => {
    if (!confirm('Remove this attachment?')) return;
    await vacanciesApi.attachments.remove(docId);
    load();
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No attachments yet.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
              <button onClick={() => download(a.id)} className="flex items-center gap-2 text-sm text-foreground hover:underline text-left">
                <FileText className="w-4 h-4 text-primary shrink-0" /> {a.name}
              </button>
              <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                <button onClick={() => remove(a.id)} className="text-red-500 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
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
              Drag & drop a file, or click to browse
              <span className="text-[11px]">PDF, DOC, DOCX, XLSX, CSV, JPG, PNG, ZIP — max 25MB</span>
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.zip" />
            </label>
          )}
        </div>
      </Can>
    </div>
  );
}
