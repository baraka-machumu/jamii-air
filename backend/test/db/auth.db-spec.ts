// E1 Accounts & access (Plan task 1.4): stories E1-01 … E1-07.
import {
  ARGON, app, createUser, daysFromNow, expectJa, expectSqlState, hash, one, owner, q, randomId,
  setUserStatus, uniq, yearsAgo,
} from './helpers.ts';

async function createInvite(opts: { maxUses?: number; expiresAt?: Date | null; revoked?: boolean } = {}): Promise<string> {
  const code = uniq('INV').toUpperCase();
  await owner.query(
    `INSERT INTO invite_codes (code, max_uses, expires_at, revoked_at) VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END)`,
    [code, opts.maxUses ?? 1, opts.expiresAt ?? null, opts.revoked ?? false],
  );
  return code;
}

function register(opts: { username?: string; email?: string; dob?: string; invite?: string | null; requireInvite?: boolean }) {
  const username = opts.username ?? uniq('reg');
  return app.query(
    `SELECT * FROM fn_register_user($1, $2, $3, $4::date, $5, 'en', $6, $7, $8, 'vitest')`,
    [opts.email ?? `${username}@example.test`, username, ARGON, opts.dob ?? yearsAgo(25), opts.invite ?? null,
      opts.requireInvite ?? true, hash(), daysFromNow(30)],
  );
}

describe('E1-01 users_auth tables and constraints', () => {
  it('rejects a 17-year-old date of birth with the CHECK, even when written directly', async () => {
    await expectSqlState(owner.query(
      `INSERT INTO users (username, email, password_hash, date_of_birth, terms_accepted_at)
       VALUES ($1, $2, $3, $4, now())`, [uniq('kid'), `${uniq()}@example.test`, ARGON, yearsAgo(17)]), '23514');
  });

  it('does not allow Amina and amina to both exist', async () => {
    const name = uniq('Amina');
    await createUser({ username: name });
    await expectJa(register({ username: name.toLowerCase(), requireInvite: false }), 'JA409', 'USERNAME_TAKEN');
  });

  it('enforces the username format and Argon2id-only password hashes', async () => {
    await expectSqlState(register({ username: 'ab', requireInvite: false }), '23514');
    await expectSqlState(register({ username: 'has space', requireInvite: false }), '23514');
    await expectSqlState(owner.query(
      `INSERT INTO users (username, email, password_hash, date_of_birth, terms_accepted_at)
       VALUES ($1, $2, 'plaintext', '1990-01-01', now())`, [uniq(), `${uniq()}@example.test`]), '23514');
  });
});

