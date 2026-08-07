'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Loader2, Send } from 'lucide-react';
import { vacanciesApi, VacancyComment } from '@/lib/vacancies-api';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';

export function VacancyComments({ vacancyId }: { vacancyId: string }) {
  const [comments, setComments] = useState<VacancyComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const load = () => {
    vacanciesApi.comments.list(vacancyId).then(setComments).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [vacancyId]);

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      await vacanciesApi.comments.add(vacancyId, text.trim());
      setText('');
      load();
    } catch {
      /* surfaced via the empty-comment-box remaining filled */
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Comments</h3>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="bg-muted/30 rounded-lg p-3">
              <p className="text-sm text-foreground">{c.comment}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {c.author_email || 'User'} • {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      )}
      <Can permission={PERMISSIONS.RECRUITMENT_COMMENT}>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') post(); }}
            placeholder="Add a comment…"
            className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={post} disabled={posting || !text.trim()} className="bg-primary text-white rounded-xl px-3 py-2 disabled:opacity-50">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </Can>
    </div>
  );
}
