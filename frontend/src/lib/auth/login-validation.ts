import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(6, 'Password must be at least 6 characters');

export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Email or username is required');

export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
});

export const adminLoginSchema = loginSchema.extend({
  companyCode: z
    .string()
    .trim()
    .min(1, 'Company code is required')
    .max(50, 'Company code must be 50 characters or fewer'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type AdminLoginFormData = z.infer<typeof adminLoginSchema>;
