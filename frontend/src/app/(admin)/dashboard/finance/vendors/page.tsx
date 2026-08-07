'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  Plus, RefreshCw, Building2, Loader2, Search, X, Trash2, Pencil,
  Phone, Mail, MapPin, CreditCard, FileText, Upload,
} from 'lucide-react';
import AddressFields from '@/components/forms/AddressFields';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const CATEGORIES = ['Supplier', 'Contractor', 'Consultant', 'Utility', 'Logistics', 'Technology', 'Other'];
const STATUS_STYLES: Record<string, string> = {
  active:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  inactive: 'bg-gray-50 text-gray-500 border border-gray-200',
};

const fmt = (n: any) => `₹${(parseFloat(String(n)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const EMPTY_FORM = () => ({
  name: '', email: '', phone: '', gstin: '', pan: '',
  address: '', city: '', state: '', pincode: '', country: '', countryCode: '', stateCode: '',
  bank_name: '', bank_account: '', bank_ifsc: '',
  payment_terms: 30, category: '', notes: '', status: 'active',
});

/* ── Vendor Drawer ─────────────────────────────────────────────────── */
function VendorDrawer({
  vendor, onClose, onSaved,
}: { vendor: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(vendor ? { ...vendor } : EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (k: string, v: any) => {
    setForm((f: any) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Vendor name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin))
      e.gstin = 'Invalid GSTIN format';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { country, countryCode, stateCode, ...payload } = form;
      if (vendor) {
        await api.put(`/vendors/${vendor.id}`, payload);
      } else {
        await api.post('/vendors', payload);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: string, opts?: { type?: string; placeholder?: string; mono?: boolean; upper?: boolean }) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <input
        type={opts?.type || 'text'}
        value={form[key] || ''}
        onChange={(e) => setField(key, opts?.upper ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={opts?.placeholder}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors[key] ? 'border-red-400' : 'border-border'} ${opts?.mono ? 'font-mono uppercase' : ''}`}
      />
      {errors[key] && <p className="text-xs text-red-500 mt-0.5">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">{vendor ? 'Edit Vendor' : 'New Vendor'}</h2>
            <p className="text-xs text-muted-foreground">Manage supplier/vendor profile</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">{field('Vendor Name *', 'name', { placeholder: 'e.g. ABC Supplies Pvt Ltd' })}</div>
              {field('Email', 'email', { type: 'email', placeholder: 'vendor@example.com' })}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Phone</label>
                <PhoneNumberInput value={form.phone || ''} onChange={(value) => setField('phone', value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
                <select value={form.category || ''} onChange={(e) => setField('category', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Terms (days)</label>
                <input type="number" min="0" value={form.payment_terms || 30} onChange={(e) => setField('payment_terms', parseInt(e.target.value) || 30)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
                <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tax */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Tax Details</h3>
            <div className="grid grid-cols-2 gap-3">
              {field('GSTIN', 'gstin', { placeholder: '29AABCT1332L1ZD', mono: true, upper: true })}
              {field('PAN', 'pan', { placeholder: 'AABCT1332L', mono: true, upper: true })}
            </div>
          </div>

          {/* Address */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Address</h3>
            <AddressFields
              value={{
                line1: form.address || '',
                city: form.city || '',
                state: form.state || '',
                stateCode: form.stateCode || '',
                country: form.country || '',
                countryCode: form.countryCode || '',
                pincode: form.pincode || '',
              }}
              onChange={(address) => setForm((current: any) => ({
                ...current,
                address: address.line1 || '',
                city: address.city || '',
                state: address.state || '',
                stateCode: address.stateCode || '',
                country: address.country || '',
                countryCode: address.countryCode || '',
                pincode: address.pincode || '',
              }))}
              showLine2={false}
              postalCodeKey="pincode"
            />
          </div>

          {/* Bank */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Bank Details</h3>
            <div className="grid grid-cols-2 gap-3">
              {field('Bank Name', 'bank_name', { placeholder: 'HDFC Bank' })}
              {field('Account Number', 'bank_account', { placeholder: '50100XXXXXXXXXX', mono: true })}
              {field('IFSC Code', 'bank_ifsc', { placeholder: 'HDFC0001234', mono: true, upper: true })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} rows={2} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center gap-2 shrink-0 bg-muted/20">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
            {vendor ? 'Save Changes' : 'Create Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Statement Modal ───────────────────────────────────────────────── */
function StatementModal({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/vendors/${vendor.id}/statement`)
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [vendor.id]);

  const BILL_STATUS: Record<string, string> = {
    pending:  'bg-amber-50 text-amber-700 border border-amber-200',
    approved: 'bg-blue-50 text-blue-700 border border-blue-200',
    paid:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
    cancelled:'bg-red-50 text-red-600 border border-red-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">{vendor.name}</h2>
            <p className="text-xs text-muted-foreground">Vendor Statement</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : data ? (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Billed', value: fmt(data.summary.total_billed), color: 'text-foreground' },
                  { label: 'Total Paid', value: fmt(data.summary.total_paid), color: 'text-emerald-600' },
                  { label: 'Outstanding', value: fmt(data.summary.outstanding), color: data.summary.outstanding > 0 ? 'text-red-600' : 'text-emerald-600' },
                ].map(s => (
                  <div key={s.label} className="bg-muted/40 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">{s.label}</p>
                    <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Bills */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Bills</h3>
                {data.bills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No bills found for this vendor</p>
                ) : (
                  <Table className="w-full text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left p-2 text-xs font-medium text-muted-foreground">Bill #</TableHead>
                        <TableHead className="text-left p-2 text-xs font-medium text-muted-foreground">Date</TableHead>
                        <TableHead className="text-right p-2 text-xs font-medium text-muted-foreground">Amount</TableHead>
                        <TableHead className="text-right p-2 text-xs font-medium text-muted-foreground">Paid</TableHead>
                        <TableHead className="text-left p-2 text-xs font-medium text-muted-foreground">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.bills.map((b: any) => (
                        <TableRow key={b.id}>
                          <TableCell className="p-2 font-mono text-xs font-semibold text-primary">{b.bill_number}</TableCell>
                          <TableCell className="p-2 text-muted-foreground">{b.bill_date ? new Date(b.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</TableCell>
                          <TableCell className="p-2 text-right font-semibold">{fmt(b.total_amount)}</TableCell>
                          <TableCell className="p-2 text-right text-emerald-600">{fmt(b.amount_paid)}</TableCell>
                          <TableCell className="p-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${BILL_STATUS[b.status] || ''}`}>{b.status}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">Failed to load statement</p>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="w-full border border-border rounded-xl py-2 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */
export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('all');
  const [showDrawer, setShowDrawer] = useState(false);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);

  const VENDOR_BULK_COLUMNS = [
    { key: 'name', label: 'Vendor Name', required: true, placeholder: 'Acme Supplies Pvt Ltd', width: '170px' },
    { key: 'category', label: 'Category', type: 'select' as const, options: CATEGORIES, defaultValue: 'Supplier', width: '130px' },
    { key: 'email', label: 'Email', type: 'email' as const, width: '160px' },
    { key: 'phone', label: 'Phone', placeholder: '9XXXXXXXXX', width: '120px' },
    { key: 'gstin', label: 'GSTIN', placeholder: '29ABCDE1234F1Z5', width: '155px' },
    { key: 'pan', label: 'PAN', placeholder: 'ABCDE1234F', width: '110px' },
    { key: 'city', label: 'City', width: '110px' },
    { key: 'state', label: 'State', width: '130px' },
    { key: 'payment_terms', label: 'Payment Terms (days)', type: 'number' as const, defaultValue: '30', width: '120px' },
  ];
  const [editVendor, setEditVendor] = useState<any | null>(null);
  const [statementVendor, setStatementVendor] = useState<any | null>(null);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (activeStatus !== 'all') params.status = activeStatus;
      if (search) params.search = search;
      const res = await api.get('/vendors', { params });
      setVendors(res.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeStatus, search]);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const deleteVendor = async (id: string, name: string) => {
    if (!confirm(`Delete vendor "${name}"? This cannot be undone.`)) return;
    try { await api.delete(`/vendors/${id}`); fetchVendors(); }
    catch { alert('Failed to delete vendor'); }
  };

  const handleEdit = (v: any) => { setEditVendor(v); setShowDrawer(true); };
  const handleCloseDrawer = () => { setShowDrawer(false); setEditVendor(null); };

  return (
    <>
      {showDrawer && <VendorDrawer vendor={editVendor} onClose={handleCloseDrawer} onSaved={fetchVendors} />}
      {statementVendor && <StatementModal vendor={statementVendor} onClose={() => setStatementVendor(null)} />}
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Vendors"
          subtitle="Import multiple vendors into your directory at once"
          columns={VENDOR_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/finance/vendors', { ...row, payment_terms: parseInt(row.payment_terms) || 30, status: 'active' })}
          onAllDone={fetchVendors}
        />
      )}

      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Vendors</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your supplier and vendor directory</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchVendors} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={() => setShowBulkDrawer(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button onClick={() => { setEditVendor(null); setShowDrawer(true); }} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 shadow-lg shadow-primary/30">
              <Plus className="w-4 h-4" /> Add Vendor
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
            {['all', 'active', 'inactive'].map(s => (
              <button key={s} onClick={() => setActiveStatus(s)} className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize transition-all ${activeStatus === s ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, GSTIN…" className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : vendors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Building2 className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No vendors found</p>
              <button onClick={() => setShowDrawer(true)} className="mt-4 text-xs text-primary hover:underline font-medium">Add your first vendor →</button>
            </div>
          ) : (
            <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Vendor</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Contact</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">GSTIN</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Category</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Terms</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="p-3">
                        <p className="font-semibold text-foreground">{v.name}</p>
                        {v.city && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{v.city}{v.state ? `, ${v.state}` : ''}</p>}
                      </TableCell>
                      <TableCell className="p-3">
                        {v.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{v.email}</p>}
                        {v.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{v.phone}</p>}
                      </TableCell>
                      <TableCell className="p-3">
                        {v.gstin ? <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{v.gstin}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground">{v.category || '—'}</TableCell>
                      <TableCell className="p-3 text-muted-foreground">{v.payment_terms} days</TableCell>
                      <TableCell className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[v.status] || ''}`}>{v.status}</span>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setStatementVendor(v)} title="View Statement" className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-2 py-1 hover:bg-blue-100">
                            <FileText className="w-3 h-3" /> Statement
                          </button>
                          <button onClick={() => handleEdit(v)} title="Edit" className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteVendor(v.id, v.name)} title="Delete" className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-red-50 hover:border-red-200 text-muted-foreground hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </div>
      </div>
    </>
  );
}
