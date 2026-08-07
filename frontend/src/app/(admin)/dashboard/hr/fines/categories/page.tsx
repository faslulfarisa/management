'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Loader2, Tag, CheckCircle, XCircle } from 'lucide-react';

const CATEGORY_TYPE_COLORS: Record<string, string> = {
  disciplinary: 'bg-red-100 text-red-700',
  financial:    'bg-blue-100 text-blue-700',
  asset:        'bg-yellow-100 text-yellow-700',
  policy:       'bg-purple-100 text-purple-700',
  recovery:     'bg-green-100 text-green-700',
};

function CategoryFormModal({
  initial, onClose, onSaved,
}: {
  initial?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    category_type: initial?.category_type ?? 'disciplinary',
    description: initial?.description ?? '',
    is_payroll_deductible: initial?.is_payroll_deductible ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) { setError('Name and code are required'); return; }
    setSaving(true);
    try {
      if (initial?.id) {
        await api.put(`/fines/categories/${initial.id}`, form);
      } else {
        await api.post('/fines/categories', form);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-sm">{initial?.id ? 'Edit Category' : 'New Deduction Category'}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category Code <span className="text-red-500">*</span></label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
              placeholder="e.g. LATE_COMING" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <p className="text-xs text-muted-foreground mt-1">Uppercase letters and underscores only. Must be unique within the tenant.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category Type</label>
            <select value={form.category_type} onChange={e => setForm(f => ({ ...f, category_type: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="disciplinary">Disciplinary</option>
              <option value="financial">Financial</option>
              <option value="asset">Asset</option>
              <option value="policy">Policy</option>
              <option value="recovery">Recovery</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <textarea value={form.description} rows={2} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.is_payroll_deductible}
              onChange={e => setForm(f => ({ ...f, is_payroll_deductible: e.target.checked }))}
              className="w-4 h-4 rounded border-border" />
            <span className="text-sm">Allow payroll deduction for this category</span>
          </label>
        </div>
        <div className="px-6 py-4 border-t flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {initial?.id ? 'Save Changes' : 'Create Category'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function FineCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/fines/categories');
      setCategories(res.data.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (cat: any) => {
    await api.put(`/fines/categories/${cat.id}`, { is_active: !cat.is_active });
    load();
  };

  const groupedByType = categories.reduce((acc: any, c: any) => {
    if (!acc[c.category_type]) acc[c.category_type] = [];
    acc[c.category_type].push(c);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Tag className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Deduction Categories</h1>
            <p className="text-xs text-muted-foreground">Manage fine reasons and classification tags</p>
          </div>
        </div>
        <Button size="sm" onClick={() => { setEditTarget(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Category
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByType).map(([type, cats]: [string, any]) => (
            <Card key={type}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${CATEGORY_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-700'}`}>{type}</span>
                  <span className="text-muted-foreground font-normal">({cats.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {cats.map((cat: any) => (
                    <div key={cat.id} className={`flex items-center justify-between py-3 ${!cat.is_active ? 'opacity-50' : ''}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{cat.name}</p>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{cat.code}</code>
                          {!cat.is_payroll_deductible && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">No Payroll</span>
                          )}
                        </div>
                        {cat.description && <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <button onClick={() => { setEditTarget(cat); setShowForm(true); }}
                          className="text-xs text-primary hover:underline">Edit</button>
                        <button onClick={() => toggleActive(cat)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${cat.is_active ? 'hover:bg-red-100 text-green-600 hover:text-red-600' : 'hover:bg-green-100 text-gray-400 hover:text-green-600'}`}
                          title={cat.is_active ? 'Deactivate' : 'Activate'}>
                          {cat.is_active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <CategoryFormModal initial={editTarget} onClose={() => setShowForm(false)} onSaved={load} />
      )}
    </div>
  );
}
