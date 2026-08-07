'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, LayoutGrid, List as ListIcon, Loader2, FileText, Eye, Download, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { complianceDocumentsApi, ComplianceDocument } from '@/lib/compliance-api';
import { StatusBadge, ConfidentialityBadge, ExpiryBadge } from './badges';
import { DocumentDrawer } from './document-drawer';
import { DocumentDetailDrawer } from './document-detail-drawer';

const STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'expired', 'renewal_pending', 'archived'];

export function DocumentExplorer({
  scope, employeeId, groupLabels, title, description, allowCreate = true,
}: {
  scope: 'company' | 'employee';
  employeeId?: string;
  groupLabels?: string[];
  title?: string;
  description?: string;
  allowCreate?: boolean;
}) {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingDocument, setEditingDocument] = useState<ComplianceDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<ComplianceDocument | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await complianceDocumentsApi.list({ scope, employeeId, q: q || undefined, status: status || undefined, limit: 200 });
      const rows = groupLabels?.length ? res.data.filter((d) => groupLabels.includes(d.category_group_label || '')) : res.data;
      setDocuments(rows);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [scope, employeeId, q, status, groupLabels]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const download = async (id: string) => {
    try {
      const { url } = await complianceDocumentsApi.download(id);
      window.open(url, '_blank');
    } catch {
      alert('Unable to generate download link');
    }
  };

  const handleDelete = async () => {
    if (!deletingDocument) return;
    try {
      await complianceDocumentsApi.remove(deletingDocument.id);
      setDeletingDocument(null);
      fetchData();
    } catch (err) {
      alert('Failed to delete document');
    }
  };

  return (
    <div className="space-y-4">
      {showCreate && (
        <DocumentDrawer scope={scope} employeeId={employeeId} onClose={() => setShowCreate(false)} onSaved={fetchData} />
      )}
      {editingDocument && (
        <DocumentDrawer scope={scope} employeeId={employeeId} onClose={() => setEditingDocument(null)} onSaved={fetchData} editData={editingDocument} />
      )}
      {deletingDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingDocument(null)} />
          <div className="relative bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">Delete Document</h3>
            <p className="text-sm text-muted-foreground mb-6">Are you sure you want to delete &quot;{deletingDocument.title}&quot;? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingDocument(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}
      {selectedId && (
        <DocumentDetailDrawer documentId={selectedId} onClose={() => setSelectedId(null)} onChanged={fetchData} />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          {title && <h2 className="text-lg font-bold text-foreground">{title}</h2>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {allowCreate && (
          <Button onClick={() => setShowCreate(true)} className="gap-1.5 ml-auto"><Plus className="w-4 h-4" /> Add Document</Button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, description, document number…"
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1 ml-auto">
          <button onClick={() => setView('list')} className={`p-1.5 rounded-lg ${view === 'list' ? 'bg-white shadow' : ''}`}><ListIcon className="w-4 h-4" /></button>
          <button onClick={() => setView('grid')} className={`p-1.5 rounded-lg ${view === 'grid' ? 'bg-white shadow' : ''}`}><LayoutGrid className="w-4 h-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : documents.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">No documents found.</CardContent></Card>
      ) : view === 'list' ? (
        <Card>
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="text-left p-3 font-medium normal-case">Title</TableHead>
                <TableHead className="text-left p-3 font-medium normal-case">Category</TableHead>
                <TableHead className="text-left p-3 font-medium normal-case">Status</TableHead>
                <TableHead className="text-left p-3 font-medium normal-case">Confidentiality</TableHead>
                <TableHead className="text-left p-3 font-medium normal-case">Expiry</TableHead>
                <TableHead className="text-left p-3 font-medium normal-case">Version</TableHead>
                <TableHead className="text-left p-3 font-medium normal-case">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedId(d.id)}>
                  <TableCell className="p-3 font-medium">{d.title}</TableCell>
                  <TableCell className="p-3 text-muted-foreground">{d.category_name || '—'}</TableCell>
                  <TableCell className="p-3"><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="p-3"><ConfidentialityBadge level={d.confidentiality_level} /></TableCell>
                  <TableCell className="p-3"><ExpiryBadge expiryDate={d.expiry_date} /></TableCell>
                  <TableCell className="p-3 text-muted-foreground">v{d.current_version}</TableCell>
                  <TableCell className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedId(d.id)} className="text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                      {d.file_url && <button onClick={() => download(d.id)} className="text-muted-foreground hover:text-foreground"><Download className="w-4 h-4" /></button>}
                      {allowCreate && (
                        <>
                          <button onClick={() => setEditingDocument(d)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => setDeletingDocument(d)} className="text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((d) => (
            <Card key={d.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedId(d.id)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <p className="font-medium text-sm truncate">{d.title}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">{d.category_name || '—'}</p>
                <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={d.status} /><ConfidentialityBadge level={d.confidentiality_level} /></div>
                <ExpiryBadge expiryDate={d.expiry_date} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