describe('E1-02 fn_register_user', () => {
  it('creates the user and the first session with a valid invite, consuming it', async () => {
    const code = await createInvite();
    const row = (await register({ invite: code.toLowerCase() })).rows[0];
    expect(row.user_id).toBeTruthy();
    expect(row.family_id).toBeTruthy();
    const token = await one('SELECT user_id, family_id FROM refresh_tokens WHERE family_id = $1', [row.family_id], owner);
    expect(token.user_id).toBe(row.user_id);
    expect(await one('SELECT use_count FROM invite_codes WHERE code = $1', [code], owner)).toEqual({ use_count: 1 });
  });

  it('rejects missing, used, expired, revoked and unknown invites without creating anything', async () => {
    const used = await createInvite();
    await register({ invite: used });
    const expired = await createInvite({ expiresAt: new Date(Date.now() - 1000) });
    const revoked = await createInvite({ revoked: true });
    for (const invite of [null, used, expired, revoked, 'NOPE-NOPE']) {
      const username = uniq('inv');
      await expectJa(register({ username, invite }), 'JA400', 'INVITE_INVALID');
      expect(await q('SELECT 1 FROM users WHERE username = $1', [username], owner)).toHaveLength(0);
    }
  });

  it('turns away anyone under 18 without consuming the invite', async () => {
    const code = await createInvite();
    await expectJa(register({ invite: code, dob: yearsAgo(18, 1) }), 'JA422', 'UNDER_MINIMUM_AGE');
    expect(await one('SELECT use_count FROM invite_codes WHERE code = $1', [code], owner)).toEqual({ use_count: 0 });
    await register({ invite: code, dob: yearsAgo(18) }); // exactly 18 today is allowed
  });

  it('rejects a username or email that exists in any letter case', async () => {
    const user = await createUser();
    await expectJa(register({ username: user.username.toUpperCase(), requireInvite: false }), 'JA409', 'USERNAME_TAKEN');
    await expectJa(register({ email: user.email.toUpperCase(), requireInvite: false }), 'JA409', 'EMAIL_TAKEN');
  });

  it('lets exactly one of two parallel registrations use a single-use invite', async () => {
    const code = await createInvite();
    const results = await Promise.allSettled([register({ invite: code }), register({ invite: code })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason.message).toBe('INVITE_INVALID');
  });

  it('accepts only hashes: a plaintext refresh token is rejected by the CHECK (SR-05)', async () => {
    await expectSqlState(app.query(
      `SELECT * FROM fn_register_user($1, $2, $3, '1990-01-01', NULL, 'en', false, 'not-a-hash', now() + interval '1 day', NULL)`,
      [`${uniq()}@example.test`, uniq(), ARGON]), '23514');
  });
});

describe('E1-03 login and session creation', () => {
  it('finds the candidate by username or email in any letter case, and nothing for unknown identifiers', async () => {
    const user = await createUser();
    for (const identifier of [user.username, user.username.toUpperCase(), user.email.toUpperCase(), ` ${user.email} `]) {
      const row = await one('SELECT * FROM fn_get_login_candidate($1)', [identifier]);
      expect(row).toMatchObject({ user_id: user.id, password_hash: ARGON, status: 'ACTIVE', deletion_requested_at: null });
    }
    expect(await q('SELECT * FROM fn_get_login_candidate($1)', ['nobody-here'])).toEqual([]);
  });

  it('creates a new family and updates last_active_at', async () => {
    const user = await createUser();
    await owner.query(`UPDATE users SET last_active_at = now() - interval '1 day' WHERE id = $1`, [user.id]);
    const { family_id } = await one(`SELECT * FROM fn_create_session($1, $2, $3, 'ua', false)`, [user.id, hash(), daysFromNow(30)]);
    expect(family_id).not.toBe(user.familyId);
    const { recent } = await one(`SELECT last_active_at > now() - interval '1 minute' AS recent FROM users WHERE id = $1`, [user.id], owner);
    expect(recent).toBe(true);
  });

  it('rejects suspended accounts and pending-deletion accounts unless deletion is cancelled', async () => {
    const suspended = await createUser();
    await setUserStatus(suspended.id, 'SUSPENDED');
    await expectJa(app.query('SELECT * FROM fn_create_session($1, $2, $3, NULL, true)', [suspended.id, hash(), daysFromNow(30)]),
      'JA403', 'ACCOUNT_SUSPENDED');

    const leaving = await createUser();
    await setUserStatus(leaving.id, 'PENDING_DELETION');
    await expectJa(app.query('SELECT * FROM fn_create_session($1, $2, $3, NULL, false)', [leaving.id, hash(), daysFromNow(30)]),
      'JA401', 'ACCOUNT_NOT_ACTIVE');
    await one('SELECT * FROM fn_create_session($1, $2, $3, NULL, true)', [leaving.id, hash(), daysFromNow(30)]);
    expect(await one('SELECT status, deletion_requested_at FROM users WHERE id = $1', [leaving.id], owner))
      .toEqual({ status: 'ACTIVE', deletion_requested_at: null });

    await expectJa(app.query('SELECT * FROM fn_create_session($1, $2, $3, NULL, false)', [randomId(), hash(), daysFromNow(30)]),
      'JA404', 'USER_NOT_FOUND');
  });
});

describe('E1-04 fn_rotate_refresh_token', () => {
  const rotate = (oldHash: string, newHash = hash()) =>
    one('SELECT * FROM fn_rotate_refresh_token($1, $2, $3)', [oldHash, newHash, daysFromNow(30)]);

  it('rotates a valid token within the same family', async () => {
    const user = await createUser();
    const next = hash();
    expect(await rotate(user.refreshHash, next)).toEqual({ outcome: 'OK', user_id: user.id, family_id: user.familyId });
    const old = await one('SELECT revoked_at IS NOT NULL AS revoked, replaced_by_id FROM refresh_tokens WHERE token_hash = $1', [user.refreshHash], owner);
    expect(old.revoked).toBe(true);
    const fresh = await one('SELECT id, family_id FROM refresh_tokens WHERE token_hash = $1', [next], owner);
    expect(fresh.family_id).toBe(user.familyId);
    expect(old.replaced_by_id).toBe(fresh.id);
  });

  it('detects reuse and revokes the whole family, and the revocation persists', async () => {
    const user = await createUser();
    const next = hash();
    await rotate(user.refreshHash, next);
    expect((await rotate(user.refreshHash)).outcome).toBe('REUSE_DETECTED');
    // committed (the function returned instead of raising): the stolen-from successor is dead too
    expect((await rotate(next)).outcome).toBe('INVALID');
    expect(await one('SELECT count(*)::int AS live FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL',
      [user.familyId], owner)).toEqual({ live: 0 });
  });

  it('reports EXPIRED, INVALID and NOT_ACTIVE', async () => {
    const user = await createUser();
    await owner.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, [user.refreshHash]);
    expect((await rotate(user.refreshHash)).outcome).toBe('EXPIRED');
    expect(await rotate(hash())).toEqual({ outcome: 'INVALID', user_id: null, family_id: null });

    for (const status of ['SUSPENDED', 'PENDING_DELETION'] as const) {
      const other = await createUser();
      await setUserStatus(other.id, status);
      expect((await rotate(other.refreshHash)).outcome).toBe('NOT_ACTIVE');
      expect(await one('SELECT count(*)::int AS live FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL',
        [other.familyId], owner)).toEqual({ live: 0 });
    }
  });

  it('gives OK to one of two parallel rotations and REUSE_DETECTED to the other', async () => {
    const user = await createUser();
    const outcomes = (await Promise.all([rotate(user.refreshHash), rotate(user.refreshHash)])).map((r) => r.outcome);
    expect(outcomes).toHaveLength(2);
    expect(outcomes).toEqual(expect.arrayContaining(['OK', 'REUSE_DETECTED']));
  });
});

