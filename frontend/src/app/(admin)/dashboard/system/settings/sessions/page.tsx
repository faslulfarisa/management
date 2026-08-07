'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/sessions');
      setSessions(data.data);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this session?')) return;
    try {
      await api.delete(`/auth/sessions/${id}`);
      fetchSessions();
    } catch (err) {
      alert('Failed to revoke session');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Active Sessions</h1>
        <p className="text-muted-foreground">Manage your active login sessions</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Sessions ({sessions.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8">Loading...</p>
          ) : sessions.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No active sessions</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{s.device_info || 'Unknown Device'}</p>
                        <p className="text-sm text-muted-foreground">
                          IP: {s.ip_address || 'Unknown'} •
                          Expires: {s.expires_at ? new Date(s.expires_at).toLocaleString() : 'N/A'}
                        </p>
                        {s.created_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Created: {new Date(s.created_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => handleRevoke(s.id)}>
                        Revoke
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
