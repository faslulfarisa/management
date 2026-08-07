'use client';

import { useState, useEffect, useCallback } from 'react';
import { documentBrandingApi } from '@/lib/company-profile-api';
import type { DocumentBrandingConfig, DocumentType, UpsertDocumentBrandingPayload } from '@/lib/company-profile-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, RefreshCw, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOC_TYPES: { type: DocumentType; label: string; icon: string }[] = [
  { type: 'invoice',           label: 'Invoice',             icon: '🧾' },
  { type: 'payslip',           label: 'Payslip',             icon: '💵' },
  { type: 'payroll_export',    label: 'Payroll Export',      icon: '📊' },
  { type: 'hr_letter',         label: 'HR Letter',           icon: '📝' },
  { type: 'offer_letter',      label: 'Offer Letter',        icon: '✉️' },
  { type: 'experience_letter', label: 'Experience Letter',   icon: '🏆' },
  { type: 'report',            label: 'Report',              icon: '📋' },
  { type: 'quotation',         label: 'Quotation',           icon: '💼' },
];

const LOGO_PLACEMENTS = ['top-left', 'top-center', 'top-right'];

const DEFAULT_CFG: UpsertDocumentBrandingPayload = {
  documentType:     'invoice',
  logoPlacement:    'top-left',
  watermarkEnabled: false,
  watermarkText:    '',
  watermarkOpacity: 0.15,
  showCompanySeal:  false,
  footerText:       '',
  headerColor:      '#ffffff',
  accentColor:      '#000000',
  showGstin:        true,
  showAddress:      true,
};

function configToForm(cfg: DocumentBrandingConfig, type: DocumentType): UpsertDocumentBrandingPayload {
  return {
    documentType:     type,
    logoPlacement:    cfg.logo_placement ?? 'top-left',
    watermarkEnabled: cfg.watermark_enabled ?? false,
    watermarkText:    cfg.watermark_text ?? '',
    watermarkOpacity: cfg.watermark_opacity ?? 0.15,
    showCompanySeal:  cfg.show_company_seal ?? false,
    footerText:       cfg.footer_text ?? '',
    headerColor:      cfg.header_color ?? '#ffffff',
    accentColor:      cfg.accent_color ?? '#000000',
    showGstin:        cfg.show_gstin ?? true,
    showAddress:      cfg.show_address ?? true,
  };
}

export default function DocumentsPage() {
  const [configs,  setConfigs]  = useState<DocumentBrandingConfig[]>([]);
  const [selected, setSelected] = useState<DocumentType>('invoice');
  const [form,     setForm]     = useState<UpsertDocumentBrandingPayload>({ ...DEFAULT_CFG, documentType: 'invoice' });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const loadConfigs = useCallback(() => {
    documentBrandingApi.list().then(setConfigs).catch(() => setError('Failed to load configs.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // Sync form when selection or loaded configs change
  useEffect(() => {
    const cfg = configs.find((c) => c.document_type === selected && c.branch_id === null);
    setForm(cfg ? configToForm(cfg, selected) : { ...DEFAULT_CFG, documentType: selected });
  }, [selected, configs]);

  const set = <K extends keyof UpsertDocumentBrandingPayload>(key: K, val: UpsertDocumentBrandingPayload[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await documentBrandingApi.upsert(form);
      loadConfigs();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const configuredTypes = new Set(configs.filter((c) => !c.branch_id).map((c) => c.document_type));

  return (
    <div className="flex gap-6">
      {/* Left: document type list */}
      <div className="w-52 shrink-0">
        <Card>
          <CardContent className="p-2">
            <ul className="space-y-0.5">
              {DOC_TYPES.map(({ type, label, icon }) => (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => setSelected(type)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 text-left',
                      selected === type
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className="text-base leading-none">{icon}</span>
                    <span className="flex-1 truncate">{label}</span>
                    {configuredTypes.has(type) && (
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        selected === type ? 'bg-primary-foreground/60' : 'bg-primary',
                      )} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Right: config form */}
      <div className="flex-1 space-y-5 min-w-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">
            {DOC_TYPES.find((d) => d.type === selected)?.label} — Branding Config
          </h2>
        </div>

        {/* Logo */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Logo</h3>
            <Field label="Logo Placement">
              <div className="flex gap-2">
                {LOGO_PLACEMENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('logoPlacement', p)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium border transition-all',
                      form.logoPlacement === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50',
                    )}
                  >
                    {p.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </Field>
          </CardContent>
        </Card>

        {/* Watermark */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Watermark</h3>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="wm-enabled"
                checked={form.watermarkEnabled ?? false}
                onChange={(e) => set('watermarkEnabled', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="wm-enabled" className="text-sm font-medium">Enable watermark on this document type</label>
            </div>

            {form.watermarkEnabled && (
              <div className="space-y-4 pl-7">
                <Field label="Watermark Text">
                  <Input
                    value={form.watermarkText ?? ''}
                    onChange={(e) => set('watermarkText', e.target.value)}
                    placeholder="CONFIDENTIAL"
                  />
                </Field>
                <Field label={`Opacity — ${Math.round((form.watermarkOpacity ?? 0.15) * 100)}%`}>
                  <input
                    type="range"
                    min={0.05}
                    max={0.5}
                    step={0.05}
                    value={form.watermarkOpacity ?? 0.15}
                    onChange={(e) => set('watermarkOpacity', parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                </Field>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Colors & Footer */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Colours &amp; Footer</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Header Colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.headerColor ?? '#ffffff'}
                    onChange={(e) => set('headerColor', e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={form.headerColor ?? '#ffffff'}
                    onChange={(e) => set('headerColor', e.target.value)}
                    className="font-mono text-xs"
                    maxLength={7}
                  />
                </div>
              </Field>
              <Field label="Accent Colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.accentColor ?? '#000000'}
                    onChange={(e) => set('accentColor', e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={form.accentColor ?? '#000000'}
                    onChange={(e) => set('accentColor', e.target.value)}
                    className="font-mono text-xs"
                    maxLength={7}
                  />
                </div>
              </Field>
            </div>

            <Field label="Footer Text">
              <Input
                value={form.footerText ?? ''}
                onChange={(e) => set('footerText', e.target.value)}
                placeholder="© 2025 Acme Corp · All rights reserved"
              />
            </Field>
          </CardContent>
        </Card>

        {/* Visibility */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Visibility</h3>
            <Toggle
              id="show-gstin"
              label="Show GST / Tax number"
              checked={form.showGstin ?? true}
              onChange={(v) => set('showGstin', v)}
            />
            <Toggle
              id="show-address"
              label="Show company address"
              checked={form.showAddress ?? true}
              onChange={(v) => set('showAddress', v)}
            />
            <Toggle
              id="show-seal"
              label="Show company seal / stamp"
              checked={form.showCompanySeal ?? false}
              onChange={(v) => set('showCompanySeal', v)}
            />
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving…' : 'Save Config'}
          </Button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved successfully</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border"
      />
      <label htmlFor={id} className="text-sm">{label}</label>
    </div>
  );
}
