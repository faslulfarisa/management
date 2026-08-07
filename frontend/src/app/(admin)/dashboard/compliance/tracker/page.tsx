'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, X, FileText, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { complianceTrackerApi } from '@/lib/compliance-api';
import { StatusBadge } from '@/components/compliance/badges';

const FILING_TYPES = ['PF', 'ESI', 'PT', 'TDS'];
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('default', { month: 'long' }) }));
const COMPLIANCE_TYPES = [
  'labour_law', 'pf', 'esi', 'gst', 'professional_tax', 'income_tax', 'factory_compliance',
  'iso', 'internal_audit', 'external_audit', 'govt_inspection', 'legal_case', 'custom',
];

function FilingDrawer({ onClose, onSaved, editData }: { onClose: () => void; onSaved: () => void; editData?: any }) {
  const [form, setForm] = useState({
    type: editData?.type || 'PF',
    month: editData?.month ? parseInt(editData.month) : new Date().getMonth() + 1,
    year: editData?.year ? parseInt(editData.year) : new Date().getFullYear(),
    amount: editData?.amount || '',
    due_date: editData?.due_date ? new Date(editData.due_date).toISOString().split('T')[0] : '',
    notes: editData?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(String(form.amount)) || 0 };
      if (editData) await complianceTrackerApi.updateFiling(editData.id, payload);
      else await complianceTrackerApi.createFiling(payload);
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save filing'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold">{editData ? 'Edit' : 'Add'} Statutory Filing</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
            {FILING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: parseInt(e.target.value) }))} className="border border-border rounded-xl px-3 py-2.5 text-sm">
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value) }))} className="border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <input type="number" placeholder="Amount (₹)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
        </div>
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} {editData ? 'Save Changes' : 'Add Filing'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackerItemDrawer({ onClose, onSaved, editData }: { onClose: () => void; onSaved: () => void; editData?: any }) {
  const [form, setForm] = useState({
    compliance_type: editData?.compliance_type || 'labour_law',
    title: editData?.title || '',
    description: editData?.description || '',
    due_date: editData?.due_date ? new Date(editData.due_date).toISOString().split('T')[0] : '',
    completion_percent: String(editData?.completion_percent || '0'),
    remarks: editData?.remarks || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, completion_percent: parseInt(String(form.completion_percent), 10) || 0 };
      if (editData) await complianceTrackerApi.updateItem(editData.id, payload);
      else await complianceTrackerApi.createItem(payload);
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save item'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold">{editData ? 'Edit' : 'Add'} Compliance Item</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <select value={form.compliance_type} onChange={(e) => setForm((f) => ({ ...f, compliance_type: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm capitalize">
            {COMPLIANCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Completion %</label>
            <input type="number" min="0" max="100" value={form.completion_percent} onChange={(e) => setForm((f) => ({ ...f, completion_percent: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>
        </div>
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editData ? 'Save Changes' : 'Add Item')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ComplianceTrackerPage() {
  const [tab, setTab] = useState<'filings' | 'items'>('filings');
  const [filings, setFilings] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilingDrawer, setShowFilingDrawer] = useState(false);
  const [showItemDrawer, setShowItemDrawer] = useState(false);
  const [editingFiling, setEditingFiling] = useState<any>(null);
  const [deletingFiling, setDeletingFiling] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deletingItem, setDeletingItem] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [f, i] = await Promise.all([complianceTrackerApi.getFilings(), complianceTrackerApi.listItems()]);
      setFilings(f); setItems(i);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const markFiled = async (id: string) => { await complianceTrackerApi.updateFiling(id, { status: 'filed' }); fetchData(); };
  const verify = async (id: string) => { await complianceTrackerApi.updateFiling(id, { status: 'verified' }); fetchData(); };
  const completeItem = async (id: string) => { await complianceTrackerApi.updateItem(id, { status: 'completed', completion_percent: 100 }); fetchData(); };

  const handleDeleteFiling = async () => {
    if (!deletingFiling) return;
    try { await complianceTrackerApi.removeFiling(deletingFiling.id); setDeletingFiling(null); fetchData(); }
    catch { alert('Failed to delete filing'); }
  };

  const handleDeleteItem = async () => {
    if (!deletingItem) return;
    try { await complianceTrackerApi.removeItem(deletingItem.id); setDeletingItem(null); fetchData(); }
    catch { alert('Failed to delete item'); }
  };

  return (
    <div className="space-y-5">
      {showFilingDrawer && <FilingDrawer onClose={() => setShowFilingDrawer(false)} onSaved={fetchData} />}
      {editingFiling && <FilingDrawer onClose={() => setEditingFiling(null)} onSaved={fetchData} editData={editingFiling} />}
      {showItemDrawer && <TrackerItemDrawer onClose={() => setShowItemDrawer(false)} onSaved={fetchData} />}
      {editingItem && <TrackerItemDrawer onClose={() => setEditingItem(null)} onSaved={fetchData} editData={editingItem} />}

      {deletingFiling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingFiling(null)} />
          <div className="relative bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">Delete Filing</h3>
            <p className="text-sm text-muted-foreground mb-6">Are you sure you want to delete this filing? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingFiling(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteFiling}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingItem(null)} />
          <div className="relative bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">Delete Compliance Item</h3>
            <p className="text-sm text-muted-foreground mb-6">Are you sure you want to delete &quot;{deletingItem.title}&quot;? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingItem(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteItem}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">Compliance Tracker</h1>
        <p className="text-muted-foreground">Statutory filings and ongoing compliance work items (audits, legal cases, inspections)</p>
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {(['filings', 'items'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'filings' ? 'Statutory Filings' : 'Compliance Items'}
          </button>
        ))}
      </div>

      {tab === 'filings' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Statutory Filings</CardTitle>
            <Button onClick={() => setShowFilingDrawer(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Filing</Button>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></p> : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left p-3 font-medium normal-case">Type</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Period</TableHead>
                    <TableHead className="text-right p-3 font-medium normal-case">Amount</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Due Date</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Status</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filings.length === 0 ? <TableRow><TableCell colSpan={6} className="p-8 text-center text-muted-foreground">No filings recorded</TableCell></TableRow> : filings.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="p-3 font-medium">{f.type}</TableCell>
                      <TableCell className="p-3">{MONTHS.find((m) => m.value === parseInt(f.month))?.label} {f.year}</TableCell>
                      <TableCell className="p-3 text-right">₹{parseFloat(f.amount || 0).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="p-3">{f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN') : '—'}</TableCell>
                      <TableCell className="p-3"><StatusBadge status={f.status === 'verified' ? 'approved' : f.status === 'filed' ? 'pending_approval' : 'draft'} /></TableCell>
                      <TableCell className="p-3 flex items-center gap-2">
                        {f.status === 'pending' && <Button size="sm" variant="outline" onClick={() => markFiled(f.id)}>Mark Filed</Button>}
                        {f.status === 'filed' && <Button size="sm" variant="outline" onClick={() => verify(f.id)}>Verify</Button>}
                        <button onClick={() => setEditingFiling(f)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeletingFiling(f)} className="text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'items' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Compliance Items</CardTitle>
            <Button onClick={() => setShowItemDrawer(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Item</Button>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></p> : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left p-3 font-medium normal-case">Title</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Type</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Due Date</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Completion</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Status</TableHead>
                    <TableHead className="text-left p-3 font-medium normal-case">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? <TableRow><TableCell colSpan={6} className="p-8 text-center text-muted-foreground">No compliance items</TableCell></TableRow> : items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="p-3 font-medium">{i.title}</TableCell>
                      <TableCell className="p-3 capitalize text-muted-foreground">{i.compliance_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="p-3">{i.due_date ? new Date(i.due_date).toLocaleDateString('en-IN') : '—'}</TableCell>
                      <TableCell className="p-3">{i.completion_percent}%</TableCell>
                      <TableCell className="p-3 capitalize">{i.status.replace('_', ' ')}</TableCell>
                      <TableCell className="p-3 flex items-center gap-2">
                        {i.status !== 'completed' && <Button size="sm" variant="outline" onClick={() => completeItem(i.id)}>Mark Completed</Button>}
                        <button onClick={() => setEditingItem(i)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeletingItem(i)} className="text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