describe('E1-05 fn_revoke_session', () => {
  it('revokes the family and removes this installation’s push token, leaving other devices alone', async () => {
    const user = await createUser();
    const { family_id: otherFamily } = await one('SELECT * FROM fn_create_session($1, $2, $3, NULL, false)', [user.id, hash(), daysFromNow(30)]);
    const install = uniq('inst');
    await owner.query(
      `INSERT INTO device_push_tokens (installation_id, user_id, expo_push_token, platform) VALUES ($1, $2, 'ExponentPushToken[x]', 'ANDROID')`,
      [install, user.id]);

    expect(await one('SELECT * FROM fn_revoke_session($1, $2)', [user.refreshHash, install])).toEqual({ revoked: true });
    expect(await q('SELECT 1 FROM device_push_tokens WHERE installation_id = $1', [install], owner)).toHaveLength(0);
    expect(await one('SELECT count(*)::int AS live FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL', [otherFamily], owner))
      .toEqual({ live: 1 });
  });

  it('returns revoked = false for unknown or already revoked tokens', async () => {
    const user = await createUser();
    await one('SELECT * FROM fn_revoke_session($1, NULL)', [user.refreshHash]);
    expect(await one('SELECT * FROM fn_revoke_session($1, NULL)', [user.refreshHash])).toEqual({ revoked: false });
    expect(await one('SELECT * FROM fn_revoke_session($1, NULL)', [hash()])).toEqual({ revoked: false });
  });
});

