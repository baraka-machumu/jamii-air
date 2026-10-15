// Admin accounts (Plan 4.6, App Flow §15.8), super-admin only.
//
// A new admin gets a one-time temporary password shown once, to hand over securely; they enrol
// 2FA at their first sign-in (2.12) and change the password from the account menu. The portal
// never stores it: it lives in the dialog and goes when the dialog closes.
//
// A super-admin cannot demote or disable themselves - the server refuses it, and the buttons are
// not offered, so nobody finds out by being locked out.
import { useState } from 'react';
import {
  type AdminAccount, type AdminRole, type CreatedAdmin, roleLabel,
  useAdmins, useCreateAdmin, useResetTotp, useUpdateAdmin,
} from '@/api/admins';
import { errorMessage } from '@/api/errors';
import { CopyButton } from '@/components/CopyButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Field } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { NoteDialog } from '@/components/NoteDialog';
import { SkeletonRows } from '@/components/SkeletonRows';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { when } from '@/lib/moderation-labels';
import { showToast } from '@/lib/toast';
import { useSession } from '@/stores/session';

const COLUMNS = 6;

/** What the note dialog is about to do to one admin. */
type Pending =
  | { kind: 'role'; admin: AdminAccount; role: AdminRole }
  | { kind: 'status'; admin: AdminAccount; status: 'ACTIVE' | 'DISABLED' }
  | { kind: 'totp'; admin: AdminAccount };

export default function Admins() {
  const me = useSession((s) => s.admin);
  const isSuperAdmin = me?.role === 'SUPER_ADMIN';
  // Gated rather than guarded by the early return below: hooks run before it, so a moderator who
  // types the route in would otherwise still send a request only to have it refused.
  const admins = useAdmins(isSuperAdmin);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedAdmin | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  // The API refuses this page to a moderator; the sidebar hides it, but the route can still be
  // typed in (App Flow §15.9).
  if (!me || !isSuperAdmin) {
    return (
      <section>
        <h1 className="text-xl font-semibold">Admins</h1>
        <p className="mt-2 text-muted-foreground">You don’t have access to this page.</p>
      </section>
    );
  }

  const rows = admins.data ?? [];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Admins</h1>
          <p className="mt-1 text-muted-foreground">
            Everyone who can sign in to this portal. 2FA is mandatory for all of them.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Add an admin</Button>
      </div>

      {admins.isError && <ErrorBanner error={admins.error} onRetry={() => void admins.refetch()} />}

      <Table className="mt-4">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Last signed in</Th>
            <Th><span className="sr-only">Actions</span></Th>
          </tr>
        </thead>
        <tbody>
          {admins.isPending && <SkeletonRows columns={COLUMNS} rows={3} />}

          {rows.map((admin) => {
            const isMe = admin.adminId === me.id;
            return (
              <tr key={admin.adminId}>
                <Td className="font-medium">
                  {admin.displayName}
                  {isMe && <span className="ml-2 text-muted-foreground">(you)</span>}
                </Td>
                <Td className="text-muted-foreground">{admin.email}</Td>
                <Td>
                  <Select
                    aria-label={`Role for ${admin.displayName}`}
                    value={admin.role}
                    // Demoting yourself is refused by the server, so it is not offered here either.
                    disabled={isMe}
                    onChange={(event) => setPending({
                      kind: 'role', admin, role: event.target.value as AdminRole,
                    })}
                  >
                    <option value="SUPER_ADMIN">Super-admin</option>
                    <option value="MODERATOR">Moderator</option>
                  </Select>
                </Td>
                <Td>
                  <StatusBadge status={admin.status} />
                  {admin.locked && (
                    <span className="ml-2 text-warning">
                      Locked
                      <span className="sr-only"> after too many failed sign-ins</span>
                    </span>
                  )}
                  {!admin.totpEnabled && (
                    <p className="text-muted-foreground">2FA not set up yet</p>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {admin.lastLoginAt ? when(admin.lastLoginAt) : 'never'}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {admin.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isMe}
                      onClick={() => setPending({ kind: 'status', admin, status: 'DISABLED' })}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPending({ kind: 'status', admin, status: 'ACTIVE' })}
                    >
                      Enable
                    </Button>
                  )}
                  {admin.locked && admin.status === 'ACTIVE' && (
                    <Button
                      className="ml-2"
                      size="sm"
                      variant="outline"
                      onClick={() => setPending({ kind: 'status', admin, status: 'ACTIVE' })}
                    >
                      Unlock
                    </Button>
                  )}
                  <Button
                    className="ml-2"
                    size="sm"
                    variant="outline"
                    disabled={!admin.totpEnabled}
                    onClick={() => setPending({ kind: 'totp', admin })}
                  >
                    Reset 2FA
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(admin) => { setCreating(false); setCreated(admin); }}
        />
      )}

      {created && <PasswordDialog created={created} onClose={() => setCreated(null)} />}

      {pending && (
        <ChangeDialog
          key={`${pending.kind}-${pending.admin.adminId}`}
          pending={pending}
          onClose={() => setPending(null)}
          onDone={(message) => { setPending(null); showToast(message); }}
        />
      )}
    </section>
  );
}

function CreateDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (admin: CreatedAdmin) => void;
}) {
  const create = useCreateAdmin();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<AdminRole>('MODERATOR');
  const valid = /.+@.+\..+/.test(email) && displayName.trim().length > 1;

  return (
    <Modal
      title="Add an admin"
      description="They get a one-time password to sign in with, then set up 2FA and choose their own."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) {
            create.mutate({ email: email.trim(), displayName: displayName.trim(), role }, { onSuccess: onCreated });
          }
        }}
        className="space-y-3"
      >
        <Field
          id="admin-name"
          label="Name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <Field
          id="admin-email"
          label="Email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div>
          <label htmlFor="admin-role" className="block font-medium">Role</label>
          <Select
            id="admin-role"
            className="mt-1.5 w-full"
            value={role}
            onChange={(event) => setRole(event.target.value as AdminRole)}
          >
            <option value="MODERATOR">Moderator — reports, users and content</option>
            <option value="SUPER_ADMIN">Super-admin — also invite codes and admins</option>
          </Select>
        </div>

        {create.error ? <p role="alert" className="text-destructive">{errorMessage(create.error)}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" disabled={!valid || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add the admin'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The one-time password, shown once (App Flow §15.8). */
function PasswordDialog({ created, onClose }: { created: CreatedAdmin; onClose: () => void }) {
  return (
    <Modal
      title="Their one-time password"
      description="This is the only time it is shown. Hand it over in person or through something end-to-end encrypted — not email."
      onClose={onClose}
    >
      <p className="rounded-md border bg-secondary/40 p-3 text-center font-mono text-lg font-semibold tracking-wider">
        {created.temporaryPassword}
      </p>
      <p className="mt-2 text-muted-foreground">
        They will set up an authenticator app at their first sign-in, then change this password from
        the account menu. If it is lost, disable the account and add them again.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <CopyButton value={created.temporaryPassword} label="Copy the password" />
        <Button onClick={onClose}>Done, I have it</Button>
      </div>
    </Modal>
  );
}

function ChangeDialog({ pending, onClose, onDone }: {
  pending: Pending;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const update = useUpdateAdmin(pending.admin.adminId);
  const reset = useResetTotp(pending.admin.adminId);
  const who = pending.admin.displayName;

  if (pending.kind === 'totp') {
    return (
      <NoteDialog
        title={`Reset 2FA for ${who}?`}
        description="Their authenticator stops working. They set up a new one at their next sign-in, with the password they already have."
        confirmLabel="Reset 2FA"
        destructive
        pending={reset.isPending}
        error={reset.error}
        onClose={onClose}
        onConfirm={({ note }) => reset.mutate({ note }, { onSuccess: () => onDone(`2FA reset for ${who}`) })}
      />
    );
  }

  if (pending.kind === 'role') {
    return (
      <NoteDialog
        title={`Make ${who} a ${roleLabel(pending.role).toLowerCase()}?`}
        description={pending.role === 'SUPER_ADMIN'
          ? 'They will also be able to create invite codes and manage admins, including this page.'
          : 'They keep reports, users and content, and lose invite codes and admins.'}
        confirmLabel="Change the role"
        pending={update.isPending}
        error={update.error}
        onClose={onClose}
        onConfirm={({ note }) => update.mutate(
          { role: pending.role, note },
          { onSuccess: () => onDone(`${who} is now a ${roleLabel(pending.role).toLowerCase()}`) },
        )}
      />
    );
  }

  const disabling = pending.status === 'DISABLED';
  return (
    <NoteDialog
      title={disabling ? `Disable ${who}?` : `Enable ${who}?`}
      description={disabling
        ? 'They are signed out of the portal at once and cannot sign in again.'
        : 'They can sign in again. This also unlocks the account if it was locked by failed sign-ins.'}
      confirmLabel={disabling ? 'Disable' : 'Enable'}
      destructive={disabling}
      pending={update.isPending}
      error={update.error}
      onClose={onClose}
      onConfirm={({ note }) => update.mutate(
        { status: pending.status, note },
        { onSuccess: () => onDone(disabling ? `${who} is disabled` : `${who} can sign in again`) },
      )}
    />
  );
}
