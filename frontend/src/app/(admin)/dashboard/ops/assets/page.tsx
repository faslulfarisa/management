'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Laptop,
  Mouse,
  Smartphone,
  MapPin,
  Building2,
  User,
  Trash2,
  Pencil,
  Plus,
  Search,
  ChevronDown,
  Loader2,
  Clock,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { AddItemModal } from '@/components/assets/add-item-modal';
import { EditItemModal } from '@/components/assets/edit-item-modal';
import { ReturnAssetModal } from '@/components/assets/return-asset-modal';

interface Assignment {
  id: string;
  status: string;
  assigned_at: string;
  expected_return_date: string | null;
  notes: string | null;
  asset_item_id: string;
  asset_name: string;
  asset_code: string;
  branch_name: string | null;
  asset_type_name: string;
  asset_category: string | null;
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_code: string;
  department_id: string | null;
  department_name: string | null;
}

export default function EmployeeAssetsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [returningAssignment, setReturningAssignment] = useState<Assignment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch all assignments and dropdown dependencies
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [assignmentsRes, deptsRes] = await Promise.all([
        api.get('/assets/assignments', {
          params: {
            search: searchQuery || undefined,
            department_id: selectedDept || undefined,
          },
        }),
        api.get('/departments'),
      ]);

      setAssignments(assignmentsRes.data.data || []);
      setDepartments(deptsRes.data.data || []);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to fetch assets data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchQuery, selectedDept]);

  // Helper to render appropriate minimalist line icon for asset category/name
  const getAssetIcon = (category: string | null, name: string) => {
    const normCategory = (category || '').toLowerCase();
    const normName = name.toLowerCase();

    if (normCategory === 'it_equipment' || normCategory === 'other' && (normName.includes('computer') || normName.includes('laptop'))) {
      return <Laptop className="w-4 h-4 text-blue-500 shrink-0" />;
    }
    if (normCategory === 'sim_phone' || normName.includes('phone') || normName.includes('mobile')) {
      return <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    if (normName.includes('mouse') || normName.includes('keyboard') || normName.includes('device')) {
      return <Mouse className="w-4 h-4 text-indigo-500 shrink-0" />;
    }
    return <Laptop className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  // Quick statistics calculation
  const stats = {
    total: assignments.length,
    active: assignments.filter(a => a.status === 'active').length,
    pendingRecovery: assignments.filter(a => a.status === 'recovery_pending').length,
  };

  // Delete handler
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset assignment? The asset item will be returned to the available pool.')) return;
    setDeletingId(id);
    try {
      await api.delete(`/assets/assignments/${id}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete assignment.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employee Assets</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track and manage company assets assigned to employees
          </p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          className="bg-blue-600 text-white hover:bg-blue-700 font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-all hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total Assets Assigned */}
        <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg rounded-xl border-none overflow-hidden relative group hover:shadow-xl transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">TOTAL ASSETS ASSIGNED</p>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">{stats.total}</h3>
              <p className="text-[11px] font-medium text-white/70">All assets</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <Laptop className="w-5 h-5 stroke-[2]" />
            </div>
          </CardContent>
          {/* Subtle background decoration shape */}
          <div className="absolute -right-8 -bottom-8 w-24 h-24 rounded-full bg-white/5 group-hover:scale-110 transition-transform duration-500" />
        </Card>

        {/* Card 2: Currently In Use */}
        <Card className="bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg rounded-xl border-none overflow-hidden relative group hover:shadow-xl transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">CURRENTLY IN USE</p>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">{stats.active}</h3>
              <p className="text-[11px] font-medium text-white/70">Currently active</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <CheckCircle className="w-5 h-5 stroke-[2]" />
            </div>
          </CardContent>
          {/* Subtle background decoration shape */}
          <div className="absolute -right-8 -bottom-8 w-24 h-24 rounded-full bg-white/5 group-hover:scale-110 transition-transform duration-500" />
        </Card>

        {/* Card 3: Pending Recovery */}
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg rounded-xl border-none overflow-hidden relative group hover:shadow-xl transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">PENDING RECOVERY</p>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">{stats.pendingRecovery}</h3>
              <p className="text-[11px] font-medium text-white/70">Awaiting return</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <Clock className="w-5 h-5 stroke-[2]" />
            </div>
          </CardContent>
          {/* Subtle background decoration shape */}
          <div className="absolute -right-8 -bottom-8 w-24 h-24 rounded-full bg-white/5 group-hover:scale-110 transition-transform duration-500" />
        </Card>
      </div>

      {/* Filter Card */}
      <Card className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-slate-200 focus:ring-0 text-sm h-10 w-full"
            />
          </div>

          <div className="relative w-full md:w-64 shrink-0">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="appearance-none bg-slate-50 hover:bg-slate-100/70 border-transparent rounded-xl pl-4 pr-10 py-2 text-sm font-semibold text-slate-700 outline-none cursor-pointer h-10 transition-colors w-full font-sans border-0"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>
        </CardContent>
      </Card>

      {/* Main Data Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm text-slate-500">Loading assignments...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600 bg-red-50/50 rounded-2xl m-4">
            {error}
          </div>
        ) : assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 mb-4">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No assets found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
              Try adjusting your search query, selecting different filters, or assign a new asset item.
            </p>
          </div>
        ) : (
          <Table className="border-collapse">
            <TableHeader className="bg-slate-50/50 border-b border-slate-100">
              <TableRow>
                <TableHead className="text-xs font-bold text-slate-400 uppercase tracking-wider py-4 pl-6">ITEM NAME</TableHead>
                <TableHead className="text-xs font-bold text-slate-400 uppercase tracking-wider py-4">DEPARTMENT</TableHead>
                <TableHead className="text-xs font-bold text-slate-400 uppercase tracking-wider py-4">EMPLOYEE NAME</TableHead>
                <TableHead className="text-xs font-bold text-slate-400 uppercase tracking-wider py-4 text-center pr-6">ACTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((item) => (
                <TableRow
                  key={item.id}
                  className="hover:bg-slate-50/40 border-b border-slate-100/70 transition-colors"
                >
                  <TableCell className="py-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                        {getAssetIcon(item.asset_category, item.asset_name)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm uppercase">{item.asset_name}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{item.asset_code}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm font-medium">{item.department_name || 'N/A'}</span>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {item.first_name} {item.last_name}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.employee_code}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-4 text-center pr-6">
                    <div className="flex items-center justify-center gap-1">
                      {item.status === 'recovery_pending' && (
                        <span className="text-[10px] font-bold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full mr-1">
                          Recovery Pending
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingAssignment(item)}
                        className="w-8 h-8 hover:bg-blue-50 hover:text-blue-600 text-slate-400 rounded-lg transition-colors"
                        title="Edit assignment"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="w-8 h-8 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-lg transition-colors"
                        title="Delete assignment"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add Dialog */}
      <AddItemModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={fetchData}
      />

      {/* Edit Dialog */}
      <EditItemModal
        isOpen={editingAssignment !== null}
        onClose={() => setEditingAssignment(null)}
        onSuccess={fetchData}
        assignment={editingAssignment}
      />

      {/* Return Dialog */}
      <ReturnAssetModal
        assignment={returningAssignment}
        isOpen={returningAssignment !== null}
        onClose={() => setReturningAssignment(null)}
        onSuccess={fetchData}
      />
    </div>
  );
}
