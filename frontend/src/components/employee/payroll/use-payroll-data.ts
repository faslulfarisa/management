'use client';

import { useQuery } from '@tanstack/react-query';
import { employeeApi } from '@/lib/employee-api';

/**
 * Shared data hook for the employee payroll experience. Fetches the payslip
 * history, the latest payslip's enriched detail, the employee's masked bank
 * accounts, and recent overtime requests — used by both the desktop and
 * mobile payroll layouts so every panel renders from the same data.
 */
export function usePayrollData() {
  const payslipsQuery = useQuery({
    queryKey: ['employee-payslips'],
    queryFn: () => employeeApi.getPayslips({ limit: 12 }),
    staleTime: 5 * 60_000,
  });

  const payslips = payslipsQuery.data?.data ?? [];
  const latest = payslips[0];

  const detailQuery = useQuery({
    queryKey: ['payslip-detail', latest?.id],
    queryFn: () => employeeApi.getPayslipDetail(latest!.id),
    enabled: !!latest?.id,
    staleTime: 5 * 60_000,
  });

  const bankAccountsQuery = useQuery({
    queryKey: ['employee-bank-accounts'],
    queryFn: () => employeeApi.getBankAccounts(),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const otRequestsQuery = useQuery({
    queryKey: ['employee-my-overtime-requests'],
    queryFn: () => employeeApi.getMyOvertimeRequests({ limit: 10 }),
    staleTime: 5 * 60_000,
    retry: false,
  });

  return {
    payslips,
    latest,
    detail: detailQuery.data,
    bankAccounts: bankAccountsQuery.data ?? [],
    otRequests: otRequestsQuery.data?.data ?? [],
    isLoading: payslipsQuery.isLoading,
    isDetailLoading: detailQuery.isLoading,
  };
}

export type PayrollData = ReturnType<typeof usePayrollData>;
