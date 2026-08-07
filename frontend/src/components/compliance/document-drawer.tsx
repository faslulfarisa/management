'use client';

import { useEffect, useState } from 'react';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import { complianceCategoriesApi, complianceDocumentsApi, ComplianceCategory } from '@/lib/compliance-api';

const CONFIDENTIALITY_LEVELS = ['public', 'internal', 'confidential', 'restricted'];

export function DocumentDrawer({
  scope, employeeId, fixedEmployee, onClose, onSaved, editData,
}: {
  scope: 'company' | 'employee';
  employeeId?: string;
  fixedEmployee?: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: any;
}) {
  const [categories, setCategories] = useState<ComplianceCategory[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    category_id: editData?.category_id || '', title: editData?.title || '', description: editData?.description || '', document_number: editData?.document_number || '', issuing_authority: editData?.issuing_authority || '',
    issue_date: editData?.issue_date ? new Date(editData.issue_date).toISOString().split('T')[0] : '', expiry_date: editData?.expiry_date ? new Date(editData.expiry_date).toISOString().split('T')[0] : '', renewal_date: editData?.renewal_date ? new Date(editData.renewal_date).toISOString().split('T')[0] : '', grace_period_days: String(editData?.grace_period_days || '0'),
    confidentiality_level: editData?.confidentiality_level || 'internal', tags: editData?.tags ? editData.tags.join(', ') : '', remarks: editData?.remarks || '',
  });

  useEffect(() => {
    complianceCategoriesApi.list(scope).then(setCategories).catch(() => setCategories([]));
  }, [scope]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.category_id) e.category_id = 'Category is required';
    if (!form.title.trim()) e.title = 'Title is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let fileMeta: { url: string; fileName: string; sizeBytes: number; mimeType: string } | null = null;
      if (file) fileMeta = await complianceDocumentsApi.uploadFile(file);

      const category = categories.find((c) => c.id === form.category_id);
      
      const payload: any = {
        category_id: form.category_id,
        title: form.title,
        description: form.description || undefined,
        document_number: form.document_number || undefined,
        issuing_authority: form.issuing_authority || undefined,
        issue_date: form.issue_date || undefined,
        expiry_date: form.expiry_date || undefined,
        renewal_date: form.renewal_date || undefined,
        grace_period_days: parseInt(form.grace_period_days, 10) || 0,
        confidentiality_level: form.confidentiality_level,
        tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        remarks: form.remarks || undefined,
      };

      if (editData) {
        await complianceDocumentsApi.update(editData.id, payload);
      } else {
        await complianceDocumentsApi.create({
          scope,
          employee_id: scope === 'employee' ? employeeId : undefined,
          document_type: category?.name || form.title,
          ...payload,
          file_url: fileMeta?.url,
          file_name: fileMeta?.fileName,
          file_size_bytes: fileMeta?.sizeBytes,
          mime_type: fileMeta?.mimeType,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.message || err.response?.data?.error || 'Failed to save document' });
    } finally {
      setSaving(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{editData ? 'Edit' : 'Add'} {scope === 'company' ? 'Company' : 'Employee'} Document</h2>
            <p className="text-xs text-muted-foreground">{editData ? 'Update compliance document details' : 'Upload and track a new compliance document'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}

          {!editData && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" /> {file.name}
                  <button onClick={() => setFile(null)} className="text-red-500 hover:underline ml-2">remove</button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Upload className="w-5 h-5" />
                  Drag & drop a file, or click to browse
                  <span className="text-[11px]">PDF, DOC, DOCX, XLSX, CSV, JPG, PNG, ZIP — max 25MB</span>
                  <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.zip" />
                </label>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category <span className="text-red-500">*</span></label>
            <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.category_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select category…</option>
              {Object.entries(categories.reduce((acc: Record<string, ComplianceCategory[]>, c) => {
                (acc[c.group_label] ??= []).push(c); return acc;
              }, {})).map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
            {errors.category_id && <p className="text-xs text-red-500 mt-1">{errors.category_id}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. GST Registration Certificate"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.title ? 'border-red-400' : 'border-border'}`} />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Document Number</label>
              <input value={form.document_number} onChange={(e) => set('document_number', e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Issuing Authority</label>
              <input value={form.issuing_authority} onChange={(e) => set('issuing_authority', e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Issue Date</label>
              <input type="date" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Grace (days)</label>
              <input type="number" min="0" value={form.grace_period_days} onChange={(e) => set('grace_period_days', e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Confidentiality Level</label>
            <select value={form.confidentiality_level} onChange={(e) => set('confidentiality_level', e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm border-border focus:outline-none focus:ring-2 focus:ring-primary/30 capitalize">
              {CONFIDENTIALITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Tags (comma-separated)</label>
            <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="statutory, annual, renewal"
              className="w-full border rounded-xl px-3 py-2.5 text-sm border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Remarks</label>
            <textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2}
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 border-border resize-none" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Save Document
          </button>
        </div>
      </div>
    </div>
  );
}
