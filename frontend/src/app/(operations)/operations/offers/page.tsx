'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Gift, Plus, Pencil, Trash2, X, Search, Percent, Clock, Tag,
  Loader2, Power, PowerOff, AlertTriangle,
} from 'lucide-react';
import { signupOffersApi, SignupOffer, SignupOfferPayload, SignupOfferType } from '@/lib/signup-offers-api';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const OFFER_TYPES: { value: SignupOfferType; label: string }[] = [
  { value: 'free_trial', label: 'Free Trial (days)' },
  { value: 'discount_percent', label: 'Percentage Discount' },
  { value: 'discount_flat', label: 'Flat Amount Discount' },
];

function offerValueLabel(offer: SignupOffer): string {
  if (offer.offer_type === 'free_trial') return `${offer.trial_days} day${offer.trial_days === 1 ? '' : 's'} free`;
  if (offer.offer_type === 'discount_percent') return `${offer.discount_percent}% off`;
  if (offer.offer_type === 'discount_flat') return `₹${offer.discount_amount} off`;
  return '—';
}

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

/* ── Offer Drawer ─────────────────────────────────────────────────────── */
function OfferDrawer({ editOffer, onClose, onSaved }: { editOffer: SignupOffer | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: editOffer?.name || '',
    description: editOffer?.description || '',
    offerType: editOffer?.offer_type || ('free_trial' as SignupOfferType),
    trialDays: editOffer?.trial_days?.toString() || '7',
    discountPercent: editOffer?.discount_percent || '',
    discountAmount: editOffer?.discount_amount || '',
    code: editOffer?.code || '',
    validFrom: toDateInputValue(editOffer?.valid_from || null),
    validUntil: toDateInputValue(editOffer?.valid_until || null),
    maxRedemptions: editOffer?.max_redemptions?.toString() || '',
    isActive: editOffer?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const buildPayload = (): SignupOfferPayload => ({
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    offerType: form.offerType,
    trialDays: form.offerType === 'free_trial' ? parseInt(form.trialDays, 10) : undefined,
    discountPercent: form.offerType === 'discount_percent' ? parseFloat(form.discountPercent) : undefined,
    discountAmount: form.offerType === 'discount_flat' ? parseFloat(form.discountAmount) : undefined,
    code: form.code.trim() || undefined,
    validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : undefined,
    validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
    maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions, 10) : undefined,
    isActive: form.isActive,
  });

  const save = async () => {
    if (!form.name.trim()) { setError('Offer name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      if (editOffer) {
        await signupOffersApi.update(editOffer.id, payload);
      } else {
        await signupOffersApi.create(payload);
      }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to save offer');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{editOffer ? 'Edit Offer' : 'New Signup Offer'}</h2>
            <p className="text-xs text-muted-foreground">{editOffer ? 'Update offer details' : 'Define a limited-time signup incentive'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Offer Name <span className="text-red-500">*</span></label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="7-Day Free Trial"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Shown to new signups, e.g. 'Try every module free for a week.'"
              rows={2}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Offer Type</label>
            <select
              value={form.offerType}
              disabled={!!editOffer}
              onChange={e => setForm(f => ({ ...f, offerType: e.target.value as SignupOfferType }))}
              className={`w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${editOffer ? 'opacity-60 cursor-not-allowed bg-muted/30' : ''}`}
            >
              {OFFER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {form.offerType === 'free_trial' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Trial Days <span className="text-red-500">*</span></label>
              <input
                type="number" min={1}
                value={form.trialDays}
                onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))}
                placeholder="7"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
          {form.offerType === 'discount_percent' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Discount Percent <span className="text-red-500">*</span></label>
              <input
                type="number" min={0} max={100} step="0.01"
                value={form.discountPercent}
                onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))}
                placeholder="20"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
          {form.offerType === 'discount_flat' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Discount Amount (₹) <span className="text-red-500">*</span></label>
              <input
                type="number" min={0} step="0.01"
                value={form.discountAmount}
                onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value }))}
                placeholder="500"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Promo Code <span className="text-muted-foreground/60 font-normal">(optional — leave blank to auto-show to everyone)</span>
            </label>
            <input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="LAUNCH2026"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Valid From</label>
              <input
                type="date"
                value={form.validFrom}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Valid Until <span className="text-muted-foreground/60 font-normal">(optional)</span></label>
              <input
                type="date"
                value={form.validUntil}
                onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Max Redemptions <span className="text-muted-foreground/60 font-normal">(optional — leave blank for unlimited)</span></label>
            <input
              type="number" min={1}
              value={form.maxRedemptions}
              onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))}
              placeholder="Unlimited"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 rounded border-input accent-primary" />
            Active — visible/redeemable on the signup wizard
          </label>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} {editOffer ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignupOffersPage() {
  const [offers, setOffers] = useState<SignupOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [showDrawer, setShowDrawer] = useState(false);
  const [editOffer, setEditOffer] = useState<SignupOffer | null>(null);
  const [deleteOffer, setDeleteOffer] = useState<SignupOffer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => { fetchOffers(); }, []);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const data = await signupOffersApi.list();
      setOffers(data || []);
    } catch (err) {
      console.error('Failed to fetch signup offers:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setEditOffer(null); setShowDrawer(true); };
  const openEdit = (offer: SignupOffer) => { setEditOffer(offer); setShowDrawer(true); };

  const toggleActive = async (offer: SignupOffer) => {
    try {
      await signupOffersApi.toggleActive(offer.id, !offer.is_active);
      fetchOffers();
    } catch (err) {
      console.error('Failed to toggle offer:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteOffer) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await signupOffersApi.remove(deleteOffer.id);
      setDeleteOffer(null);
      fetchOffers();
    } catch (err: any) {
      setDeleteError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to delete offer');
    } finally {
      setDeleting(false);
    }
  };

  const filteredOffers = offers.filter(o =>
    o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.code || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = offers.filter(o => o.is_active).length;
  const totalRedemptions = offers.reduce((sum, o) => sum + (o.redemptions_count || 0), 0);

  return (
    <>
      {showDrawer && (
        <OfferDrawer editOffer={editOffer} onClose={() => setShowDrawer(false)} onSaved={fetchOffers} />
      )}

      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Signup Offers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Customize limited-time incentives for organizations created through public signup
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            New Offer
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-blue text-white">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{offers.length}</p>
                <p className="text-xs text-muted-foreground">Total Offers</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-emerald text-white">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-amber text-white">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalRedemptions}</p>
                <p className="text-xs text-muted-foreground">Total Redemptions</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search offers by name or code..."
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offer</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Validity</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Redemptions</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Loading offers...</p>
                  </TableCell>
                </TableRow>
              ) : filteredOffers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <Gift className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No offers match your search' : 'No signup offers yet — create one to incentivize new organizations'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredOffers.map((offer, index) => (
                  <TableRow key={offer.id} className="hover:bg-muted/30 transition-colors" style={{ animation: `slideUp 0.3s ease ${index * 0.04}s both` }}>
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-indigo-500 to-purple-500">
                          {offer.offer_type === 'free_trial' ? <Clock className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{offer.name}</p>
                          {offer.description && <p className="text-xs text-muted-foreground line-clamp-1">{offer.description}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm font-medium text-foreground">{offerValueLabel(offer)}</TableCell>
                    <TableCell className="px-6 py-4 text-sm text-muted-foreground font-mono">
                      {offer.code ? offer.code : <span className="text-xs italic text-muted-foreground/60">Auto-shown</span>}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-xs text-muted-foreground">
                      {new Date(offer.valid_from).toLocaleDateString()} – {offer.valid_until ? new Date(offer.valid_until).toLocaleDateString() : 'No end date'}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                      {offer.redemptions_count}{offer.max_redemptions ? ` / ${offer.max_redemptions}` : ''}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
                        offer.is_active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                      }`}>
                        {offer.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleActive(offer)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
                          title={offer.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {offer.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => openEdit(offer)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setDeleteOffer(offer); setDeleteError(''); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-150"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {deleteOffer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Delete Offer</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Are you sure you want to delete <span className="font-semibold text-foreground">{deleteOffer.name}</span>? This cannot be undone.
              </p>
              {deleteError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{deleteError}</p>}
              <div className="flex items-center justify-end gap-3 mt-4">
                <button onClick={() => setDeleteOffer(null)} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="bg-destructive text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 flex items-center gap-2">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
