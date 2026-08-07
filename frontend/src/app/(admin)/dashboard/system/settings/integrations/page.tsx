'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plug, Webhook, RefreshCw, Plus, Trash2, Clock, Power, PowerOff, X, Loader2,
} from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

/* ── Shared helpers ──────────────────────────────────────────────── */

function StatCard({ label, value, sub, gradient, icon: Icon }: {
  label: string; value: string | number; sub?: string; gradient: string; icon: React.ElementType;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg animate-slide-up ${gradient}`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="relative z-10">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-3xl font-bold tracking-tight mb-0.5">{value}</p>
        <p className="text-sm font-medium opacity-90">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function Spinner({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
      <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <p className="text-sm text-muted-foreground font-medium">{message}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Icon className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
            active === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Integration Drawer ──────────────────────────────────────────── */
function IntegrationDrawer({ integrationType, integrationName, onClose, onSaved }: {
  integrationType: string; integrationName: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(integrationName);
  const [deviceSn, setDeviceSn] = useState('');
  const [configJson, setConfigJson] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (integrationType === 'zkteco' && !deviceSn.trim()) e.deviceSn = 'Device serial number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const config = integrationType === 'zkteco' ? { device_sn: deviceSn } : JSON.parse(configJson || '{}');
      await api.post('/integrations', { name, type: integrationType, config });
      onSaved(); onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to create integration' });
    } finally { setSaving(false); }
  };

  const admsHost = ((api.defaults.baseURL || '').replace('/api/v1', '') || 'http://localhost:3001') + '/integrations/zkteco';
  const admsPort = ((api.defaults.baseURL || '').split(':')[2]?.split('/')[0] || '3001');

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Configure {integrationName}</h2>
            <p className="text-xs text-muted-foreground">Connect and set up this integration</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          {integrationType === 'zkteco' ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Device Name / Location <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Front Gates Terminal" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-red-400' : 'border-border'}`} />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Device Serial Number (SN) <span className="text-red-500">*</span></label>
                <input value={deviceSn} onChange={e => setDeviceSn(e.target.value)} placeholder="e.g. ZK1234567890" className={`w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.deviceSn ? 'border-red-400' : 'border-border'}`} />
                {errors.deviceSn && <p className="text-xs text-red-500 mt-1">{errors.deviceSn}</p>}
              </div>
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 text-sm space-y-2">
                <p className="font-semibold text-primary flex items-center gap-1.5">🔌 How to connect your physical ZKTeco device:</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                  <li>Enter your biometric device menu, navigate to <strong>Comm. / Network</strong> settings.</li>
                  <li>Find the <strong>Cloud Server Settings / ADMS / WDMS</strong> section.</li>
                  <li>Enable Domain Name and set the <strong>Server Address</strong> to: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs text-foreground font-semibold">{admsHost}</code></li>
                  <li>Set the <strong>Server Port</strong> to: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs text-foreground font-semibold">{admsPort}</code></li>
                  <li>Ensure user registers on the biometric device with their <strong>Employee Code</strong> matching their Ai-HRMS employee record.</li>
                </ol>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Name <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Integration name" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-red-400' : 'border-border'}`} />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Config (JSON)</label>
                <textarea value={configJson} onChange={e => setConfigJson(e.target.value)} rows={4} placeholder="{}" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Enable Integration
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Webhook Drawer ──────────────────────────────────────────────── */
function WebhookDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ url: '', events: '', secret: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.url.trim()) e.url = 'Webhook URL is required';
    else if (!/^https?:\/\/.+/.test(form.url)) e.url = 'Enter a valid URL starting with http:// or https://';
    if (!form.events.trim()) e.events = 'At least one event is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/integrations/webhooks', {
        ...form,
        events: form.events.split(',').map(e => e.trim()).filter(Boolean),
      });
      onSaved(); onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || 'Failed to create webhook' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Add Webhook</h2>
            <p className="text-xs text-muted-foreground">Register a new webhook endpoint</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">URL <span className="text-red-500">*</span></label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com/webhook" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.url ? 'border-red-400' : 'border-border'}`} />
            {errors.url && <p className="text-xs text-red-500 mt-1">{errors.url}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Events <span className="text-red-500">*</span></label>
            <input value={form.events} onChange={e => setForm(f => ({ ...f, events: e.target.value }))} placeholder="e.g. attendance.created, leave.approved" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.events ? 'border-red-400' : 'border-border'}`} />
            {errors.events && <p className="text-xs text-red-500 mt-1">{errors.events}</p>}
            <p className="text-xs text-muted-foreground mt-1">Comma-separated list of event names</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Secret</label>
            <input value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="Optional signing secret" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />} Create Webhook
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('integrations');
  const [selectedIntegration, setSelectedIntegration] = useState<{ type: string; name: string } | null>(null);
  const [showWebhookDrawer, setShowWebhookDrawer] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [intRes, availRes, whRes, logsRes] = await Promise.all([
        api.get('/integrations'),
        api.get('/integrations/available'),
        api.get('/integrations/webhooks'),
        api.get('/integrations/sync-logs'),
      ]);
      setIntegrations(intRes.data.data);
      setAvailable(availRes.data.data);
      setWebhooks(whRes.data.data);
      setSyncLogs(logsRes.data.data);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleToggle = async (id: string, isActive: boolean) => {
    try { await api.put(`/integrations/${id}/toggle`, { is_active: !isActive }); fetchData(); } catch { alert('Failed to toggle'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this integration?')) return;
    try { await api.delete(`/integrations/${id}`); fetchData(); } catch { alert('Failed'); }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    try { await api.delete(`/integrations/webhooks/${id}`); fetchData(); } catch { alert('Failed'); }
  };

  if (loading) return <Spinner message="Loading integrations…" />;

  return (
    <>
      {selectedIntegration && (
        <IntegrationDrawer
          integrationType={selectedIntegration.type}
          integrationName={selectedIntegration.name}
          onClose={() => setSelectedIntegration(null)}
          onSaved={fetchData}
        />
      )}
      {showWebhookDrawer && (
        <WebhookDrawer
          onClose={() => setShowWebhookDrawer(false)}
          onSaved={fetchData}
        />
      )}

      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Integrations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Connect third-party services and manage webhooks</p>
          </div>
          <button onClick={fetchData} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Active Integrations" value={integrations.filter(i => i.is_active).length} gradient="card-gradient-blue"    icon={Plug}    sub="Connected services" />
          <StatCard label="Webhooks"            value={webhooks.length}                               gradient="card-gradient-purple"  icon={Webhook} sub="Registered endpoints" />
          <StatCard label="Last Sync"           value={syncLogs.length > 0 ? new Date(syncLogs[0].started_at).toLocaleDateString() : '—'} gradient="card-gradient-emerald" icon={RefreshCw} sub={syncLogs.length > 0 ? 'Recent sync' : 'Never synced'} />
        </div>

        {/* Tabs */}
        <TabBar tabs={[{ key: 'integrations', label: 'Integrations' }, { key: 'webhooks', label: 'Webhooks' }, { key: 'logs', label: 'Sync Logs' }]} active={activeTab} onChange={setActiveTab} />

        {/* Integrations tab */}
        {activeTab === 'integrations' && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>Available Integrations</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {available.map((integration) => {
                  const connected = integrations.find(i => i.type === integration.type);
                  return (
                    <div key={integration.type} className="p-4 bg-muted/20 rounded-xl border border-border/50 hover:border-border transition-colors">
                      <p className="text-2xl mb-2">{integration.icon || ''}</p>
                      <p className="font-medium text-foreground">{integration.name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{integration.description}</p>
                      {connected ? (
                        <div className="mt-3 space-y-2">
                          {connected.type === 'zkteco' && (
                            <div className="text-xs text-muted-foreground bg-muted/60 p-2.5 rounded-lg border border-border space-y-1">
                              <p><strong>Device SN:</strong> <span className="font-mono text-foreground">{connected.config?.device_sn || 'Not set'}</span></p>
                              <p className="truncate"><strong>ADMS Host:</strong> <span className="font-mono text-foreground">{((api.defaults.baseURL || '').replace('/api/v1', '') || 'http://localhost:3001') + '/integrations/zkteco'}</span></p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" variant={connected.is_active ? 'default' : 'outline'} onClick={() => handleToggle(connected.id, connected.is_active)}>
                              {connected.is_active ? <><Power className="w-3 h-3 mr-1" /> Active</> : <><PowerOff className="w-3 h-3 mr-1" /> Inactive</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(connected.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" className="mt-3 w-full" onClick={() => setSelectedIntegration({ type: integration.type, name: integration.name })}>Connect</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Webhooks tab */}
        {activeTab === 'webhooks' && (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Webhook Endpoints
                <button onClick={() => setShowWebhookDrawer(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
                  <Plus className="w-3.5 h-3.5" /> Add Webhook
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {webhooks.length === 0 ? (
                <EmptyState icon={Webhook} message="No webhooks configured" />
              ) : (
                <div className="rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>URL</TableHead>
                        <TableHead>Events</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhooks.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="font-mono text-xs text-foreground">{w.url}</TableCell>
                          <TableCell className="text-muted-foreground">{w.events?.join(', ')}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteWebhook(w.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sync Logs tab */}
        {activeTab === 'logs' && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>Sync Logs</CardTitle></CardHeader>
            <CardContent>
              {syncLogs.length === 0 ? (
                <EmptyState icon={Clock} message="No sync logs" />
              ) : (
                <div className="rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Integration</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium text-foreground">{log.integration_name || log.integration_id}</TableCell>
                          <TableCell className="capitalize">{log.direction}</TableCell>
                          <TableCell className="text-muted-foreground">{log.entity_type}</TableCell>
                          <TableCell>{log.records_synced}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                              {log.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{new Date(log.started_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
