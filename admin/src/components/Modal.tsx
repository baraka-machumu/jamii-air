// The portal's one modal (Design Brief §13). Moderation actions ask for a reason note and a
// confirmation, which is exactly what a modal is for: the admin must answer before anything is
// written, and the note belongs to the action, not to the screen behind it.
//
// Deliberately hand-written rather than a Radix dialog: the portal needs one overlay, and
// shadcn's dialog brings @radix-ui/react-dialog plus a focus-trap dependency for it. What matters
// for accessibility is here - a labelled `role="dialog" aria-modal`, Escape to close, the first
// field focused on open, and focus returned to whatever opened it.
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ title, description, onClose, children }: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Where focus was when the modal opened, so closing puts it back on the button that opened it
  // rather than at the top of the document.
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    // The first control inside, which for a note dialog is the textarea.
    panel.current?.querySelector<HTMLElement>('textarea, input, select, button')?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* The backdrop closes on a click, but is not a button: a screen reader has Escape and the
          dialog's own Cancel, and announcing a full-screen button would be noise. */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="relative w-full max-w-lg rounded-lg border bg-card p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        {description && <div id={descriptionId} className="mt-1 text-muted-foreground">{description}</div>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
