'use client';

import { InternalStaffTab } from '@/components/users/internal-staff-tab';

export default function StaffManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
        <p className="text-muted-foreground">Provision and manage AI-HRMS Platform staff accounts</p>
      </div>
      <InternalStaffTab />
    </div>
  );
}
