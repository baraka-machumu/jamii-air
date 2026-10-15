// The reason note every moderation action asks for (App Flow §15.4 step 3a: "reason note →
// confirm"). One dialog for all of them, because the shape is always the same: say what will
// happen, take a note, confirm or cancel.
//
// The note is required by the server (`fn__require_note`), so Confirm stays disabled until
// something is typed: a disabled button with the reason beside it is kinder than a round trip that
// comes back NOTE_REQUIRED.
import { useState, type ReactNode } from 'react';
import { errorMessage } from '@/api/errors';
import type { NoteInput } from '@/api/moderation';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const NOTE_MAX = 500;

export function NoteDialog({
  title, description, confirmLabel, destructive, pending, error, extra, onConfirm, onClose,
}: {
  title: string;
  /** What the action does, in the admin's words - it is the last thing read before confirming. */
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  error?: unknown;
  /** An extra control above the buttons, such as "Resolve the report as well". */
  extra?: ReactNode;
  onConfirm: (input: Pick<NoteInput, 'note'>) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const trimmed = note.trim();

  return (
    <Modal title={title} description={description} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onConfirm({ note: trimmed });
        }}
      >
        <label htmlFor="moderation-note" className="block font-medium">Reason</label>
        <Textarea
          id="moderation-note"
          className="mt-1.5"
          value={note}
          maxLength={NOTE_MAX}
          required
          aria-describedby="moderation-note-hint"
          onChange={(event) => setNote(event.target.value)}
        />
        <p id="moderation-note-hint" className="mt-1 text-muted-foreground">
          Recorded in the audit log with your name. {NOTE_MAX - note.length} characters left.
        </p>

        {extra && <div className="mt-3">{extra}</div>}
        {error ? <p role="alert" className="mt-3 text-destructive">{errorMessage(error)}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={!trimmed || pending}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
