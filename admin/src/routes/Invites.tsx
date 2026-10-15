// Invite codes (Plan 4.6, App Flow §15.6). The pilot is invite-only, so this screen is how anyone
// gets into the app at all.
//
// A new code is shown once in a dialog with Copy, because that is the moment the admin has to hand
// it over. It is also in the table afterwards - the code is not a secret the way an admin password
// is - but the dialog saves hunting for the row that was just created.
import { useState } from 'react';
import { Link } from 'react-router';
import { type CreatedInvite, useCreateInvite, useInvites, useRevokeInvite } from '@/api/invites';
import { CopyButton } from '@/components/CopyButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { NoteDialog } from '@/components/NoteDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonRows } from '@/components/SkeletonRows';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/Field';
import { Table, Td, Th } from '@/components/ui/table';
import { errorMessage } from '@/api/errors';
import { when } from '@/lib/moderation-labels';
import { showToast } from '@/lib/toast';

const COLUMNS = 6;

export default function Invites() {
  const invites = useInvites();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; code: string } | null>(null);
  const rows = invites.data ?? [];

  return (
    <section>
      <PageHeader
        title="Invite codes"
        description="The app is invite-only during the pilot. A code can be used by more than one person if you let it."
        actions={<Button onClick={() => setCreating(true)}>Create a code</Button>}
      />

      {invites.isError && <ErrorBanner error={invites.error} onRetry={() => void invites.refetch()} />}

      <Table className="mt-4">
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Status</Th>
            <Th>Uses</Th>
            <Th>Expires</Th>
            <Th>Created</Th>
            <Th><span className="sr-only">Actions</span></Th>
          </tr>
        </thead>
        <tbody>
          {invites.isPending && <SkeletonRows columns={COLUMNS} />}

          {!invites.isPending && !rows.length && (
            <tr>
              <Td colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
                No codes yet. Create one to invite the first user.
              </Td>
            </tr>
          )}

          {rows.map((invite) => (
            <tr key={invite.inviteId}>
              <Td>
                <code className="font-mono font-medium">{invite.code}</code>
                <UsedBy uses={invite.usedBy} />
              </Td>
              <Td><StatusBadge status={invite.state} /></Td>
              <Td className="whitespace-nowrap tabular-nums">{invite.useCount} of {invite.maxUses}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">
                {invite.expiresAt ? when(invite.expiresAt) : 'never'}
              </Td>
              <Td className="whitespace-nowrap text-muted-foreground">
                {when(invite.createdAt)}
                {invite.createdByName && <> · {invite.createdByName}</>}
              </Td>
              <Td className="whitespace-nowrap text-right">
                <CopyButton size="sm" value={invite.code} />
                {invite.state === 'ACTIVE' && (
                  <Button
                    className="ml-2"
                    size="sm"
                    variant="outline"
                    onClick={() => setRevoking({ id: invite.inviteId, code: invite.code })}
                  >
                    Revoke
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {invites.hasNextPage && (
        <Button
          className="mt-4"
          variant="outline"
          disabled={invites.isFetchingNextPage}
          onClick={() => void invites.fetchNextPage()}
        >
          {invites.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(invite) => { setCreating(false); setCreated(invite); }}
        />
      )}

      {created && <CreatedDialog invite={created} onClose={() => setCreated(null)} />}

      {revoking && (
        <RevokeDialog
          invite={revoking}
          onClose={() => setRevoking(null)}
          onDone={() => { setRevoking(null); showToast('Invite code revoked'); }}
        />
      )}
    </section>
  );
}

/** Who has already used a code, so an admin can see where it went (App Flow §15.6). */
function UsedBy({ uses }: { uses: { userId: string; username: string; status: string; createdAt: string }[] }) {
  if (!uses.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {uses.map((use) => (
        <li key={use.userId} className="text-muted-foreground">
          <Link className="text-primary underline-offset-4 hover:underline" to={`/users/${use.userId}`}>
            @{use.username}
          </Link>
          {use.status !== 'ACTIVE' && <StatusBadge className="ml-2" status={use.status} />}
        </li>
      ))}
    </ul>
  );
}

function CreateDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (invite: CreatedInvite) => void;
}) {
  const create = useCreateInvite();
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');

  const uses = Number(maxUses);
  const valid = Number.isInteger(uses) && uses >= 1;

  return (
    <Modal
      title="Create an invite code"
      description="The code is generated by the server and shown once it exists."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          create.mutate({
            maxUses: uses,
            // A date input gives a plain day; the server decides what time of day it ends.
            ...(expiresAt ? { expiresAt } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          }, { onSuccess: onCreated });
        }}
        className="space-y-3"
      >
        <Field
          id="invite-uses"
          label="How many people can use it"
          type="number"
          min={1}
          value={maxUses}
          onChange={(event) => setMaxUses(event.target.value)}
          error={valid ? undefined : 'At least one use.'}
        />
        <Field
          id="invite-expires"
          label="Expires"
          type="date"
          value={expiresAt}
          hint="Leave empty for a code that does not expire."
          onChange={(event) => setExpiresAt(event.target.value)}
        />
        <Field
          id="invite-note"
          label="Note (optional)"
          value={note}
          hint="Who it is for. Recorded in the audit log."
          onChange={(event) => setNote(event.target.value)}
        />

        {create.error ? <p role="alert" className="text-destructive">{errorMessage(create.error)}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" disabled={!valid || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreatedDialog({ invite, onClose }: { invite: CreatedInvite; onClose: () => void }) {
  return (
    <Modal title="The code is ready" description="Hand it to the person you are inviting." onClose={onClose}>
      <p className="rounded-md border bg-secondary/40 p-3 text-center font-mono text-xl font-semibold tracking-wider">
        {invite.code}
      </p>
      <p className="mt-2 text-muted-foreground">
        {invite.maxUses === 1 ? 'One use' : `${invite.maxUses} uses`}
        {invite.expiresAt ? `, expires ${when(invite.expiresAt)}` : ', no expiry'}.
        It stays in the table, so this is not your only chance to read it.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <CopyButton value={invite.code} label="Copy the code" />
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

function RevokeDialog({ invite, onClose, onDone }: {
  invite: { id: string; code: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const revoke = useRevokeInvite(invite.id);
  return (
    <NoteDialog
      title={`Revoke ${invite.code}?`}
      description="Nobody can sign up with it after this. Anyone who already used it keeps their account."
      confirmLabel="Revoke"
      destructive
      pending={revoke.isPending}
      error={revoke.error}
      onClose={onClose}
      onConfirm={({ note }) => revoke.mutate({ note }, { onSuccess: onDone })}
    />
  );
}
