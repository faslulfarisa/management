export class SettleFineDto {
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'other';
  payment_reference?: string;
  payment_proof_url?: string;
  notes?: string;
}

export class WaiveFineDto {
  reason: string;
}

export class VerifyPaymentDto {
  verification_notes?: string;
  status: 'verified' | 'rejected';
}

export class CreateCategoryDto {
  name: string;
  code: string;
  category_type: 'disciplinary' | 'financial' | 'asset' | 'policy' | 'recovery';
  description?: string;
  branch_id?: string;
  is_payroll_deductible?: boolean;
}

export class CreateRuleDto {
  name: string;
  rule_type: 'late_arrival' | 'absent' | 'repeated_violation' | 'asset_damage' | 'custom';
  category_id?: string;
  branch_id?: string;
  trigger_count?: number;
  trigger_period?: 'daily' | 'weekly' | 'monthly';
  grace_minutes?: number;
  fine_amount?: number;
  fine_percentage?: number;
  fine_basis?: 'fixed' | 'per_day' | 'percentage';
  deduction_mode?: 'payroll' | 'manual';
}
