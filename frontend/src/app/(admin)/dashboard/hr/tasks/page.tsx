'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import {
  ClipboardCheck, Plus, Search, X, Loader2, RefreshCw,
  Flag, Calendar, User2, ChevronDown, ChevronRight, AlertCircle, CheckCircle2,
  Clock, CircleDashed, Ban, Pencil, Trash2, MoreHorizontal,
  TrendingUp, ListTodo, Flame, Eye,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────── */
type TaskStatus   = 'todo' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Task {
  id: string;
  parent_id?: string | null;
  tenant_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_to_employee_id?: string;
  created_by: string;
  created_by_name?: string;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: string;
  todo: string;
  in_progress: string;
  done: string;
  cancelled: string;
  overdue: string;
}

/* ─────────────────────────────────────────────────────────────────────────
   Config maps
───────────────────────────────────────────────────────────────────────── */
const STATUS_CFG: Record<TaskStatus, { label: string; dot: string; pill: string; icon: React.ElementType }> = {
  todo:        { label: 'Pending',     dot: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-600 border-slate-200',     icon: CircleDashed },
  in_progress: { label: 'In Progress', dot: 'bg-amber-400',   pill: 'bg-amber-50 text-amber-700 border-amber-200',      icon: Clock },
  done:        { label: 'Completed',   dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  cancelled:   { label: 'Cancelled',   dot: 'bg-red-400',     pill: 'bg-red-50 text-red-600 border-red-200',             icon: Ban },
};

const PRIORITY_CFG: Record<TaskPriority, { label: string; pill: string; dot: string }> = {
  urgent: { label: 'Urgent', pill: 'bg-red-50 text-red-700 border-red-200',       dot: 'bg-red-500' },
  high:   { label: 'High',   pill: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  medium: { label: 'Medium', pill: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400' },
  low:    { label: 'Low',    pill: 'bg-sky-50 text-sky-700 border-sky-200',        dot: 'bg-sky-400' },
};

/* Placeholder departments list — replace with API call if needed */
const DEPARTMENTS = [
  'Engineering', 'Human Resources', 'Finance', 'Operations',
  'Marketing', 'Sales', 'Customer Success', 'Product',
];



/* ─────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────── */
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function isOverdue(due?: string, status?: TaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  return new Date(due) < new Date(new Date().toDateString());
}
function avatarColor(name = '') {
  const colors = [
    'from-violet-500 to-indigo-600', 'from-rose-500 to-pink-600',
    'from-amber-500 to-orange-600', 'from-teal-500 to-cyan-600',
    'from-sky-500 to-blue-600', 'from-emerald-500 to-green-600',
  ];
  return colors[name.charCodeAt(0) % colors.length];
}
function taskId(idx: number, id: string) {
  return `TSK-${id.substring(0, 6).toUpperCase()}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Badge atoms
───────────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: TaskStatus }) {
  const c = STATUS_CFG[status] || STATUS_CFG.todo;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${c.pill}`}>
      <Icon className="w-3 h-3" />{c.label}
    </span>
  );
}
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const c = PRIORITY_CFG[priority] || PRIORITY_CFG.medium;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${c.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   KPI Card
───────────────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, gradient, icon: Icon, sub }: {
  label: string; value: number | string; gradient: string; icon: React.ElementType; sub?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}>
      {/* Decorative ring */}
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
      <div className="absolute -bottom-6 -right-2 w-24 h-24 rounded-full bg-white/5" />
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/70 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold leading-none">{value}</p>
          {sub && <p className="text-xs text-white/60 mt-1.5">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Task Drawer (Create / Edit)
───────────────────────────────────────────────────────────────────────── */
function TaskDrawer({
  task, employees, onClose, onSaved,
}: {
  task?: Task | null;
  employees: { id: string; name: string; employee_id?: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!task;
  const [form, setForm] = useState({
    title:       task?.title ?? '',
    description: task?.description ?? '',
    status:      task?.status ?? 'todo',
    priority:    task?.priority ?? 'medium',
    assigned_to: task?.assigned_to ?? '',
    due_date:    task?.due_date?.split('T')[0] ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [subtasks, setSubtasks] = useState<any[]>([]);

  const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => { const n = { ...e }; delete n[k]; return n; });
  }

  function addSubtask() {
    setSubtasks(s => [...s, { title: '', description: '', assigned_to: '', due_date: '', priority: 'medium', status: 'todo' }]);
    setErrors(e => { const n = { ...e }; delete n._; return n; });
  }
  function updateSubtask(idx: number, k: string, v: string) {
    setSubtasks(s => {
      const copy = [...s];
      copy[idx] = { ...copy[idx], [k]: v };
      return copy;
    });
    setErrors(e => { const n = { ...e }; delete n[`subtask_${idx}`]; return n; });
  }
  function removeSubtask(idx: number) {
    setSubtasks(s => s.filter((_, i) => i !== idx));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Task title is required';
    if (form.due_date && form.due_date < todayStr) e.due_date = 'Due date cannot be in the past.';
    
    if (!isEdit) {
      if (subtasks.length === 0) e._ = 'A task must have at least one subtask.';
      subtasks.forEach((sub, idx) => {
        if (!sub.title.trim()) e[`subtask_${idx}`] = 'Subtask title is required';
        if (sub.due_date && sub.due_date < todayStr) e[`subtask_date_${idx}`] = 'Due date cannot be in the past.';
      });
    }
    setErrors(e);
    return !Object.keys(e).length;
  }
  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        title:       form.title.trim(),
        description: form.description.trim() || undefined,
        status:      form.status,
        priority:    form.priority,
        assigned_to: form.assigned_to || undefined,
        due_date:    form.due_date || undefined,
        ...( !isEdit ? { subtasks } : {} )
      };
      if (isEdit) await api.put(`/tasks/${task!.id}`, payload);
      else         await api.post('/tasks', payload);
      onSaved(); onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.message || 'Failed to save task' });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Drawer header */}
        <div className="relative overflow-hidden px-6 py-5 shrink-0"
          style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%) 0%, hsl(230 70% 58%) 100%)' }}>
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h2 className="text-base font-bold text-white">
                {isEdit ? 'Edit Task' : 'Add New Task'}
              </h2>
              <p className="text-xs text-white/70 mt-0.5">
                {isEdit ? 'Update task details below' : 'Fill in task details to assign'}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errors._ && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{errors._}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="e.g. Onboard New Engineering Cohort"
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow ${errors.title ? 'border-red-400 bg-red-50' : 'border-border bg-white hover:border-slate-300'}`} />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>
          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} placeholder="Add a brief description…"
              className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none hover:border-slate-300 transition-shadow" />
          </div>
          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Status</label>
              <div className="relative">
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  className="w-full border border-border rounded-xl pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                  <option value="todo">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Priority</label>
              <div className="relative">
                <select value={form.priority} onChange={e => set('priority', e.target.value)}
                  className="w-full border border-border rounded-xl pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
          {/* Assigned To */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Assign To (Employee)</label>
            <div className="relative">
              <User2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
                className="w-full border border-border rounded-xl pl-10 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                <option value="">— Unassigned —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{emp.employee_id ? ` (${emp.employee_id})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {/* Due Date */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Due Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input type="date" min={todayStr} value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.due_date ? 'border-red-400 bg-red-50' : 'border-border bg-white hover:border-slate-300'}`} />
            </div>
            {errors.due_date && <p className="text-xs text-red-500 mt-1">{errors.due_date}</p>}
          </div>

          {!isEdit && (
            <div className="mt-6 border-t border-border pt-6">
              <div className="flex items-center justify-between mb-4">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Subtasks <span className="text-red-500">*</span></label>
                <button type="button" onClick={addSubtask} className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Subtask
                </button>
              </div>
              {subtasks.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-border bg-slate-50 text-center">
                  <p className="text-xs text-muted-foreground">You must add at least one subtask.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {subtasks.map((sub, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border ${errors[`subtask_${idx}`] ? 'border-red-300 bg-red-50/50' : 'border-border bg-slate-50/50'} relative`}>
                      <button type="button" onClick={() => removeSubtask(idx)} className="absolute right-2 top-2 w-6 h-6 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="pr-6 space-y-3">
                        <div>
                          <input type="text" value={sub.title} onChange={e => updateSubtask(idx, 'title', e.target.value)} placeholder="Subtask title" className="w-full border-b border-transparent hover:border-slate-300 focus:border-primary bg-transparent text-sm focus:outline-none py-1 font-medium transition-colors" />
                          {errors[`subtask_${idx}`] && <p className="text-[10px] text-red-500 mt-1">{errors[`subtask_${idx}`]}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <select value={sub.assigned_to} onChange={e => updateSubtask(idx, 'assigned_to', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/30">
                            <option value="">Unassigned</option>
                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                          </select>
                          <div>
                            <input type="date" min={todayStr} value={sub.due_date} onChange={e => updateSubtask(idx, 'due_date', e.target.value)} className={`w-full border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors[`subtask_date_${idx}`] ? 'border-red-400 bg-red-50' : 'border-border'}`} />
                            {errors[`subtask_date_${idx}`] && <p className="text-[10px] text-red-500 mt-1">{errors[`subtask_date_${idx}`]}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3 bg-slate-50/70">
          <Button onClick={save} disabled={saving}
            className="flex-1 h-10 font-semibold"
            style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1 h-10">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   View Task Drawer
───────────────────────────────────────────────────────────────────────── */
function ViewTaskDrawer({ task, subtasks, onClose }: { task: Task; subtasks: Task[]; onClose: () => void }) {
  const Icon = STATUS_CFG[task.status]?.icon || CircleDashed;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="relative overflow-hidden px-6 py-5 shrink-0 bg-slate-900">
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h2 className="text-base font-bold text-white truncate max-w-[280px]">{task.title}</h2>
              <p className="text-xs text-white/70 mt-0.5">Task Details</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h4>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{task.description || <span className="text-muted-foreground italic">No description provided.</span>}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-3 rounded-xl border border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Status</p>
              <StatusBadge status={task.status} />
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Priority</p>
              <PriorityBadge priority={task.priority} />
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Assignee</p>
              <p className="text-sm font-semibold text-foreground truncate">{task.assigned_to_name || 'Unassigned'}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Due Date</p>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {fmtDate(task.due_date)}
              </p>
            </div>
          </div>

          {subtasks.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Subtasks ({subtasks.length})</h4>
              <div className="space-y-2">
                {subtasks.map(s => (
                  <div key={s.id} className="p-3 bg-white border border-border rounded-xl shadow-sm">
                    <p className="text-sm font-semibold text-foreground mb-1">{s.title}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <StatusBadge status={s.status} />
                      <PriorityBadge priority={s.priority} />
                      {s.assigned_to_name && (
                        <span className="text-xs text-muted-foreground border-l border-border pl-2">
                          {s.assigned_to_name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Cancel-confirm modal
───────────────────────────────────────────────────────────────────────── */
function CancelConfirm({ task, onCancel, onDeleted }: { task: Task; onCancel: () => void; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    try { await api.delete(`/tasks/${task.id}`); onDeleted(); }
    catch { setLoading(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-7 w-full max-w-sm text-center animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1.5">Cancel this Task?</h3>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          "<span className="font-semibold text-foreground">{task.title}</span>" will be marked as <span className="font-semibold text-red-600">Cancelled</span>. This can be reversed by editing the task.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">Keep It</Button>
          <Button onClick={go} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Cancel'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Row Actions dropdown
───────────────────────────────────────────────────────────────────────── */
function RowMenu({ task, canEdit, canDelete, onEdit, onDelete, onView }: {
  task: Task; canEdit: boolean; canDelete: boolean;
  onEdit: () => void; onDelete: () => void; onView: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  useEffect(() => {
    function h(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    
    if (open) {
      document.addEventListener('mousedown', h);
      const updatePos = () => {
        if (btnRef.current) {
          const rect = btnRef.current.getBoundingClientRect();
          setCoords({
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right
          });
        }
      };
      updatePos();
      window.addEventListener('scroll', updatePos, true);
      window.addEventListener('resize', updatePos);
      return () => {
        document.removeEventListener('mousedown', h);
        window.removeEventListener('scroll', updatePos, true);
        window.removeEventListener('resize', updatePos);
      };
    }
  }, [open]);

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative z-10 focus:outline-none focus:ring-0 ${open ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={{ top: coords.top, right: coords.right, position: 'fixed', zIndex: 9999 }}
             className="w-40 bg-white border border-border rounded-xl shadow-lg overflow-hidden animate-fade-in">
          {canEdit && (
            <button onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <Pencil className="w-3.5 h-3.5 text-slate-400" /> Edit Task
            </button>
          )}
          <button onClick={() => { setOpen(false); onView(); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
            <Eye className="w-3.5 h-3.5 text-slate-400" /> View Detail
          </button>
          {canDelete && task.status !== 'cancelled' && (
            <>
              <div className="h-px bg-border mx-3" />
              <button onClick={() => { setOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Cancel Task
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Main Page
───────────────────────────────────────────────────────────────────────── */
export default function TasksPage() {
  const canCreate = useCan(PERMISSIONS.TASKS_CREATE);
  const canEdit   = useCan(PERMISSIONS.TASKS_EDIT);
  const canDelete = useCan(PERMISSIONS.TASKS_DELETE);

  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string; employee_id?: string }[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [search,          setSearch]          = useState('');
  const [filterStatus,    setFilterStatus]    = useState('');
  const [filterPriority,  setFilterPriority]  = useState('');
  const [filterDept,      setFilterDept]      = useState('');

  const [drawerOpen,      setDrawerOpen]      = useState(false);
  const [editTask,        setEditTask]        = useState<Task | null>(null);
  const [viewTask,        setViewTask]        = useState<Task | null>(null);
  const [deleteTask,      setDeleteTask]      = useState<Task | null>(null);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggleRow = (id: string) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  const openCreate = () => {
    setEditTask(null);
    setDrawerOpen(true);
  };

  /* Load tasks + stats */
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (search)         p.set('search',   search);
      if (filterStatus)   p.set('status',   filterStatus);
      if (filterPriority) p.set('priority', filterPriority);
      const [tr, sr] = await Promise.all([
        api.get(`/tasks?${p}`),
        api.get('/tasks/stats'),
      ]);
      const rows: Task[] = tr.data?.data ?? tr.data ?? [];
      setTasks(rows);
      setStats(sr.data);
    } catch {
      setTasks([]);
    } finally { setLoading(false); }
  }, [search, filterStatus, filterPriority]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  /* Load employees for the drawer */
  useEffect(() => {
    api.get('/users?limit=500').then(r => {
      const rows = r.data?.data ?? r.data ?? [];
      setEmployees(rows.map((u: any) => {
        const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        return {
          id:          u.id,
          name:        fullName || u.email,
          employee_id: u.employee_code,
        };
      }));
    }).catch(() => {});
  }, []);

  const hasFilters = search || filterStatus || filterPriority || filterDept;

  const filteredTasks = tasks.filter(task => {
    if (!filterDept) return true;
    return (task as any).assigned_to_department === filterDept;
  });

  const mainTasks = filteredTasks.filter(t => !t.parent_id);
  const subTasksMap = filteredTasks.filter(t => t.parent_id).reduce((acc, t) => {
    if (!acc[t.parent_id!]) acc[t.parent_id!] = [];
    acc[t.parent_id!].push(t);
    return acc;
  }, {} as Record<string, Task[]>);



  /* Derived stat numbers */
  const statTotal  = parseInt(stats?.total      ?? '0');
  const statWip    = parseInt(stats?.in_progress ?? '0');
  const statDone   = parseInt(stats?.done      ?? '0');
  const statOver   = parseInt(stats?.overdue ?? '0');

  return (
    <div className="min-h-screen pb-32 bg-gradient-to-br from-slate-50 via-white to-blue-50/20">

      {/* ── Sticky Page Header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-border/50 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%) 0%, hsl(230 70% 58%))' }}>
              <ClipboardCheck className="w-5.5 h-5.5 w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight tracking-tight">Task Master</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Assign, track, and manage employee responsibilities.</p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button onClick={loadTasks}
              className="p-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canCreate && (
              <Button onClick={openCreate}
                className="gap-2 h-9 px-4 font-semibold text-sm shadow-md"
                style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}>
                <Plus className="w-4 h-4" /> Add Task
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* ── KPI Strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Total Tasks"   value={statTotal} gradient="card-gradient-blue"    icon={ListTodo}     sub="All tasks" />
          <KpiCard label="In Progress"   value={statWip}   gradient="card-gradient-amber"   icon={TrendingUp}   sub="Currently active" />
          <KpiCard label="Completed"     value={statDone}  gradient="card-gradient-emerald" icon={CheckCircle2} sub="Closed tasks" />
          <KpiCard label="Overdue"       value={statOver}  gradient="card-gradient-red"     icon={Flame}        sub="Past due date" />
        </div>

        {/* ── Filters Row ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by task name, code, or assignee..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-xl bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all" />
            </div>

            {/* Status */}
            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="pl-4 pr-8 py-2 text-sm border border-border rounded-xl bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer min-w-[140px]">
                <option value="">All Statuses</option>
                <option value="todo">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Priority */}
            <div className="relative">
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                className="pl-4 pr-8 py-2 text-sm border border-border rounded-xl bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer min-w-[140px]">
                <option value="">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Department */}
            <div className="relative">
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                className="pl-4 pr-8 py-2 text-sm border border-border rounded-xl bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer min-w-[160px]">
                <option value="">All Departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {hasFilters && (
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterPriority(''); setFilterDept(''); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}

            {/* Record count */}
            <span className="ml-auto text-xs text-muted-foreground bg-slate-100 px-3 py-1.5 rounded-full font-medium">
              {mainTasks.length} task{mainTasks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Task Master Table ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          {/* Table header bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary/70" />
              <h2 className="text-sm font-semibold text-foreground">Task Master</h2>
              <span className="text-xs text-muted-foreground">— All Assignments</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
                <p className="text-sm text-muted-foreground">Loading tasks…</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-center px-5 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest w-28">Task ID</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Task Name</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Assignee (Employee)</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest w-28">Priority</th>
                    <th className="text-center px-5 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest w-32">Due Date</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest w-36">Status</th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {mainTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
                            <ClipboardCheck className="w-8 h-8 text-slate-300" />
                          </div>
                          <h3 className="text-sm font-semibold text-foreground mb-1">No tasks found</h3>
                          <p className="text-xs text-muted-foreground mb-5">
                            {hasFilters ? 'Try adjusting your filters.' : 'Click "+ Add Task" to create your first task.'}
                          </p>
                          {canCreate && !hasFilters && (
                            <Button size="sm" onClick={openCreate}
                              className="gap-1.5 text-white"
                              style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}>
                              <Plus className="w-3.5 h-3.5" /> Add Task
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : mainTasks.map((task, idx) => {
                    const over = isOverdue(task.due_date, task.status);
                    const tid  = taskId(idx, task.id);
                    const initials = task.assigned_to_name
                      ? task.assigned_to_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                      : '?';
                    const subtasksList = subTasksMap[task.id] ?? [];
                    const hasSubtasks = subtasksList.length > 0;
                    const isExpanded = !!expandedRows[task.id];

                    return (
                      <React.Fragment key={task.id}>
                        <tr className="hover:bg-blue-50/30 transition-colors group">
                          {/* Task ID */}
                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {hasSubtasks ? (
                                <button onClick={() => toggleRow(task.id)} className="p-1 hover:bg-slate-100 rounded transition-colors shrink-0">
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                                </button>
                              ) : (
                                <div className="w-6 shrink-0" />
                              )}
                              <span className="font-mono text-[11px] font-semibold text-primary/70 bg-primary/5 px-2 py-0.5 rounded-md">
                                {tid}
                              </span>
                            </div>
                          </td>

                          {/* Task Name */}
                          <td className="px-5 py-3.5 max-w-[280px]">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-foreground truncate text-[13px]">{task.title}</p>
                              {hasSubtasks && (
                                <span className="text-[10px] px-1.5 py-0.5 whitespace-nowrap bg-slate-100 text-slate-500 rounded border border-slate-200">
                                  {subtasksList.length} subtask{subtasksList.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
                            )}
                          </td>

                          {/* Assignee */}
                          <td className="px-5 py-3.5">
                            {task.assigned_to_name ? (
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColor(task.assigned_to_name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[13px] font-medium text-foreground truncate">{task.assigned_to_name}</p>
                                  {task.assigned_to_employee_id && (
                                    <p className="text-[10px] text-muted-foreground font-mono">{task.assigned_to_employee_id}</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <div className="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center">
                                  <User2 className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs italic">Unassigned</span>
                              </div>
                            )}
                          </td>

                          {/* Priority */}
                          <td className="px-5 py-3.5">
                            <PriorityBadge priority={task.priority as TaskPriority} />
                          </td>

                          {/* Due Date */}
                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            {task.due_date ? (
                              <div className={`inline-flex items-center justify-center gap-1.5 text-xs font-medium ${over ? 'text-red-600' : 'text-slate-600'}`}>
                                <Calendar className="w-3.5 h-3.5 shrink-0" />
                                <span>{fmtDate(task.due_date)}</span>
                                {over && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3.5">
                            <StatusBadge status={task.status as TaskStatus} />
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <RowMenu
                                task={task}
                                canEdit={canEdit}
                                canDelete={canDelete}
                                onEdit={() => { setEditTask(task); setDrawerOpen(true); }}
                                onDelete={() => setDeleteTask(task)}
                                onView={() => setViewTask(task)}
                              />
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Subtasks */}
                        {isExpanded && subtasksList.map((subtask, subIdx) => {
                          const subTid = `${tid}.${subIdx + 1}`;
                          const subOver = isOverdue(subtask.due_date, subtask.status);
                          const subInitials = subtask.assigned_to_name
                            ? subtask.assigned_to_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                            : '?';

                          return (
                            <tr key={subtask.id} className="bg-slate-50/40 hover:bg-blue-50/10 transition-colors group text-xs border-b border-border/20 animate-fade-in">
                              {/* Subtask ID */}
                              <td className="px-5 py-2.5 text-center whitespace-nowrap pl-11">
                                <span className="font-mono text-[10px] font-semibold text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded border border-slate-200">
                                  {subTid}
                                </span>
                              </td>

                              {/* Subtask Name */}
                              <td className="px-5 py-2.5 max-w-[280px]">
                                <p className="font-medium text-slate-700 truncate pl-4">{subtask.title}</p>
                                {subtask.description && (
                                  <p className="text-[10px] text-slate-400 truncate mt-0.5 pl-4">{subtask.description}</p>
                                )}
                              </td>

                              {/* Assignee */}
                              <td className="px-5 py-2.5">
                                {subtask.assigned_to_name ? (
                                  <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarColor(subtask.assigned_to_name)} flex items-center justify-center text-white text-[9px] font-bold shrink-0 shadow-sm`}>
                                      {subInitials}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-slate-700 truncate">{subtask.assigned_to_name}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                                )}
                              </td>

                              {/* Priority */}
                              <td className="px-5 py-2.5">
                                <PriorityBadge priority={subtask.priority as TaskPriority} />
                              </td>

                              {/* Due Date */}
                              <td className="px-5 py-2.5 text-center whitespace-nowrap">
                                {subtask.due_date ? (
                                  <div className={`inline-flex items-center gap-1 text-[11px] font-medium ${subOver ? 'text-red-600' : 'text-slate-500'}`}>
                                    <Calendar className="w-3 h-3 shrink-0" />
                                    <span>{fmtDate(subtask.due_date)}</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400">—</span>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-5 py-2.5">
                                <StatusBadge status={subtask.status as TaskStatus} />
                              </td>

                              {/* Actions */}
                              <td className="px-5 py-2.5 text-right">
                                <div className="flex items-center justify-end">
                                  <RowMenu
                                    task={subtask}
                                    canEdit={canEdit}
                                    canDelete={canDelete}
                                    onEdit={() => { setEditTask(subtask); setDrawerOpen(true); }}
                                    onDelete={() => setDeleteTask(subtask)}
                                    onView={() => setViewTask(subtask)}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table Footer */}
          {!loading && filteredTasks.length > 0 && (
            <div className="px-6 py-3.5 border-t border-border/40 bg-slate-50/40 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{filteredTasks.length}</span> task{filteredTasks.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-4">
                {Object.entries(STATUS_CFG).map(([k, v]) => {
                  const count = filteredTasks.filter(t => t.status === k).length;
                  if (!count) return null;
                  return (
                    <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                      <span>{v.label}: <span className="font-semibold text-foreground">{count}</span></span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Drawer & Modals ─────────────────────────────────────────────── */}
      {viewTask && (
        <ViewTaskDrawer
          task={viewTask}
          subtasks={subTasksMap[viewTask.id] || []}
          onClose={() => setViewTask(null)}
        />
      )}
      {drawerOpen && (
        <TaskDrawer
          task={editTask}
          employees={employees}
          onClose={() => { setDrawerOpen(false); setEditTask(null); }}
          onSaved={loadTasks}
        />
      )}
      {deleteTask && (
        <CancelConfirm
          task={deleteTask}
          onCancel={() => setDeleteTask(null)}
          onDeleted={() => { setDeleteTask(null); loadTasks(); }}
        />
      )}
    </div>
  );
}
