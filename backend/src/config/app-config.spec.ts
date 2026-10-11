import { ConfigError, loadConfig } from './app-config.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://jamii_app:secret@localhost:5432/jamii_air',
  MIGRATION_DATABASE_URL: 'postgresql://jamii_owner:secret@localhost:5432/jamii_air',
};

function problems(env: NodeJS.ProcessEnv): string[] {
  try {
    loadConfig(env);
    return [];
  } catch (e) {
    return (e as ConfigError).problems;
  }
}

describe('loadConfig', () => {
  it('loads a valid environment with defaults', () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({ nodeEnv: 'development', port: 3000, logLevel: 'debug', requireInvite: true });
    expect(config.swaggerEnabled).toBe(true);
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
  });

  it('refuses the owner or superuser role at runtime (SR-02)', () => {
    expect(problems({ ...valid, DATABASE_URL: valid.MIGRATION_DATABASE_URL })).toEqual([
      'DATABASE_URL must use the runtime role (jamii_app), not jamii_owner (SR-02)',
    ]);
    expect(problems({ ...valid, DATABASE_URL: 'postgresql://postgres:x@localhost/jamii_air' })[0]).toMatch(/not postgres/);
  });

  it('collects every problem at once', () => {
    expect(problems({ NODE_ENV: 'staging', PORT: 'abc', REQUIRE_INVITE: 'maybe' })).toEqual([
      'NODE_ENV must be one of development, test, uat, production',
      'PORT must be an integer 1–65535',
      'DATABASE_URL is required',
      'REQUIRE_INVITE must be true or false',
    ]);
  });
});
