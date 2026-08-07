'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, User, Laptop, Building2, Calendar, X } from 'lucide-react';

interface Assignment {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_code: string;
  asset_name: string;
  asset_code: string;
  department_id: string | null;
  department_name: string | null;
  expected_return_date: string | null;
  notes: string | null;
}

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  assignment: Assignment | null;
}

export function EditItemModal({ isOpen, onClose, onSuccess, assignment }: EditItemModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dropdowns data
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  // Form state
  const [itemName, setItemName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && assignment) {
      fetchDropdowns();
      setItemName(assignment.asset_name || '');
      setEmployeeId(assignment.employee_id || '');
      setDepartmentId(assignment.department_id || '');
      setExpectedReturnDate(assignment.expected_return_date ? assignment.expected_return_date.split('T')[0] : '');
      setNotes(assignment.notes || '');
      setError('');
    }
  }, [isOpen, assignment]);

  const fetchDropdowns = async () => {
    try {
      const [empRes, deptsRes] = await Promise.all([
        api.get('/employees', { params: { limit: 1000, status: 'active' } }),
        api.get('/departments'),
      ]);
      setEmployees(empRes.data.data || []);
      setDepartments(deptsRes.data.data || []);
    } catch (err: any) {
      console.error('Failed to load dropdown options:', err);
    }
  };

  const handleEmployeeChange = (empId: string) => {
    setEmployeeId(empId);
    if (!empId) {
      setDepartmentId('');
      return;
    }
    const emp = employees.find(e => e.id === empId);
    if (emp) {
      const matchedDept = departments.find(d => d.name === emp.department_name || d.id === emp.department_id);
      if (matchedDept) setDepartmentId(matchedDept.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment) return;
    if (!employeeId || !itemName.trim()) {
      setError('Please select an employee and enter an item name.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.patch(`/assets/assignments/${assignment.id}`, {
        item_name: itemName.trim(),
        employee_id: employeeId,
        expected_return_date: expectedReturnDate || undefined,
        notes: notes || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update assignment.');
    } finally {
      setLoading(false);
    }
  };

  if (!assignment) return null;

  const selectedDeptName = departments.find(d => d.id === departmentId)?.name || '';

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
                Edit Assignment
              </h2>
              <p className="text-xs text-white/70 mt-0.5">
                Update asset assignment for <span className="font-semibold text-white">{assignment.asset_name}</span> ({assignment.asset_code})
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
          {/* Field 1: Employee */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              EMPLOYEE *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <User className="w-4 h-4" />
              </span>
              <select
                className="w-full text-sm border rounded-xl pl-10 pr-10 py-2.5 bg-transparent outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all appearance-none cursor-pointer"
                value={employeeId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
              >
                <option value="">-- Choose Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code || 'No Code'})
                  </option>
                ))}
              </select>
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">
                ▼
              </span>
            </div>
          </div>

          {/* Field 2: Item Name */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              ITEM NAME *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Laptop className="w-4 h-4" />
              </span>
              <Input
                type="text"
                placeholder="e.g. MacBook Pro, Logitech Mouse"
                className="pl-10 rounded-xl h-10 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>
          </div>

          {/* Field 3: Department */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              DEPARTMENT
            </label>
            <select
              className="w-full text-sm border rounded-xl px-3 py-2.5 bg-transparent outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all appearance-none cursor-pointer"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">-- Select Department --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {selectedDeptName && (
              <p className="text-[11px] text-blue-600 font-semibold mt-1.5 flex items-center gap-1">
                <span>✓</span> {selectedDeptName}
              </p>
            )}
          </div>

          {/* Field 4: Expected Return Date */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>EXPECTED RETURN DATE</span>
              <span className="text-[10px] font-medium text-slate-400/80 normal-case">(Optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Calendar className="w-4 h-4" />
              </span>
              <Input
                type="date"
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
                placeholder="dd-mm-yyyy"
                className="pl-10 rounded-xl h-10 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10"
              />
            </div>
          </div>

          {/* Field 5: Notes / Condition */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              NOTES / CONDITION
            </label>
            <Textarea
              rows={3}
              placeholder="Describe condition or notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl text-sm"
            />
          </div>

            <div className="pt-4 flex items-center justify-end gap-4 mt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors bg-transparent border-0 outline-none cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white hover:bg-blue-700 font-semibold rounded-full px-6 py-2.5 h-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
