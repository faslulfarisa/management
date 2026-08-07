'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { campaignsApi, Campaign, CampaignType, CampaignStatus } from '@/lib/campaigns-api';

interface VacancyOption { id: string; title: string }

const CAMPAIGN_TYPES: CampaignType[] = ['employee_referral', 'agency', 'walk_in', 'campus', 'internship', 'job_board', 'social_media', 'other'];
const CAMPAIGN_STATUSES: CampaignStatus[] = ['planned', 'active', 'paused', 'completed', 'cancelled'];

export function CampaignDrawer({ campaign, onClose, onSaved }: { campaign?: Campaign | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!campaign;
  const [vacancies, setVacancies] = useState<VacancyOption[]>([]);
  const [form, setForm] = useState({
    name: campaign?.name || '', campaign_type: campaign?.campaign_type || 'other', status: campaign?.status || 'planned',
    start_date: campaign?.start_date?.slice(0, 10) || '', end_date: campaign?.end_date?.slice(0, 10) || '',
    budget_amount: campaign?.budget_amount?.toString() || '', actual_spend: campaign?.actual_spend?.toString() || '',
    description: campaign?.description || '',
  });
  const [vacancyIds, setVacancyIds] = useState<string[]>(campaign?.vacancy_ids || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/recruitment/vacancies', { params: { limit: 200, includeArchived: true } }).then((r) => setVacancies(r.data.data));
  }, []);

  const toggleVacancy = (id: string) =>
    setVacancyIds((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name, campaign_type: form.campaign_type, status: isEdit ? form.status : undefined,
        start_date: form.start_date || undefined, end_date: form.end_date || undefined,
        budget_amount: form.budget_amount ? parseFloat(form.budget_amount) : undefined,
        actual_spend: form.actual_spend ? parseFloat(form.actual_spend) : undefined,
        description: form.description || undefined, vacancy_ids: vacancyIds,
      };
      if (isEdit) await campaignsApi.update(campaign.id, payload);
      else await campaignsApi.create(payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save campaign');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit Campaign' : 'New Campaign'}</h2>
            <p className="text-xs text-muted-foreground">Source/referral/agency/campus initiative — budget &amp; targeting</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Campaign Type</label>
              <select value={form.campaign_type} onChange={(e) => setForm((f) => ({ ...f, campaign_type: e.target.value as CampaignType }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm capitalize">
                {CAMPAIGN_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CampaignStatus }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm capitalize">
                  {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Budget Amount</label>
              <input type="number" value={form.budget_amount} onChange={(e) => setForm((f) => ({ ...f, budget_amount: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Actual Spend</label>
              <input type="number" value={form.actual_spend} onChange={(e) => setForm((f) => ({ ...f, actual_spend: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Target Vacancies</label>
            <div className="border border-border rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
              {vacancies.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input type="checkbox" checked={vacancyIds.includes(v.id)} onChange={() => toggleVacancy(v.id)} />
                  {v.title}
                </label>
              ))}
              {vacancies.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1.5">No vacancies found</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
