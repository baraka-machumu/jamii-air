// Story E0-05: the harness itself and the sample procedure fn_ping.
import { app, createUser, expectJa, inRollback, one, q, randomId } from './helpers.ts';

describe('test harness', () => {
  it('connects as jamii_app', async () => {
    expect(await one('SELECT current_user AS who')).toEqual({ who: 'jamii_app' });
  });

  it('runs a test inside a rolled-back transaction', async () => {
    const username = await inRollback(async (client) => {
      const user = await createUserOn(client);
      expect(await q('SELECT 1 FROM users WHERE id = $1', [user], client)).toHaveLength(1);
      return user;
    });
    expect(await q('SELECT 1 FROM users WHERE id = $1', [username])).toHaveLength(0);
  });
});

describe('fn_ping', () => {
  it('returns pong for an existing user', async () => {
    const user = await createUser();
    expect(await one('SELECT fn_ping($1) AS reply', [user.id])).toEqual({ reply: 'pong' });
  });

  it('raises JA404 USER_NOT_FOUND for a null or unknown id', async () => {
    await expectJa(app.query('SELECT fn_ping(NULL)'), 'JA404', 'USER_NOT_FOUND');
    await expectJa(app.query('SELECT fn_ping($1)', [randomId()]), 'JA404', 'USER_NOT_FOUND');
  });
});

async function createUserOn(client: Parameters<typeof q>[2]): Promise<string> {
  const name = `tx${Date.now().toString(36)}`;
  const row = await one(
    `SELECT user_id FROM fn_register_user($1, $2, '$argon2id$v=19$x', '1990-01-01', NULL, 'en', false,
       repeat('a', 64), now() + interval '1 day', NULL)`,
    [`${name}@example.test`, name],
    client,
  );
  return row.user_id;
}