describe('E1-06 fn_update_profile', () => {
  const update = (viewer: string, patch: object) => app.query('SELECT * FROM fn_update_profile($1, $2)', [viewer, JSON.stringify(patch)]);

  it('changes only the keys present in the patch', async () => {
    const user = await createUser();
    await update(user.id, { displayName: 'Neema Shop', bio: 'Vitenge & more' });
    const row = (await update(user.id, { bio: null })).rows[0];
    expect(row).toMatchObject({ user_id: user.id, username: user.username, display_name: 'Neema Shop', bio: null, locale: 'en' });
    expect((await update(user.id, { locale: 'sw', ignored: 1 })).rows[0]).toMatchObject({ display_name: 'Neema Shop', locale: 'sw' });
  });

  it('rejects a username taken in any letter case, and an invalid one via the CHECK', async () => {
    const [a, b] = [await createUser(), await createUser()];
    await expectJa(update(a.id, { username: b.username.toUpperCase() }), 'JA409', 'USERNAME_TAKEN');
    await expectSqlState(update(a.id, { username: 'no spaces allowed' }), '23514');
    const renamed = uniq('New');
    expect((await update(a.id, { username: renamed })).rows[0].username).toBe(renamed);
  });

  it('rejects suspended viewers', async () => {
    const user = await createUser();
    await setUserStatus(user.id, 'SUSPENDED');
    await expectJa(update(user.id, { bio: 'x' }), 'JA403', 'ACCOUNT_SUSPENDED');
  });
});

describe('E1-07 password reset', () => {
  it('stores the code hash and returns where to send it; nothing for unknown emails', async () => {
    const user = await createUser({ locale: 'sw' });
    expect(await one('SELECT * FROM fn_create_password_reset($1, $2, $3)', [user.email.toUpperCase(), hash(), daysFromNow(1)]))
      .toEqual({ user_id: user.id, email: user.email, locale: 'sw' });
    expect(await q('SELECT * FROM fn_create_password_reset($1, $2, $3)', ['nobody@example.test', hash(), daysFromNow(1)])).toEqual([]);
  });

  it('resets the password, uses the code and revokes every session', async () => {
    const user = await createUser();
    const code = hash();
    await one('SELECT * FROM fn_create_password_reset($1, $2, $3)', [user.email, code, daysFromNow(1)]);
    const newHash = '$argon2id$v=19$new';
    expect(await one('SELECT * FROM fn_reset_password($1, $2, $3)', [user.email, code, newHash])).toEqual({ outcome: 'OK' });
    expect(await one('SELECT password_hash FROM users WHERE id = $1', [user.id], owner)).toEqual({ password_hash: newHash });
    expect(await one('SELECT count(*)::int AS live FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [user.id], owner))
      .toEqual({ live: 0 });
    expect(await one('SELECT * FROM fn_reset_password($1, $2, $3)', [user.email, code, ARGON])).toEqual({ outcome: 'INVALID_CODE' });
  });

  it('counts wrong attempts and kills the code after 5, even if the right code follows', async () => {
    const user = await createUser();
    const code = hash();
    await one('SELECT * FROM fn_create_password_reset($1, $2, $3)', [user.email, code, daysFromNow(1)]);
    const outcomes: string[] = [];
    for (let i = 0; i < 5; i++) outcomes.push((await one('SELECT * FROM fn_reset_password($1, $2, $3)', [user.email, hash(), ARGON])).outcome);
    expect(outcomes).toEqual(['INVALID_CODE', 'INVALID_CODE', 'INVALID_CODE', 'INVALID_CODE', 'TOO_MANY_ATTEMPTS']);
    expect(await one('SELECT * FROM fn_reset_password($1, $2, $3)', [user.email, code, ARGON])).toEqual({ outcome: 'TOO_MANY_ATTEMPTS' });
  });

  it('fails for an expired code, and an earlier code stops working when a new one is issued', async () => {
    const user = await createUser();
    const first = hash();
    await one('SELECT * FROM fn_create_password_reset($1, $2, $3)', [user.email, first, daysFromNow(1)]);
    await one('SELECT * FROM fn_create_password_reset($1, $2, $3)', [user.email, hash(), new Date(Date.now() - 1000)]);
    expect(await one('SELECT * FROM fn_reset_password($1, $2, $3)', [user.email, first, ARGON])).toEqual({ outcome: 'EXPIRED' });
  });
});
