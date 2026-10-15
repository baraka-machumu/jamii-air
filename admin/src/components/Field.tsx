// A labelled field with its error, wired for screen readers: the label is tied to the input, and
// the error is announced and pointed at by aria-describedby (Design Brief §13 Accessibility).
import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';

export function Field({ id, label, error, hint, ...props }: ComponentProps<typeof Input> & {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
}) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-medium">{label}</label>
      <Input id={id} aria-invalid={!!error} aria-describedby={describedBy || undefined} {...props} />
      {hint && <p id={`${id}-hint`} className="text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}
