'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ViewEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [employee, setEmployee] = useState<any>(null);
  const [lifecycle, setLifecycle] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, lifeRes] = await Promise.all([
          api.get(`/employees/${id}`),
          api.get(`/employees/${id}/lifecycle`),
        ]);
        setEmployee(empRes.data.data);
        setLifecycle(lifeRes.data.data);
      } catch (err) {
        console.error('Failed to fetch employee:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!employee) return <div className="p-8 text-center">Employee not found</div>;

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    confirmed: 'bg-blue-100 text-blue-800',
    inactive: 'bg-gray-100 text-gray-800',
    probation: 'bg-yellow-100 text-yellow-800',
  };

  const DetailRow = ({ label, value }: { label: string; value: string | null }) => (
    <div className="py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="font-medium">{value || '-'}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{employee.first_name} {employee.last_name}</h1>
          <p className="text-muted-foreground">{employee.employee_code} • {employee.designation_name || 'No designation'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/dashboard/hr/employees/${id}/edit`)}>Edit</Button>
          <Button variant="outline" onClick={() => router.back()}>Back</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Full Name" value={`${employee.first_name} ${employee.middle_name || ''} ${employee.last_name}`} />
            <DetailRow label="Date of Birth" value={employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString() : null} />
            <DetailRow label="Gender" value={employee.gender} />
            <DetailRow label="Marital Status" value={employee.marital_status} />
            <DetailRow label="Blood Group" value={employee.blood_group} />
            <DetailRow label="Nationality" value={employee.nationality} />
            <DetailRow label="Personal Email" value={employee.personal_email} />
            <DetailRow label="Personal Phone" value={employee.personal_phone} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Work Details</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Employee Code" value={employee.employee_code} />
            <DetailRow label="Status" value={
              <span className={`px-2 py-1 rounded-full text-xs ${statusColors[employee.status] || 'bg-gray-100'}`}>
                {employee.status}
              </span> as any
            } />
            <DetailRow label="Property" value={employee.property_name} />
            <DetailRow label="Department" value={employee.department_name} />
            <DetailRow label="Designation" value={employee.designation_name} />
            <DetailRow label="Employment Type" value={employee.employment_type_name} />
            <DetailRow label="Reporting Manager" value={employee.manager_name} />
            <DetailRow label="Date of Joining" value={employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString() : null} />
            <DetailRow label="Probation End" value={employee.probation_end_date ? new Date(employee.probation_end_date).toLocaleDateString() : null} />
            <DetailRow label="Confirmation Date" value={employee.confirmation_date ? new Date(employee.confirmation_date).toLocaleDateString() : null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bank & Statutory</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Bank Name" value={employee.bank_name} />
            <DetailRow label="Account Number" value={employee.bank_account_number} />
            <DetailRow label="IFSC Code" value={employee.ifsc_code} />
            <DetailRow label="PAN Number" value={employee.pan_number} />
            <DetailRow label="Aadhaar Number" value={employee.aadhaar_number} />
            <DetailRow label="PF Number" value={employee.pf_number} />
            <DetailRow label="UAN Number" value={employee.uan_number} />
            <DetailRow label="ESIC Number" value={employee.esic_number} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Lifecycle Events</CardTitle></CardHeader>
        <CardContent>
          {lifecycle.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No lifecycle events recorded</p>
          ) : (
            <div className="space-y-3">
              {lifecycle.map((event) => (
                <div key={event.id} className="flex items-start gap-4 p-3 bg-muted/30 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div className="flex-1">
                    <p className="font-medium capitalize">{event.event_type}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(event.effective_date).toLocaleDateString()}
                      {event.remarks && ` • ${event.remarks}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
