'use client';

import { useState } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import { communicationTemplatesApi, CommunicationTemplate } from '@/lib/pipeline-api';

const CATEGORIES = ['interview_invite', 'rejection', 'offer', 'reminder', 'custom'];

export function CommunicationTemplateManager({ templates, onClose, onChanged }: { templates: CommunicationTemplate[]; onClose: () => void; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'custom', subject: '', body: '' });
  const [saving, setSaving] = useState(false);

  const startEdit = (t: CommunicationTemplate) => { setEditingId(t.id); setForm({ name: t.name, category: t.category, subject: t.subject, body: t.body }); setShowCreate(false); };
  const startCreate = () => { setEditingId(null); setForm({ name: '', category: 'custom', subject: '', body: '' }); setShowCreate(true); };

  const save = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editingId) await communicationTemplatesApi.update(editingId, form as any);
      else await communicationTemplatesApi.create(form);
      setEditingId(null); setShowCreate(false);
      onChanged();
    } finally { setSaving(false); }
  };

  const deactivate = async (t: CommunicationTemplate) => { if (window.confirm(`Deactivate "${t.name}"?`)) { await communicationTemplatesApi.update(t.id, { is_active: false }); onChanged(); } };

  const editorOpen = showCreate || !!editingId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-bold text-foreground">Manage Communication Templates</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {!editorOpen && (
            <button onClick={startCreate} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-xs font-semibold hover:bg-primary/90 mb-2">
              <Plus className="w-3 h-3" /> New Template
            </button>
          )}
          {editorOpen && (
            <div className="bg-muted/30 rounded-xl p-3 space-y-2 mb-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Template name" className="border border-border rounded-lg px-2.5 py-2 text-sm" />
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="border border-border rounded-lg px-2.5 py-2 text-sm capitalize">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
              <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Subject" className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
              <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Body — {{candidate_name}}, {{job_title}}, {{company_name}}" rows={4} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">{editingId ? 'Save' : 'Create'}</button>
                <button onClick={() => { setShowCreate(false); setEditingId(null); }} className="border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
              </div>
            </div>
          )}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-muted/30 rounded-xl p-2.5">
              <div>
                <p className="text-sm font-medium">{t.name} <span className="text-xs text-muted-foreground capitalize">({t.category.replace('_', ' ')})</span></p>
                <p className="text-xs text-muted-foreground truncate max-w-[280px]">{t.subject}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(t)} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted">Edit</button>
                <button onClick={() => deactivate(t)} className="text-xs text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
