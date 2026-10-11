// Typed, validated configuration (Plan task 2.2, TRD SE-06). Read once at boot from the
// environment; the app refuses to start on a missing or invalid value.
//
// SR-02: the API and worker connect with DATABASE_URL as the runtime role (jamii_app). The owner
// role (MIGRATION_DATABASE_URL) is for `prisma migrate deploy` only and is never read here; a
// DATABASE_URL that logs in as the owner or a superuser is rejected.

export const NODE_ENVS = ['development', 'test', 'uat', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

/** Database roles the runtime must never use (SR-02). */
const FORBIDDEN_DB_USERS = ['jamii_owner', 'postgres'];

export class AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly databaseUrl: string;
  readonly logLevel: LogLevel;
  /** Pilot gate (BR-AC-02): registration needs an invite code. */
  readonly requireInvite: boolean;
  /** HS256 key for user access tokens (AU-02). */
  readonly jwtAccessSecret: string;
  /** HMAC key for password-reset codes (stored as HMAC, never plaintext: SR-05). */
  readonly authCodeSecret: string;
  readonly smtp: { host: string; port: number; from: string };

  constructor(values: Omit<AppConfig, 'isProduction' | 'swaggerEnabled'>) {
    this.nodeEnv = values.nodeEnv;
    this.port = values.port;
    this.databaseUrl = values.databaseUrl;
    this.logLevel = values.logLevel;
    this.requireInvite = values.requireInvite;
    this.jwtAccessSecret = values.jwtAccessSecret;
    this.authCodeSecret = values.authCodeSecret;
    this.smtp = values.smtp;
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /** OpenAPI docs are served everywhere except production (Plan task 2.3). */
  get swaggerEnabled(): boolean {
    return !this.isProduction;
  }
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Builds the config from environment variables, collecting every problem before failing. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const nodeEnv = (env.NODE_ENV ?? 'development') as NodeEnv;
  if (!NODE_ENVS.includes(nodeEnv)) problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be an integer 1–65535');

  const logLevel = (env.LOG_LEVEL ?? (nodeEnv === 'production' ? 'info' : 'debug')) as LogLevel;
  if (!LOG_LEVELS.includes(logLevel)) problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`);

  const databaseUrl = env.DATABASE_URL ?? '';
  problems.push(...checkDatabaseUrl(databaseUrl, env.MIGRATION_DATABASE_URL));

  const requireInvite = parseBoolean(env.REQUIRE_INVITE ?? 'true');
  if (requireInvite === undefined) problems.push('REQUIRE_INVITE must be true or false');

  const jwtAccessSecret = env.JWT_ACCESS_SECRET ?? '';
  if (jwtAccessSecret.length < 32) problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
  const authCodeSecret = env.AUTH_CODE_SECRET ?? '';
  if (authCodeSecret.length < 32) problems.push('AUTH_CODE_SECRET must be at least 32 characters');
  if (jwtAccessSecret && jwtAccessSecret === authCodeSecret) problems.push('JWT_ACCESS_SECRET and AUTH_CODE_SECRET must differ');

  const smtp = {
    host: env.SMTP_HOST ?? 'localhost',
    port: Number(env.SMTP_PORT ?? 1025),
    from: env.MAIL_FROM ?? 'Jamii Air <no-reply@jamii-air.local>',
  };
  if (!Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535) problems.push('SMTP_PORT must be an integer 1–65535');

  if (problems.length > 0) throw new ConfigError(problems);
  return new AppConfig({
    nodeEnv, port, databaseUrl, logLevel, requireInvite: requireInvite!, jwtAccessSecret, authCodeSecret, smtp,
  });
}

function checkDatabaseUrl(value: string, migrationUrl: string | undefined): string[] {
  if (!value) return ['DATABASE_URL is required'];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return ['DATABASE_URL is not a valid URL'];
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return ['DATABASE_URL must be a postgresql:// URL'];
  const user = decodeURIComponent(url.username);
  if (FORBIDDEN_DB_USERS.includes(user)) {
    return [`DATABASE_URL must use the runtime role (jamii_app), not ${user} (SR-02)`];
  }
  if (migrationUrl && migrationUrl === value) {
    return ['DATABASE_URL must differ from MIGRATION_DATABASE_URL (SR-02)'];
  }
  return [];
}

function parseBoolean(value: string): boolean | undefined {
  if (['true', '1'].includes(value.toLowerCase())) return true;
  if (['false', '0'].includes(value.toLowerCase())) return false;
  return undefined;
}
