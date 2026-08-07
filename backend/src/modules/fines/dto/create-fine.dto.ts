export class CreateFineDto {
  employee_id: string;
  category_id: string;
  branch_id?: string;
  title: string;
  description?: string;
  fine_amount: number;
  deduction_mode: 'payroll' | 'manual' | 'installment';
  payroll_month?: number;
  payroll_year?: number;
  installments?: number;
  reference_type?: string;
  reference_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}
