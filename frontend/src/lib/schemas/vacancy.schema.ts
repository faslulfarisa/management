import { z } from 'zod';

export const vacancySchema = z
  .object({
    title: z.string().min(2, 'Title is required'),
    branch_id: z.string().optional().or(z.literal('')),
    department_id: z.string().optional().or(z.literal('')),
    position_id: z.string().optional().or(z.literal('')),
    hiring_manager_id: z.string().optional().or(z.literal('')),
    recruiter_id: z.string().optional().or(z.literal('')),
    reporting_manager_id: z.string().optional().or(z.literal('')),
    employment_type_id: z.string().optional().or(z.literal('')),
    experience_min_years: z.coerce.number().min(0).optional().or(z.literal('' as any)),
    experience_max_years: z.coerce.number().min(0).optional().or(z.literal('' as any)),
    qualification: z.string().optional(),
    salary_min: z.coerce.number().min(0).optional().or(z.literal('' as any)),
    salary_max: z.coerce.number().min(0).optional().or(z.literal('' as any)),
    number_of_positions: z.coerce.number().int().min(1, 'At least 1 position is required').default(1),
    target_start_date: z.string().optional(),
    target_close_date: z.string().optional(),
    description: z.string().optional(),
    justification: z.string().optional(),
  })
  .refine((d) => !d.salary_min || !d.salary_max || Number(d.salary_min) <= Number(d.salary_max), {
    message: 'Max salary must be ≥ min salary', path: ['salary_max'],
  })
  .refine((d) => !d.experience_min_years || !d.experience_max_years || Number(d.experience_min_years) <= Number(d.experience_max_years), {
    message: 'Max experience must be ≥ min experience', path: ['experience_max_years'],
  });

export type VacancyFormData = z.infer<typeof vacancySchema>;
