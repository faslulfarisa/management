'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Loader2, Receipt, Plus } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

/* ── New Folio Drawer ─────────────────────────────────────────────────── */
function NewFolioDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ guest_name: '', room_number: '', check_in: '', check_out: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.guest_name.trim()) e.guest_name = 'Guest name is required';
    if (form.check_in && form.check_out && form.check_in > form.check_out) e.check_out = 'Check-out must be after check-in';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/billing/folios', form);
      onSaved(); onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to create folio' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div><h2 className="text-base font-bold text-foreground">New Guest Folio</h2><p className="text-xs text-muted-foreground">Create a billing folio for a guest stay</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Guest Name <span className="text-red-500">*</span></label>
            <input value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))} placeholder="Full guest name" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.guest_name ? 'border-red-400' : 'border-border'}`} />
            {errors.guest_name && <p className="text-xs text-red-500 mt-1">{errors.guest_name}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Room Number</label>
            <input value={form.room_number} onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))} placeholder="e.g. 101" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Check In</label>
              <input type="date" value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Check Out</label>
              <input type="date" value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.check_out ? 'border-red-400' : 'border-border'}`} />
              {errors.check_out && <p className="text-xs text-red-500 mt-1">{errors.check_out}</p>}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Create Folio
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [folios, setFolios] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('folios');
  const [showForm, setShowForm] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      setFolios([]);
      setItems([]);
    } catch (err) {
      console.error('Failed to fetch billing:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <>
      {showForm && <NewFolioDrawer onClose={() => setShowForm(false)} onSaved={fetchData} />}
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted-foreground">Manage guest folios, charges, and payments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Open Folios</p>
            <p className="text-3xl font-bold">{folios.filter(f => f.status === 'open').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Outstanding Balance</p>
            <p className="text-3xl font-bold">₹{folios.reduce((sum, f) => sum + parseFloat(f.balance || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Billing Items</p>
            <p className="text-3xl font-bold">{items.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button variant={activeTab === 'folios' ? 'default' : 'outline'} onClick={() => setActiveTab('folios')}>Folios</Button>
        <Button variant={activeTab === 'items' ? 'default' : 'outline'} onClick={() => setActiveTab('items')}>Billing Items</Button>
      </div>

      {activeTab === 'folios' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Guest Folios
              <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
                <Plus className="w-3.5 h-3.5" /> New Folio
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading...</p>
            ) : folios.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No folios created yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folios.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.guest_name}</TableCell>
                      <TableCell>{f.room_number || '-'}</TableCell>
                      <TableCell>{f.check_in ? new Date(f.check_in).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{f.check_out ? new Date(f.check_out).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-right">₹{parseFloat(f.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className="text-right">₹{parseFloat(f.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className="text-right font-medium">₹{parseFloat(f.balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${f.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {f.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'items' && (
        <Card>
          <CardHeader><CardTitle>Billing Items</CardTitle></CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No billing items configured</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {items.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{item.type}</p>
                      <p className="text-lg font-bold mt-2">₹{parseFloat(item.rate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
