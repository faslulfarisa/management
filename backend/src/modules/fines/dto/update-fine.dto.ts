export class UpdateFineDto {
  title?: string;
  description?: string;
  fine_amount?: number;
  deduction_mode?: 'payroll' | 'manual' | 'installment';
  payroll_month?: number;
  payroll_year?: number;
  installments?: number;
  category_id?: string;
  created_at?: string;
  change_reason?: string;
}
