'use client';

import { useState } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import { pipelineStagesApi, PipelineStage } from '@/lib/pipeline-api';

const CATEGORIES = ['screening', 'assessment', 'interview', 'evaluation', 'offer', 'custom'];

export function PipelineStageManager({ stages, onClose, onChanged }: { stages: PipelineStage[]; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({ name: '', stage_category: 'custom', color: '#64748b' });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await pipelineStagesApi.create({ name: form.name, stage_category: form.stage_category, stage_order: stages.length + 1, color: form.color });
      setForm({ name: '', stage_category: 'custom', color: '#64748b' });
      onChanged();
    } finally { setSaving(false); }
  };

  const rename = async (stage: PipelineStage, name: string) => { if (name && name !== stage.name) await pipelineStagesApi.update(stage.id, { name }); onChanged(); };
  const move = async (stage: PipelineStage, delta: number) => { await pipelineStagesApi.update(stage.id, { stage_order: stage.stage_order + delta }); onChanged(); };
  const deactivate = async (stage: PipelineStage) => { if (window.confirm(`Deactivate "${stage.name}"?`)) { await pipelineStagesApi.deactivate(stage.id); onChanged(); } };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-bold text-foreground">Manage Pipeline Stages</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {[...stages].sort((a, b) => a.stage_order - b.stage_order).map((s, idx) => (
            <div key={s.id} className="flex items-center gap-2 bg-muted/30 rounded-xl p-2.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || '#94a3b8' }} />
              <input defaultValue={s.name} onBlur={(e) => rename(s, e.target.value)} className="flex-1 bg-transparent text-sm font-medium focus:outline-none" />
              <span className="text-xs text-muted-foreground capitalize">{s.stage_category}</span>
              <button onClick={() => move(s, -1)} disabled={idx === 0} className="text-xs px-1.5 py-1 rounded hover:bg-muted disabled:opacity-30">↑</button>
              <button onClick={() => move(s, 1)} disabled={idx === stages.length - 1} className="text-xs px-1.5 py-1 rounded hover:bg-muted disabled:opacity-30">↓</button>
              <button onClick={() => deactivate(s)} className="text-xs text-red-600 px-1.5 py-1 rounded hover:bg-red-50">Remove</button>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-5 space-y-2 shrink-0">
          <div className="flex gap-2">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="New stage name" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-sm" />
            <select value={form.stage_category} onChange={(e) => setForm((f) => ({ ...f, stage_category: e.target.value }))} className="border border-border rounded-lg px-2.5 py-2 text-sm capitalize">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="w-10 h-9 border border-border rounded-lg" />
            <button onClick={create} disabled={saving} className="bg-primary text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
