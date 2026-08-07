'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { interviewsApi, Interview } from '@/lib/interviews-api';

const RECOMMENDATIONS = ['strong_yes', 'yes', 'neutral', 'no', 'strong_no'];

/** A single panelist submits their own scorecard entry for an interview round. */
export function InterviewFeedbackModal({ interview, onClose, onSaved }: { interview: Interview; onClose: () => void; onSaved: () => void }) {
  const [rating, setRating] = useState(3);
  const [recommendation, setRecommendation] = useState('neutral');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await interviewsApi.submitFeedback(interview.id, rating, recommendation, comments || undefined);
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Submit Interview Feedback</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Rating (1–5)</label>
            <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(parseInt(e.target.value, 10) || 1)} className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Recommendation</label>
            <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 text-sm capitalize">
              {RECOMMENDATIONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Comments</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} className="w-full border border-border rounded-xl px-3 py-2 text-sm resize-none" />
          </div>
        </div>
        <div className="border-t border-border px-5 py-4 flex justify-end gap-2">
          <button onClick={onClose} className="border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Submit
          </button>
        </div>
      </div>
    </div>
  );
}
