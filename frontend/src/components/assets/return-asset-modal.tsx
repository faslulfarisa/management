'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, ArrowRightLeft } from 'lucide-react';

interface ReturnAssetModalProps {
  assignment: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReturnAssetModal({ assignment, isOpen, onClose, onSuccess }: ReturnAssetModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    return_condition: 'good' as 'good' | 'damaged' | 'lost',
    recovery_amount: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment) return;
    setLoading(true);
    setError('');

    try {
      await api.put(`/assets/assignments/${assignment.id}/return`, {
        return_condition: form.return_condition,
        recovery_amount: form.recovery_amount ? parseFloat(form.recovery_amount) : undefined,
        notes: form.notes || undefined,
      });
      setForm({ return_condition: 'good', recovery_amount: '', notes: '' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record return.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white rounded-2xl p-6 overflow-hidden">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            Record Asset Return
          </DialogTitle>
        </DialogHeader>

        {assignment && (
          <div className="mb-4 p-3 bg-slate-50 border border-slate-100 text-xs rounded-xl space-y-1">
            <p className="font-semibold text-slate-800">Asset: {assignment.asset_name} ({assignment.asset_code})</p>
            <p className="text-slate-500">Assigned to: {assignment.first_name} {assignment.last_name}</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Return Condition *
            </label>
            <select
              className="w-full text-sm border rounded-xl px-3 py-2 bg-transparent outline-none focus:border-blue-600"
              value={form.return_condition}
              onChange={(e) => setForm({ ...form, return_condition: e.target.value as any })}
            >
              <option value="good">Good (Available for stock)</option>
              <option value="damaged">Damaged (Requires repair/devaluation)</option>
              <option value="lost">Lost / Stolen (Write-off)</option>
            </select>
          </div>

          {form.return_condition !== 'good' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Recovery Amount (Deduction)
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.recovery_amount}
                onChange={(e) => setForm({ ...form, recovery_amount: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Amount to deduct from employee salary/FnF settlement for damage or loss.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Notes
            </label>
            <Textarea
              rows={3}
              placeholder="Return remarks..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 text-white hover:bg-blue-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Return
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
