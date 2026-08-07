'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { approvalsApi } from '@/lib/approvals-api';
import { employeeApi } from '@/lib/employee-api';
import { 
  Users, CheckSquare, CalendarCheck, Clock, 
  ArrowRight, CheckCircle2, XCircle, AlertCircle, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';

export default function ManagerDashboard() {
  const { employeeProfile } = useAuthStore();
  const queryClient = useQueryClient();

  const firstName = employeeProfile?.first_name ?? 'Manager';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Load count of pending approvals
  const { data: pendingCountData } = useQuery({
    queryKey: ['manager-pending-count'],
    queryFn: () => approvalsApi.getPendingCount(),
    staleTime: 30_000,
  });

  // Load first 3 pending inbox approvals
  const { data: inboxData, isLoading: loadingInbox } = useQuery({
    queryKey: ['manager-quick-inbox'],
    queryFn: () => approvalsApi.getInbox({ limit: 3, page: 1 }),
    staleTime: 30_000,
  });

  const pendingCount = pendingCountData?.count ?? 0;
  const quickRequests = inboxData?.data ?? [];

  // Mutations for quick approve/reject
  const approveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => 
      approvalsApi.approve(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['manager-quick-inbox'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => 
      approvalsApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['manager-quick-inbox'] });
    }
  });

  const handleApprove = (id: string) => {
    approveMutation.mutate({ id, reason: 'Approved via Quick Action' });
  };

  const handleReject = (id: string) => {
    rejectMutation.mutate({ id, reason: 'Rejected via Quick Action' });
  };

  return (
    <div className="space-y-6">
      {/* Greetings & Scope Banner */}
      <div className="bg-slate-900 rounded-3xl p-6 text-white relative overflow-hidden shadow-xl">
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-amber-500/10 blur-xl pointer-events-none" />
        <div className="absolute -right-4 -bottom-12 w-32 h-32 rounded-full bg-blue-500/10 blur-xl pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
          <div>
            <p className="text-amber-500 text-xs font-bold uppercase tracking-wider"> Ai-HRMS Manager Portal</p>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">{greeting}, {firstName}!</h1>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              Coordinate team shifts, approve correction cards, and keep workplace operations running seamlessly.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-4 pt-2">
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex flex-col">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Department Scope</span>
              <span className="text-sm font-bold text-slate-200 mt-0.5">{employeeProfile?.department_name || 'All'}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex flex-col">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Active Branch</span>
              <span className="text-sm font-bold text-slate-200 mt-0.5">{employeeProfile?.branch_name || 'All Branches'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Counters & Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Count Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Approvals</p>
            <p className="text-3xl font-extrabold text-slate-900">{pendingCount}</p>
            <p className="text-[11px] text-slate-400">Awaiting your evaluation</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
            <CheckSquare className="w-6 h-6" />
          </div>
        </div>

        {/* Action 1 */}
        <Link href="/manager/approvals" className="bg-white border border-slate-200/80 hover:border-amber-500/40 rounded-2xl p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inbox</p>
            <p className="text-base font-bold text-slate-800 group-hover:text-amber-600 transition-colors">Review Approvals</p>
            <p className="text-[11px] text-slate-400">Leaves, corrections & transfers</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-amber-500/10 text-slate-600 group-hover:text-amber-600 flex items-center justify-center shrink-0 transition-colors">
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Action 2 */}
        <Link href="/manager/attendance" className="bg-white border border-slate-200/80 hover:border-amber-500/40 rounded-2xl p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team Roster</p>
            <p className="text-base font-bold text-slate-800 group-hover:text-amber-600 transition-colors">Track Live Roster</p>
            <p className="text-[11px] text-slate-400">View clock-in & status logs</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-amber-500/10 text-slate-600 group-hover:text-amber-600 flex items-center justify-center shrink-0 transition-colors">
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Quick Actions Feed */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Quick Approvals</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Solve pending requests directly from your dashboard</p>
          </div>
          <Link href="/manager/approvals" className="text-xs text-amber-600 font-bold hover:underline flex items-center gap-0.5">
            Full Inbox <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingInbox ? (
          <div className="p-12 flex justify-center">
            <div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : quickRequests.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto" />
            <p className="text-xs font-bold">You're all caught up!</p>
            <p className="text-[10px]">No pending items require your immediate attention.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {quickRequests.map((req) => {
              const loadingApprove = approveMutation.isPending && approveMutation.variables?.id === req.id;
              const loadingReject = rejectMutation.isPending && rejectMutation.variables?.id === req.id;
              return (
                <div key={req.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 capitalize">
                        {req.workflow_type.replace(/_/g, ' ')}
                      </span>
                      {req.priority !== 'normal' && (
                        <span className={`text-[10px] font-bold uppercase ${req.priority === 'urgent' || req.priority === 'high' ? 'text-red-500' : 'text-slate-400'}`}>
                          {req.priority}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {formatDistanceToNow(parseISO(req.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 truncate">{req.title}</p>
                    {req.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-1">{req.description}</p>
                    )}
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={loadingApprove || loadingReject}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-red-600 bg-white hover:bg-red-50 disabled:opacity-50 flex items-center justify-center shrink-0 min-w-[70px] transition-colors"
                    >
                      {loadingReject ? 'Rejecting...' : 'Reject'}
                    </button>
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={loadingApprove || loadingReject}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center shrink-0 min-w-[70px] shadow-sm transition-colors"
                    >
                      {loadingApprove ? 'Approving...' : 'Approve'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
