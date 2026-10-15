import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The class merge every shadcn/ui component expects. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
