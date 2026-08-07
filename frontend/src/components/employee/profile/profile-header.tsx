'use client';

import { User } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

export function ProfileHeader() {
  const { employeeProfile } = useAuthStore();
  if (!employeeProfile) return null;

  const initials = [employeeProfile.first_name[0], employeeProfile.last_name[0]]
    .join('')
    .toUpperCase();

  const statusLabel: Record<string, string> = {
    active:     'Active',
    inactive:   'Inactive',
    probation:  'Probation',
    confirmed:  'Confirmed',
  };

  return (
    <div className="flex flex-col items-center pt-8 pb-6 px-6">
      {/* Avatar */}
      {employeeProfile.avatar_url ? (
        <img
          src={employeeProfile.avatar_url}
          alt={initials}
          className="h-20 w-20 rounded-full object-cover ring-4 ring-primary/20 mb-4"
        />
      ) : (
        <div className="h-20 w-20 rounded-full bg-primary/10 ring-4 ring-primary/20 flex items-center justify-center mb-4">
          <span className="text-2xl font-bold text-primary">{initials}</span>
        </div>
      )}

      <h2 className="text-xl font-bold text-foreground">
        {employeeProfile.first_name} {employeeProfile.last_name}
      </h2>
      {employeeProfile.designation_name && (
        <p className="text-sm text-muted-foreground mt-0.5">{employeeProfile.designation_name}</p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">
          {employeeProfile.employee_code}
        </span>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          employeeProfile.status === 'active' || employeeProfile.status === 'confirmed'
            ? 'bg-emerald-50 text-emerald-700'
            : employeeProfile.status === 'probation'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-slate-100 text-slate-600'
        }`}>
          {statusLabel[employeeProfile.status] ?? employeeProfile.status}
        </span>
      </div>
    </div>
  );
}
