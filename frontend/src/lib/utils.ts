import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export { formatCurrency } from './currency';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
